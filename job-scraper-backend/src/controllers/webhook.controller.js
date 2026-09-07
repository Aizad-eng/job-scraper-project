import Job from '../models/job.model.js';
import { fetchRunResults } from '../services/apify.service.js';
import { JOB_STATUS, APIFY_TERMINAL_STATUSES } from '../constants/apifyConstants.js';
import { applyRuleFilters } from '../services/filter.service.js';
import { classifyCompanies } from '../services/classification.service.js';
import { groupByCompany, normalizeJob, stripJobFields } from '../helpers/jobHelpers.js';
import {
    resolveCompanies,
    searchCandidates,
    selectContacts,
    startContactExport,
    enrichWithPhones,
} from '../services/contactLookup.service.js';

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

        // ---- FIX 3: atomic update, no version conflict ----
        if (eventType === 'ACTOR.RUN.SUCCEEDED') {
            const run = job.apifyRuns.find((r) => r.runId === runId);
            const results = await fetchRunResults(runId);
            console.log(`Run ${runId} finished with ${results.length} jobs`);

            // if (run.platform === 'indeed' && results.length) {
            //     console.log('RAW INDEED KEYS:', Object.keys(results[0]));
            // }

            await Job.updateOne(
                { jobId: job.jobId, 'apifyRuns.runId': runId },
                {
                    $set: { 'apifyRuns.$.status': 'SUCCEEDED' },
                    $push: {
                        scrapedJobs: {
                            $each: results.map((item) => stripJobFields(normalizeJob(item, run.platform))),
                        },
                    },
                }
            );
        } else if (eventType === 'ACTOR.RUN.FAILED') {
            console.warn(`Run ${runId} failed`);
            await Job.updateOne(
                { jobId: job.jobId, 'apifyRuns.runId': runId },
                { $set: { 'apifyRuns.$.status': 'FAILED' } }
            );
        }

        // re-read to see the latest state after that write
        const refreshed = await Job.findOne({ jobId: job.jobId });

        const allDone = refreshed.apifyRuns.every((run) =>
            APIFY_TERMINAL_STATUSES.includes(String(run.status).toUpperCase())
        );

        if (!allDone) return;

        // ---- FIX 2: only one webhook may claim the pipeline ----
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

// everything after scraping, extracted into its own function
const runPipeline = async (job) => {
    try {
        // ---- FILTERING ----
        const { kept, removed } = applyRuleFilters(job.scrapedJobs, {
            employeeCountMin: job.inputs.employeeCountMin,
            employeeCountMax: job.inputs.employeeCountMax,
            filterKeywords: job.inputs.filterKeywords,
            filterMatchIn: job.inputs.filterMatchIn,
        });

        job.filteredJobs = kept;
        job.removedJobs = removed;
        job.markModified('filteredJobs');
        job.markModified('removedJobs');
        await job.save();

        console.log(`Job ${job.jobId}: ${job.scrapedJobs.length} scraped, ${kept.length} kept after rules`);

        if (!kept.length) {
            job.status = JOB_STATUS.EMPTY;
            job.emptyReason = 'No companies matched your filters. Try widening the employee-count range.';
            await job.save();
            return;
        }

        // ---- CLASSIFYING ----
        job.status = JOB_STATUS.CLASSIFYING;
        await job.save();

        const companies = groupByCompany(kept);
        console.log(`Classifying ${companies.length} unique companies...`);

        const { kept: cleanCompanies, removed: aiRemoved } = await classifyCompanies(companies);

        job.cleanedCompanies = cleanCompanies;
        job.removedJobs.push(...aiRemoved);
        job.markModified('cleanedCompanies');
        job.markModified('removedJobs');
        await job.save();

        console.log(`After AI: ${cleanCompanies.length} companies kept, ${aiRemoved.length} flagged as agencies`);

        // ---- FINDING CONTACTS ----
        job.status = JOB_STATUS.FINDING_CONTACTS;
        await job.save();

        const { companyIds } = await resolveCompanies(cleanCompanies);
        console.log(`Resolved ${companyIds.length} of ${cleanCompanies.length} companies in AI-Ark`);

        if (!companyIds.length) {
            job.status = JOB_STATUS.EMPTY;                                    // ← was READY
            job.emptyReason = 'Companies were found, but none matched in the contact database.';  // ← add
            await job.save();
            return;
        }

        // ---- FREE SEARCH FIRST ----
        // AI-Ark charges per record an export delivers, not per search. So we
        // look at who exists for free, pick who we want, and only pay for those.
        const candidates = await searchCandidates({
            companyIds,
            personaTitles: job.inputs.personaTitles,
        });

        const { selected, stats } = selectContacts(candidates);

        console.log(
            `Job ${job.jobId}: people search found ${stats.found}, ` +
            `${stats.droppedNoCompany} had no company, ${stats.droppedOverCap} over the per-company cap, ` +
            `${stats.selected} selected`
        );

        job.contactStats = stats;
        job.markModified('contactStats');
        await job.save();

        if (!selected.length) {
            job.status = JOB_STATUS.EMPTY;
            job.emptyReason =
                'Companies were found, but nobody at them matched your persona titles. Try broadening the titles.';
            await job.save();
            return;
        }

        if (job.inputs.needEmail) {
            // Pay for exactly the people we selected, not three times as many.
            const exportJob = await startContactExport({
                companyIds,
                personaTitles: job.inputs.personaTitles,
                size: selected.length,
                webhookUrl: `${process.env.PUBLIC_BASE_URL}/api/aiark-webhook?s=${process.env.WEBHOOK_SECRET}`,
            });

            job.aiArkExport = {
                trackId: exportJob.trackId,
                state: exportJob.state,
                requestedSize: selected.length,
            };
            job.markModified('aiArkExport');
            await job.save();

            console.log(
                `AI-Ark export started: ${exportJob.trackId} for ${selected.length} people ` +
                `(was ${companyIds.length * 2 * 3} under the old sizing)`
            );
            // pipeline resumes in the AI-Ark webhook
        } else {
            let contacts = selected;

            if (job.inputs.needPhone) {
                contacts = await enrichWithPhones(contacts);
            }

            job.contacts = contacts;
            job.status = JOB_STATUS.READY;
            job.markModified('contacts');
            await job.save();

            console.log(`Found ${contacts.length} contacts`);
        }
    } catch (error) {
        console.error(`Pipeline failed for job ${job.jobId}:`, error.message);
        job.status = JOB_STATUS.FAILED;
        job.error = error.message;
        await job.save();
    }
};