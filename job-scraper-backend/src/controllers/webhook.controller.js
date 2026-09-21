import Job from '../models/job.model.js';
import Listing from '../models/listing.model.js';
import DeliveredListing from '../models/deliveredListing.model.js';
import { fetchRunResultsPaged, fetchRunStatus } from '../services/apify.service.js';
import { launchDueSearches } from '../services/launchQueue.service.js';
import { JOB_STATUS, APIFY_TERMINAL_STATUSES, STALE_RUN_CHECK_MINUTES } from '../constants/apifyConstants.js';
import { AGENCY_MODE, REMOVAL_REASON } from '../constants/filterConstants.js';
import { DELIVERY_STATE, DELIVERY_MODE } from '../constants/deliveryConstants.js';
import { applyRuleFilters } from '../services/filter.service.js';
import { classifyCompanies } from '../services/classification.service.js';
import {
    recordCompaniesSeen,
    getKnownVerdicts,
    saveVerdicts,
    getCompaniesOnCooldown,
    markCompaniesSent,
    payloadCompanyKey,
} from '../services/company.service.js';
import { buildPayloads, deliverAll, payloadKey } from '../services/delivery.service.js';
import {
    groupByCompany,
    companyKey,
    normalizeJob,
    stripJobFields,
    listingKeyOf,
    titleKeyOf,
    capDescription,
} from '../helpers/jobHelpers.js';
import { resolveCompanyDomains } from '../services/domainLookup.service.js';
import { resolveSalaries, applySalaryFilter } from '../services/salary.service.js';
import { resolveTitles } from '../services/title.service.js';

const EVENT_TO_STATUS = {
    'ACTOR.RUN.SUCCEEDED': 'SUCCEEDED',
    'ACTOR.RUN.FAILED': 'FAILED',
    'ACTOR.RUN.ABORTED': 'ABORTED',
    'ACTOR.RUN.TIMED_OUT': 'TIMED-OUT',
};

const BATCH = 200;
const SAMPLE_CAP = 200;

// ---------------------------------------------------------------------------
// Ingestion: each page of an Apify run is normalised, deduped (unique indexes)
// and rule-filtered on arrival. Only kept listings are stored.
// ---------------------------------------------------------------------------

const incReasons = (removed) => {
    const inc = {};
    removed.forEach((r) => { inc[`removedByReason.${r.reason}`] = (inc[`removedByReason.${r.reason}`] || 0) + 1; });
    return inc;
};

const ingestPage = async (job, run, page) => {
    const normalised = page.map((item) => capDescription(stripJobFields(normalizeJob(item, run.platform, run.keyword))));
    const { kept, removed } = applyRuleFilters(normalised, job.inputs);

    const docs = kept
        .map((data) => ({
            jobId: job.jobId,
            scheduleId: job.scheduleId || null,
            platform: data.platform,
            keyword: run.keyword,
            listingKey: listingKeyOf(data) || `${data.platform}|${job.jobId}|${Math.random().toString(36).slice(2)}`,
            titleKey: titleKeyOf(data),
            companyKey: companyKey(data) || null,
            data,
        }));

    let inserted = 0;
    let duplicates = 0;
    if (docs.length) {
        try {
            const result = await Listing.insertMany(docs, { ordered: false });
            inserted = result.length;
        } catch (error) {
            // E11000 = a duplicate (same listing from another keyword, or same
            // title at the same company from the other board); the rest went in
            inserted = error.insertedDocs?.length ?? error.result?.insertedCount ?? 0;
            duplicates = docs.length - inserted;
            if (!error.writeErrors) throw error;
        }
    }

    const inc = { scrapedCount: page.length, keptCount: inserted, ...incReasons(removed) };
    if (duplicates) inc[`removedByReason.${REMOVAL_REASON.DUPLICATE_LISTING}`] = duplicates;

    await Job.updateOne(
        { jobId: job.jobId },
        {
            $inc: inc,
            $push: { removedSamples: { $each: removed.slice(0, 20), $slice: -SAMPLE_CAP } },
        }
    );
};

// Records how a run ended: ingests its results (on success) and marks it.
// Shared by the Apify webhook and the watchdog. Returns the jobId, or null.
export const applyRunOutcome = async (runId, runStatus, { fetchPaged = fetchRunResultsPaged } = {}) => {
    const job = await Job.findOne({ 'apifyRuns.runId': runId }).select('jobId scheduleId inputs apifyRuns').lean();
    if (!job) {
        console.warn(`No job found for runId ${runId}`);
        return null;
    }
    const run = job.apifyRuns.find((r) => r.runId === runId);
    if (!run || run.status !== 'RUNNING') return job.jobId;   // already handled

    if (runStatus === 'SUCCEEDED') {
        const total = await fetchPaged(runId, (page) => ingestPage(job, run, page));
        console.log(`Run ${runId} finished with ${total} listings`);
    } else {
        console.warn(`Run ${runId} ended with ${runStatus}`);
    }

    await Job.updateOne(
        { jobId: job.jobId, 'apifyRuns.runId': runId },
        { $set: { 'apifyRuns.$.status': runStatus } }
    );
    return job.jobId;
};

// After any run ends: fill the freed slot, then see whether jobs are complete.
const afterRunEnded = async (jobId, { launch = undefined } = {}) => {
    const touched = await launchDueSearches({ launch });
    touched.add(jobId);
    for (const id of touched) {
        await finishJobIfComplete(id).catch((error) => console.error(`Job ${id}: finish check failed:`, error.message));
    }
};

export const handleApifyWebhook = async (req, res) => {
    res.status(200).send('OK');

    try {
        const { eventType, resource } = req.body;
        const runId = resource?.id;
        const runStatus = EVENT_TO_STATUS[eventType];
        if (!runId || !runStatus) return;

        const jobId = await applyRunOutcome(runId, runStatus);
        if (jobId) await afterRunEnded(jobId);
    } catch (error) {
        console.error('Webhook processing error:', error.message);
    }
};

/**
 * Watchdog: runs still marked RUNNING after STALE_RUN_CHECK_MINUTES are
 * checked directly with Apify. A run whose webhook never arrived (server
 * asleep, stale PUBLIC_BASE_URL) is picked up here and its slot freed.
 */
export const reconcileStaleRuns = async ({ fetchStatus = fetchRunStatus, fetchPaged = fetchRunResultsPaged, launch = undefined } = {}) => {
    const cutoff = new Date(Date.now() - STALE_RUN_CHECK_MINUTES * 60 * 1000);
    const jobs = await Job.find({
        status: JOB_STATUS.SCRAPING,
        apifyRuns: { $elemMatch: { status: 'RUNNING', runId: { $ne: null }, $or: [{ startedAt: { $lte: cutoff } }, { startedAt: null }] } },
    }).select('jobId apifyRuns').lean();

    const ended = new Set();
    for (const job of jobs) {
        const stale = job.apifyRuns.filter((r) => r.status === 'RUNNING' && r.runId && (!r.startedAt || new Date(r.startedAt) <= cutoff));
        for (const run of stale) {
            try {
                const status = await fetchStatus(run.runId);
                if (!status) continue;
                if (APIFY_TERMINAL_STATUSES.includes(status)) {
                    console.log(`Watchdog: run ${run.runId} is ${status} on Apify, recording it`);
                    await applyRunOutcome(run.runId, status, { fetchPaged });
                    ended.add(job.jobId);
                }
            } catch (error) {
                if (error.response?.status === 404) {
                    console.warn(`Watchdog: run ${run.runId} not found on Apify, marking FAILED`);
                    await applyRunOutcome(run.runId, 'FAILED');
                    ended.add(job.jobId);
                } else {
                    console.error(`Watchdog: could not check run ${run.runId}:`, error.message);
                }
            }
        }
    }
    for (const jobId of ended) await afterRunEnded(jobId, { launch });
};

/**
 * Runs the pipeline when every search of the job has ended and nothing is
 * still queued to launch. Safe to call from anywhere; only one caller wins.
 */
export const finishJobIfComplete = async (jobId) => {
    const job = await Job.findOne({ jobId }).select('jobId status apifyRuns pendingLaunches').lean();
    if (!job || job.status !== JOB_STATUS.SCRAPING) return false;
    if (job.pendingLaunches?.length) return false;

    const allDone = job.apifyRuns.every((run) =>
        APIFY_TERMINAL_STATUSES.includes(String(run.status).toUpperCase())
    );
    if (!allDone) return false;

    const claimed = await Job.findOneAndUpdate(
        { jobId, status: JOB_STATUS.SCRAPING },
        { $set: { status: JOB_STATUS.FILTERING } },
        { returnDocument: 'after' }
    ).lean();
    if (!claimed) {
        console.log(`Job ${jobId}: pipeline already running elsewhere, skipping`);
        return false;
    }

    await runPipeline(claimed);
    return true;
};

// ---------------------------------------------------------------------------
// Pipeline helpers: everything works in batches over the Listing collection.
// ---------------------------------------------------------------------------

const setStatus = (jobId, fields) => Job.updateOne({ jobId }, { $set: fields });

// Live progress for the run page. Throttled to one write every 3 s unless done.
const progressClock = new Map();
const setProgress = async (jobId, label, done, total, { force = false } = {}) => {
    const last = progressClock.get(jobId) || 0;
    if (!force && done < total && Date.now() - last < 3000) return;
    progressClock.set(jobId, Date.now());
    await Job.updateOne({ jobId }, { $set: { progress: { label, done, total, updatedAt: new Date() } } });
};

const stageStart = (jobId, stage) => Job.updateOne({ jobId }, { $set: { [`stageTimes.${stage}.startedAt`]: new Date() } });
const stageEnd = (jobId, stage) => Job.updateOne({ jobId }, { $set: { [`stageTimes.${stage}.endedAt`]: new Date() } });

const finishEmpty = (jobId, reason) => setStatus(jobId, { status: JOB_STATUS.EMPTY, emptyReason: reason, progress: null });

// Iterates kept listings in batches (full documents).
const forEachKeptBatch = async (jobId, handler, { projection = null, size = BATCH } = {}) => {
    let lastId = null;
    for (;;) {
        const query = { jobId, kept: true, ...(lastId ? { _id: { $gt: lastId } } : {}) };
        let cursor = Listing.find(query).sort({ _id: 1 }).limit(size);
        if (projection) cursor = cursor.select(projection);
        const docs = await cursor.lean();
        if (!docs.length) break;
        await handler(docs);
        lastId = docs[docs.length - 1]._id;
        if (docs.length < size) break;
    }
};

// Writes changed `data` back for a batch of docs.
const saveBatchData = async (docs) => {
    if (!docs.length) return;
    await Listing.bulkWrite(
        docs.map((doc) => ({ updateOne: { filter: { _id: doc._id }, update: { $set: { data: doc.data, companyKey: companyKey(doc.data) || null } } } })),
        { ordered: false }
    );
};

// Marks listings dropped and counts the reason on the job.
const dropListings = async (jobId, ids, reason, samples = []) => {
    if (!ids.length) return;
    await Listing.updateMany({ _id: { $in: ids } }, { $set: { kept: false, droppedReason: reason } });
    await Job.updateOne(
        { jobId },
        {
            $inc: { [`removedByReason.${reason}`]: ids.length },
            $push: { removedSamples: { $each: samples.slice(0, 20), $slice: -SAMPLE_CAP } },
        }
    );
};

const COMPANY_PROJECTION = 'jobId companyKey data.title data.link data.location data.postedAt data.platform data.searchKeyword data.seniorityLevel data.employmentType data.salaryMinPerYear data.salaryMaxPerYear data.salaryCurrency data.salarySource data.jobTitleClean data.companyName data.companyDomain data.companyWebsite data.companyIndustry data.companyDescription data.companyEmployeesCount data.companyHeadquarters data.companyType data.companyFounded data.companyLinkedinUrl data.companyProfileUrl data.companyDomainSource data.companySpecialties data.isStaffingAgency data.agencyReason data.aiIndustry data.aiSummary data.aiSource';

/**
 * On startup: any job that was mid-pipeline when the process died is run
 * again from the top. Stages are safe to repeat (memory and cooldown stop
 * repeat spending and repeat sends). Jobs from before the Listing collection
 * existed cannot be resumed and are marked failed with a clear reason.
 */
export const resumeInterruptedJobs = async () => {
    const stuck = await Job.find({ status: { $in: [JOB_STATUS.FILTERING, JOB_STATUS.CLASSIFYING, JOB_STATUS.DELIVERING] } })
        .select('jobId status scrapedCount keptCount scrapedJobs').lean();
    for (const job of stuck) {
        const oldLayout = Array.isArray(job.scrapedJobs) && job.scrapedJobs.length > 0 && !job.keptCount;
        if (oldLayout || !(await Listing.exists({ jobId: job.jobId }))) {
            console.warn(`Job ${job.jobId}: interrupted before listing storage existed, cannot resume`);
            await setStatus(job.jobId, {
                status: JOB_STATUS.FAILED,
                progress: null,
                error: 'The server restarted while this run was in progress and it could not be resumed. Run it again with the same settings.',
            });
            continue;
        }
        console.log(`Job ${job.jobId}: resuming after restart (was ${job.status})`);
        const claimed = await Job.findOneAndUpdate({ jobId: job.jobId }, { $set: { status: JOB_STATUS.FILTERING, progress: null } }, { returnDocument: 'after' }).lean();
        runPipeline(claimed).catch((error) => console.error(`Job ${job.jobId}: resume failed:`, error.message));
    }
};

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

const runPipeline = async (job) => {
    const { jobId, inputs } = job;
    try {
        const counts = await Job.findOne({ jobId }).select('scrapedCount keptCount').lean();
        if (!counts.scrapedCount) {
            await finishEmpty(jobId, 'The job boards returned no listings for this search. Try broader titles or a wider date window.');
            return;
        }
        if (!counts.keptCount) {
            await finishEmpty(jobId, 'Every listing was removed by your filters. Loosen the company size or word filters and try again.');
            return;
        }
        console.log(`Job ${jobId}: ${counts.scrapedCount} scraped, ${counts.keptCount} kept after rules`);
        await stageEnd(jobId, 'scraping');
        await stageStart(jobId, 'filtering');

        // ---- DOMAINS, SALARIES, TITLES (per batch, written back) ----
        const domainStats = {};
        const salaryStats = {};
        const addStats = (into, from) => Object.entries(from || {}).forEach(([k, v]) => { into[k] = (into[k] || 0) + (Number(v) || 0); });
        let enriched = 0;
        await setProgress(jobId, 'Domains, salaries and titles', 0, counts.keptCount, { force: true });

        await forEachKeptBatch(jobId, async (docs) => {
            const datas = docs.map((d) => d.data);
            try { addStats(domainStats, await resolveCompanyDomains(datas, { lookup: inputs.findMissingDomains !== false })); }
            catch (error) { console.error(`Job ${jobId}: domain resolution failed:`, error.message); }
            try { addStats(salaryStats, await resolveSalaries(datas, { useClaude: inputs.extractSalaries !== false })); }
            catch (error) { console.error(`Job ${jobId}: salary extraction failed:`, error.message); }
            try { await resolveTitles(datas, { useClaude: inputs.cleanTitles !== false }); }
            catch (error) { console.error(`Job ${jobId}: title cleaning failed:`, error.message); }
            await saveBatchData(docs);

            // salary filter, per batch
            const { removed } = applySalaryFilter(datas, {
                salaryMin: inputs.salaryMin ?? null,
                salaryMax: inputs.salaryMax ?? null,
                includeNoSalary: inputs.includeNoSalary !== false,
            });
            if (removed.length) {
                const removedTitles = new Set(removed.map((r) => `${r.companyName}|${r.title}`));
                const ids = docs.filter((d) => removedTitles.has(`${d.data.companyName || null}|${d.data.title || null}`)).map((d) => d._id);
                await dropListings(jobId, ids, REMOVAL_REASON.SALARY, removed);
            }
            enriched += docs.length;
            await setProgress(jobId, 'Domains, salaries and titles', enriched, counts.keptCount);
        });
        await setProgress(jobId, 'Domains, salaries and titles', counts.keptCount, counts.keptCount, { force: true });
        await setStatus(jobId, { domainStats, salaryStats });
        console.log(`Job ${jobId}: domains ${JSON.stringify(domainStats)} salaries ${JSON.stringify(salaryStats)}`);

        // ---- COMPANY MEMORY + AGENCY CHECK ----
        const companyRows = [];
        await forEachKeptBatch(jobId, async (docs) => { companyRows.push(...docs); }, { projection: COMPANY_PROJECTION, size: 1000 });
        const companies = groupByCompany(companyRows.map((d) => d.data));

        try { await recordCompaniesSeen(companies, { jobId, scheduleId: job.scheduleId || null }); }
        catch (error) { console.error(`Job ${jobId}: could not record companies:`, error.message); }

        const useAi = inputs.agencyMode === AGENCY_MODE.FLAG || inputs.agencyMode === AGENCY_MODE.REMOVE;
        const useMemory = inputs.agencyMode !== AGENCY_MODE.OFF;

        await setStatus(jobId, { companiesCount: companies.length });
        await stageEnd(jobId, 'filtering');

        if (useMemory && companies.length) {
            await setStatus(jobId, { status: JOB_STATUS.CLASSIFYING });
            await stageStart(jobId, 'classifying');
            await setProgress(jobId, 'Looking companies up in memory', 0, companies.length, { force: true });
            const verdicts = await getKnownVerdicts(companies.map((c) => c.key));
            const toCheck = useAi ? companies.filter((c) => !verdicts.has(c.key)) : [];
            console.log(`Job ${jobId}: ${companies.length} companies, ${verdicts.size} known from memory, ${toCheck.length} to check`);
            await setStatus(jobId, { agencyCheck: { known: verdicts.size, toCheck: toCheck.length, checked: 0 } });
            await setProgress(jobId, `Checking companies with ScrapingDog (${verdicts.size} already known)`, 0, toCheck.length, { force: true });

            if (toCheck.length) {
                // verdicts are saved to company memory after every batch, so a
                // crash mid-stage keeps what was already paid for
                let savedUpTo = 0;
                const fresh = await classifyCompanies(toCheck, {}, async (checked, total, partial) => {
                    await setProgress(jobId, `Checking companies with ScrapingDog (${verdicts.size} already known)`, checked, total);
                    if (partial && partial.size > savedUpTo) {
                        const slice = new Map([...partial.entries()].slice(savedUpTo));
                        savedUpTo = partial.size;
                        try { await saveVerdicts(slice); } catch (error) { console.error(`Job ${jobId}: could not save verdicts:`, error.message); }
                    }
                    if (checked === total) await setStatus(jobId, { 'agencyCheck.checked': checked });
                });
                fresh.forEach((v, k) => verdicts.set(k, v));
            }

            const dropAgencies = inputs.agencyMode === AGENCY_MODE.REMOVE || inputs.agencyMode === AGENCY_MODE.KEYWORDS;
            const dropKnown = [];
            const dropAi = [];
            const updates = [];
            companyRows.forEach((doc) => {
                const verdict = verdicts.get(doc.companyKey || companyKey(doc.data));
                const isAgency = verdict ? (verdict.isStaffingAgency ?? null) : null;
                if (dropAgencies && isAgency === true) {
                    (verdict.cached ? dropKnown : dropAi).push(doc._id);
                    return;
                }
                updates.push({
                    updateOne: {
                        filter: { _id: doc._id },
                        update: { $set: {
                            'data.isStaffingAgency': isAgency,
                            'data.agencyReason': verdict ? `${verdict.source}: ${verdict.reason}` : null,
                            'data.aiIndustry': verdict?.industry ?? null,
                            'data.aiSummary': verdict?.summary ?? null,
                            'data.aiSource': verdict?.source ?? null,
                        } },
                    },
                });
            });
            for (let i = 0; i < updates.length; i += 500) await Listing.bulkWrite(updates.slice(i, i + 500), { ordered: false });
            await dropListings(jobId, dropKnown, REMOVAL_REASON.KNOWN_AGENCY);
            await dropListings(jobId, dropAi, REMOVAL_REASON.AI_AGENCY);
            console.log(`Job ${jobId}: agencies dropped ${dropKnown.length + dropAi.length}`);
            await stageEnd(jobId, 'classifying');
        }

        // ---- PER-COMPANY CAP ----
        const cap = Number(inputs.maxJobsPerCompany) || 0;
        if (cap > 0) {
            const seen = new Map();
            const over = [];
            await forEachKeptBatch(jobId, async (docs) => {
                docs.forEach((d) => {
                    const key = d.companyKey || String(d._id);
                    const n = (seen.get(key) || 0) + 1;
                    seen.set(key, n);
                    if (n > cap) over.push(d._id);
                });
            }, { projection: 'companyKey', size: 1000 });
            await dropListings(jobId, over, REMOVAL_REASON.PER_COMPANY_CAP);
        }

        const finalCount = await Listing.countDocuments({ jobId, kept: true });
        const companiesCount = (await Listing.distinct('companyKey', { jobId, kept: true })).filter(Boolean).length;
        await setStatus(jobId, { finalCount, companiesCount });

        if (!finalCount) {
            await finishEmpty(jobId, 'Every listing was removed by your filters. Loosen the company size or word filters and try again.');
            return;
        }

        // ---- DELIVERY (batched) ----
        await stageStart(jobId, 'delivering');
        await setProgress(jobId, 'Sending rows to your webhook', 0, finalCount, { force: true });
        await setStatus(jobId, {
            status: JOB_STATUS.DELIVERING,
            delivery: { state: DELIVERY_STATE.SENDING, total: 0, sent: 0, failed: 0, lastError: null, finishedAt: null },
        });

        const meta = { runId: jobId, scheduleId: job.scheduleId || null, sentAt: new Date().toISOString() };
        const totals = { sent: 0, failed: 0, lastError: null, total: 0 };
        const dedupeSkip = job.scheduleId && job.skipAlreadySent;
        const cooldownDays = Number(inputs.cooldownDays) || 0;

        const deliverBatch = async (payloads) => {
            if (!payloads.length) return;
            let batch = payloads;

            if (dedupeSkip) {
                const keys = batch.map((p) => payloadKey(p, inputs.deliveryMode));
                const seen = new Set((await DeliveredListing.find({ scheduleId: job.scheduleId, key: { $in: keys } }).select('key').lean()).map((r) => r.key));
                const fresh = [];
                let skipped = 0;
                batch.forEach((p, i) => { if (seen.has(keys[i])) skipped += 1; else fresh.push(p); });
                if (skipped) await Job.updateOne({ jobId }, { $inc: { [`removedByReason.${REMOVAL_REASON.ALREADY_SENT}`]: skipped } });
                batch = fresh;
            }

            if (cooldownDays > 0 && batch.length) {
                const keys = batch.map(payloadCompanyKey);
                const onCooldown = await getCompaniesOnCooldown(keys, cooldownDays);
                if (onCooldown.size) {
                    const fresh = [];
                    let held = 0;
                    batch.forEach((p, i) => { if (onCooldown.has(keys[i])) held += 1; else fresh.push(p); });
                    if (held) await Job.updateOne({ jobId }, { $inc: { [`removedByReason.${REMOVAL_REASON.COMPANY_COOLDOWN}`]: held } });
                    batch = fresh;
                }
            }
            if (!batch.length) return;

            totals.total += batch.length;
            await Job.updateOne({ jobId }, { $set: { 'delivery.total': totals.total } });

            const outcome = await deliverAll(inputs.webhookUrl, batch, async ({ sent, failed, lastError }) => {
                await Job.updateOne({ jobId }, { $set: {
                    'delivery.sent': totals.sent + sent,
                    'delivery.failed': totals.failed + failed,
                    'delivery.lastError': lastError || totals.lastError,
                } });
                await setProgress(jobId, 'Sending rows to your webhook', totals.sent + totals.failed + sent + failed, finalCount);
            });
            totals.sent += outcome.sent;
            totals.failed += outcome.failed;
            if (outcome.lastError) totals.lastError = outcome.lastError;
            await setProgress(jobId, 'Sending rows to your webhook', totals.sent + totals.failed, finalCount);

            if (outcome.sent > 0) {
                const failedIdx = new Set(outcome.failedIndexes);
                const sentPayloads = batch.filter((_, i) => !failedIdx.has(i));
                try { await markCompaniesSent(sentPayloads.map(payloadCompanyKey), jobId); }
                catch (error) { console.error(`Job ${jobId}: could not mark companies sent:`, error.message); }
                if (job.scheduleId) {
                    await DeliveredListing.insertMany(
                        sentPayloads.map((p) => ({ scheduleId: job.scheduleId, key: payloadKey(p, inputs.deliveryMode), jobId, sentAt: new Date() })),
                        { ordered: false }
                    ).catch(() => {});
                }
            }
        };

        if (inputs.deliveryMode === DELIVERY_MODE.COMPANY) {
            // one row per company: group over a description-free projection
            const rows = [];
            await forEachKeptBatch(jobId, async (docs) => { rows.push(...docs.map((d) => d.data)); }, { projection: COMPANY_PROJECTION, size: 1000 });
            const payloads = buildPayloads(rows, DELIVERY_MODE.COMPANY, meta);
            for (let i = 0; i < payloads.length; i += BATCH) await deliverBatch(payloads.slice(i, i + BATCH));
        } else {
            await forEachKeptBatch(jobId, async (docs) => {
                await deliverBatch(buildPayloads(docs.map((d) => d.data), DELIVERY_MODE.JOB, meta));
            });
        }

        if (!totals.total) {
            await finishEmpty(jobId, cooldownDays > 0
                ? `Every matching company was sent in the last ${cooldownDays} days or by this schedule already. Nothing new to send.`
                : 'Everything that matched was already sent by this schedule earlier. Nothing new to send.');
            return;
        }

        const allFailed = totals.sent === 0 && totals.failed > 0;
        await stageEnd(jobId, 'delivering');
        await setStatus(jobId, {
            progress: null,
            status: allFailed ? JOB_STATUS.FAILED : JOB_STATUS.DONE,
            error: allFailed ? `The webhook rejected every request. Last error: ${totals.lastError}` : null,
            delivery: {
                state: allFailed ? DELIVERY_STATE.FAILED : DELIVERY_STATE.DONE,
                total: totals.total, sent: totals.sent, failed: totals.failed, lastError: totals.lastError, finishedAt: new Date(),
            },
        });
        console.log(`Job ${jobId}: delivered ${totals.sent}, failed ${totals.failed}`);
    } catch (error) {
        console.error(`Pipeline failed for job ${jobId}:`, error.message);
        await setStatus(jobId, { status: JOB_STATUS.FAILED, error: error.message });
    }
};
