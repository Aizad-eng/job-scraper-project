import Job from '../models/job.model.js';
import DeliveredListing from '../models/deliveredListing.model.js';
import { fetchRunResults } from '../services/apify.service.js';
import { JOB_STATUS, APIFY_TERMINAL_STATUSES } from '../constants/apifyConstants.js';
import { AGENCY_MODE, REMOVAL_REASON } from '../constants/filterConstants.js';
import { DELIVERY_STATE } from '../constants/deliveryConstants.js';
import { applyRuleFilters, applyPerCompanyCap } from '../services/filter.service.js';
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
import { groupByCompany, companyKey, normalizeJob, stripJobFields, countByReason } from '../helpers/jobHelpers.js';

const EVENT_TO_STATUS = {
    'ACTOR.RUN.SUCCEEDED': 'SUCCEEDED',
    'ACTOR.RUN.FAILED': 'FAILED',
    'ACTOR.RUN.ABORTED': 'ABORTED',
    'ACTOR.RUN.TIMED_OUT': 'TIMED-OUT',
};

export const handleApifyWebhook = async (req, res) => {
    res.status(200).send('OK');

    try {
        const { eventType, resource } = req.body;
        const runId = resource?.id;
        if (!runId) return;

        const job = await Job.findOne({ 'apifyRuns.runId': runId });
        if (!job) {
            console.warn(`No job found for runId ${runId}`);
            return;
        }

        const runStatus = EVENT_TO_STATUS[eventType];
        if (!runStatus) return;

        if (runStatus === 'SUCCEEDED') {
            const run = job.apifyRuns.find((r) => r.runId === runId);
            const results = await fetchRunResults(runId);
            console.log(`Run ${runId} finished with ${results.length} jobs`);

            // atomic update, no version conflict between parallel callbacks
            await Job.updateOne(
                { jobId: job.jobId, 'apifyRuns.runId': runId },
                {
                    $set: { 'apifyRuns.$.status': 'SUCCEEDED' },
                    $push: {
                        scrapedJobs: {
                            $each: results.map((item) => stripJobFields(normalizeJob(item, run.platform, run.keyword))),
                        },
                    },
                }
            );
        } else {
            console.warn(`Run ${runId} ended with ${runStatus}`);
            await Job.updateOne(
                { jobId: job.jobId, 'apifyRuns.runId': runId },
                { $set: { 'apifyRuns.$.status': runStatus } }
            );
        }

        // re-read to see the latest state after that write
        const refreshed = await Job.findOne({ jobId: job.jobId });

        const allDone = refreshed.apifyRuns.every((run) =>
            APIFY_TERMINAL_STATUSES.includes(String(run.status).toUpperCase())
        );

        if (!allDone) return;

        // only one webhook may claim the pipeline
        const claimed = await Job.findOneAndUpdate(
            { jobId: refreshed.jobId, status: JOB_STATUS.SCRAPING },
            { $set: { status: JOB_STATUS.FILTERING } },
            { returnDocument: 'after' }
        );

        if (!claimed) {
            console.log(`Job ${refreshed.jobId}: pipeline already running elsewhere, skipping`);
            return;
        }

        await runPipeline(claimed);
    } catch (error) {
        console.error('Webhook processing error:', error.message);
    }
};

const finishEmpty = async (job, reason) => {
    job.status = JOB_STATUS.EMPTY;
    job.emptyReason = reason;
    await job.save();
};

// everything after scraping
const runPipeline = async (job) => {
    try {
        const { inputs } = job;

        if (!job.scrapedJobs.length) {
            await finishEmpty(job, 'The job boards returned no listings for this search. Try broader titles or a wider date window.');
            return;
        }

        // ---- FILTERING ----
        const rules = applyRuleFilters(job.scrapedJobs, inputs);
        let kept = rules.kept;
        const removed = [...rules.removed];

        console.log(`Job ${job.jobId}: ${job.scrapedJobs.length} scraped, ${kept.length} kept after rules`);

        // ---- COMPANY MEMORY ----
        // Every company we see is recorded, whatever the agency setting.
        const seenCompanies = groupByCompany(kept);
        try {
            await recordCompaniesSeen(seenCompanies, { jobId: job.jobId, scheduleId: job.scheduleId || null });
        } catch (error) {
            console.error(`Job ${job.jobId}: could not record companies:`, error.message);
        }

        // ---- CLASSIFYING ----
        const useAi = inputs.agencyMode === AGENCY_MODE.FLAG || inputs.agencyMode === AGENCY_MODE.REMOVE;
        const useMemory = inputs.agencyMode !== AGENCY_MODE.OFF;

        if (useMemory && kept.length) {
            job.status = JOB_STATUS.CLASSIFYING;
            job.filteredJobs = kept;
            job.removedJobs = removed;
            job.removedByReason = countByReason(removed);
            job.markModified('filteredJobs');
            job.markModified('removedJobs');
            job.markModified('removedByReason');
            await job.save();

            // What do we already know? Overrides and fresh verdicts skip the paid check.
            const verdicts = await getKnownVerdicts(seenCompanies.map((c) => c.key));
            const toCheck = useAi ? seenCompanies.filter((c) => !verdicts.has(c.key)) : [];

            console.log(
                `Job ${job.jobId}: ${seenCompanies.length} companies, ${verdicts.size} known from memory, ` +
                `${toCheck.length} to check`
            );

            if (toCheck.length) {
                const fresh = await classifyCompanies(toCheck);
                fresh.forEach((verdict, key) => verdicts.set(key, verdict));
                try {
                    await saveVerdicts(fresh);
                } catch (error) {
                    console.error(`Job ${job.jobId}: could not save verdicts:`, error.message);
                }
            }

            const next = [];
            kept.forEach((item) => {
                const verdict = verdicts.get(companyKey(item));
                const annotated = {
                    ...item,
                    // true = agency, false = direct employer, null = could not tell
                    isStaffingAgency: verdict ? (verdict.isStaffingAgency ?? null) : null,
                    agencyReason: verdict ? `${verdict.source}: ${verdict.reason}` : null,
                    aiIndustry: verdict?.industry ?? null,
                    aiSummary: verdict?.summary ?? null,
                    aiSource: verdict?.source ?? null,
                };

                const dropAgencies = inputs.agencyMode === AGENCY_MODE.REMOVE || inputs.agencyMode === AGENCY_MODE.KEYWORDS;
                if (dropAgencies && annotated.isStaffingAgency === true) {
                    removed.push({
                        companyName: item.companyName,
                        title: item.title,
                        reason: verdict.cached ? REMOVAL_REASON.KNOWN_AGENCY : REMOVAL_REASON.AI_AGENCY,
                        detail: annotated.agencyReason,
                    });
                    return;
                }
                next.push(annotated);
            });
            kept = next;

            console.log(`After agency check: ${kept.length} jobs kept`);
        } else {
            kept = kept.map((item) => ({
                ...item,
                isStaffingAgency: null,
                agencyReason: null,
            }));
        }

        // ---- PER-COMPANY CAP ----
        const capped = applyPerCompanyCap(kept, inputs.maxJobsPerCompany);
        kept = capped.kept;
        removed.push(...capped.removed);

        job.filteredJobs = kept;
        job.removedJobs = removed;
        job.removedByReason = countByReason(removed);
        job.companiesCount = groupByCompany(kept).length;
        job.markModified('filteredJobs');
        job.markModified('removedJobs');
        job.markModified('removedByReason');
        await job.save();

        if (!kept.length) {
            await finishEmpty(job, 'Every listing was removed by your filters. Loosen the company size or word filters and try again.');
            return;
        }

        // ---- DELIVERING ----
        let payloads = buildPayloads(kept, inputs.deliveryMode, {
            runId: job.jobId,
            scheduleId: job.scheduleId || null,
            sentAt: new Date().toISOString(),
        });

        // Scheduled runs skip anything this schedule already delivered.
        if (job.scheduleId && job.skipAlreadySent && payloads.length) {
            const keys = payloads.map((p) => payloadKey(p, inputs.deliveryMode));
            const seen = new Set(
                (await DeliveredListing.find({ scheduleId: job.scheduleId, key: { $in: keys } }).select('key').lean())
                    .map((row) => row.key)
            );
            const fresh = [];
            payloads.forEach((payload, i) => {
                if (seen.has(keys[i])) {
                    removed.push({
                        companyName: payload.companyName,
                        title: payload.jobTitle || payload.firstJobTitle || null,
                        reason: REMOVAL_REASON.ALREADY_SENT,
                        detail: keys[i],
                    });
                } else {
                    fresh.push(payload);
                }
            });
            payloads = fresh;

            job.removedJobs = removed;
            job.removedByReason = countByReason(removed);
            job.markModified('removedJobs');
            job.markModified('removedByReason');
            await job.save();

            if (!payloads.length) {
                await finishEmpty(job, 'Everything that matched was already sent by this schedule earlier. Nothing new to send.');
                return;
            }
        }

        // ---- COOLDOWN ----
        // A company sent to the webhook recently is held back, whatever it posts.
        if (inputs.cooldownDays > 0 && payloads.length) {
            const keys = payloads.map(payloadCompanyKey);
            const onCooldown = await getCompaniesOnCooldown(keys, inputs.cooldownDays);
            if (onCooldown.size) {
                const fresh = [];
                payloads.forEach((payload, i) => {
                    const sentAt = onCooldown.get(keys[i]);
                    if (sentAt) {
                        removed.push({
                            companyName: payload.companyName,
                            title: payload.jobTitle || payload.firstJobTitle || null,
                            reason: REMOVAL_REASON.COMPANY_COOLDOWN,
                            detail: `sent ${new Date(sentAt).toISOString().slice(0, 10)}, cooldown ${inputs.cooldownDays} days`,
                        });
                    } else {
                        fresh.push(payload);
                    }
                });
                payloads = fresh;

                job.removedJobs = removed;
                job.removedByReason = countByReason(removed);
                job.markModified('removedJobs');
                job.markModified('removedByReason');
                await job.save();

                console.log(`Job ${job.jobId}: ${onCooldown.size} companies on cooldown, ${payloads.length} rows left`);

                if (!payloads.length) {
                    await finishEmpty(job, `Every matching company was sent in the last ${inputs.cooldownDays} days. Nothing new to send.`);
                    return;
                }
            }
        }

        job.status = JOB_STATUS.DELIVERING;
        job.delivery = {
            state: DELIVERY_STATE.SENDING,
            total: payloads.length,
            sent: 0,
            failed: 0,
            lastError: null,
            finishedAt: null,
        };
        job.markModified('delivery');
        await job.save();

        console.log(`Job ${job.jobId}: sending ${payloads.length} ${inputs.deliveryMode} records to webhook`);

        const outcome = await deliverAll(inputs.webhookUrl, payloads, async ({ sent, failed, lastError }) => {
            await Job.updateOne(
                { jobId: job.jobId },
                { $set: { 'delivery.sent': sent, 'delivery.failed': failed, 'delivery.lastError': lastError } }
            );
        });

        const allFailed = outcome.sent === 0 && outcome.failed > 0;

        if (outcome.sent > 0) {
            const failed = new Set(outcome.failedIndexes);
            const sentKeys = payloads.filter((_, i) => !failed.has(i)).map(payloadCompanyKey);
            try {
                await markCompaniesSent(sentKeys, job.jobId);
            } catch (error) {
                console.error(`Job ${job.jobId}: could not mark companies sent:`, error.message);
            }
        }

        if (job.scheduleId && outcome.sent > 0) {
            const failed = new Set(outcome.failedIndexes);
            const rows = payloads
                .map((payload, i) => (failed.has(i) ? null : {
                    scheduleId: job.scheduleId,
                    key: payloadKey(payload, inputs.deliveryMode),
                    jobId: job.jobId,
                    sentAt: new Date(),
                }))
                .filter(Boolean);
            if (rows.length) {
                await DeliveredListing.insertMany(rows, { ordered: false }).catch(() => {
                    /* duplicates from an earlier run are fine */
                });
            }
        }

        await Job.updateOne(
            { jobId: job.jobId },
            {
                $set: {
                    status: allFailed ? JOB_STATUS.FAILED : JOB_STATUS.DONE,
                    error: allFailed ? `The webhook rejected every request. Last error: ${outcome.lastError}` : null,
                    'delivery.state': allFailed ? DELIVERY_STATE.FAILED : DELIVERY_STATE.DONE,
                    'delivery.sent': outcome.sent,
                    'delivery.failed': outcome.failed,
                    'delivery.lastError': outcome.lastError,
                    'delivery.finishedAt': new Date(),
                },
            }
        );

        console.log(`Job ${job.jobId}: delivered ${outcome.sent}, failed ${outcome.failed}`);
    } catch (error) {
        console.error(`Pipeline failed for job ${job.jobId}:`, error.message);
        await Job.updateOne(
            { jobId: job.jobId },
            { $set: { status: JOB_STATUS.FAILED, error: error.message } }
        );
    }
};
