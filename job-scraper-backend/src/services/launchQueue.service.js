import Job from '../models/job.model.js';
import { triggerActorRun } from './apify.service.js';
import { JOB_STATUS, MAX_ACTOR_RUNS_GLOBAL, DEFAULT_MAX_CONCURRENT_RUNS } from '../constants/apifyConstants.js';

export const callbackUrl = () =>
    `${process.env.PUBLIC_BASE_URL}/api/apify-webhook?s=${process.env.WEBHOOK_SECRET}`;

// Starts one actor run. A failed trigger becomes a FAILED entry instead of
// throwing, so one bad launch never strands the job.
export const launchOne = async (inputs, keyword, platform) => {
    try {
        const runId = await triggerActorRun(
            platform,
            {
                keyword,
                location: inputs.location,
                jobsPerKeyword: inputs.jobsPerKeyword,
                postedWithin: inputs.postedWithin,
                maxJobsPerCompany: inputs.maxJobsPerCompany,
            },
            callbackUrl()
        );
        return { runId, platform, keyword, status: 'RUNNING', startedAt: new Date() };
    } catch (error) {
        const message = error.response?.data?.error?.message || error.message;
        console.error(`Could not start ${platform} search for "${keyword}":`, message);
        return { runId: null, platform, keyword, status: 'FAILED', error: message, startedAt: new Date() };
    }
};

// How many runs are in flight right now, across every job.
export const countActiveRuns = async () => {
    const rows = await Job.aggregate([
        { $match: { status: JOB_STATUS.SCRAPING } },
        { $project: { n: { $size: { $filter: { input: '$apifyRuns', as: 'r', cond: { $eq: ['$$r.status', 'RUNNING'] } } } } } },
        { $group: { _id: null, total: { $sum: '$n' } } },
    ]);
    return rows[0]?.total || 0;
};

/**
 * Launches queued searches whose time has come, as long as there is room:
 * never more than MAX_ACTOR_RUNS_GLOBAL in flight overall, and never more
 * than the job's own maxConcurrentRuns. Oldest queued first.
 * Returns the jobIds whose queue was touched (callers run the finish check).
 */
export const launchDueSearches = async ({ onlyJobId = null, launch = launchOne } = {}) => {
    const now = new Date();
    let free = MAX_ACTOR_RUNS_GLOBAL - (await countActiveRuns());
    const touched = new Set();
    if (free <= 0) return touched;

    const filter = { status: JOB_STATUS.SCRAPING, pendingLaunches: { $elemMatch: { launchAt: { $lte: now } } } };
    if (onlyJobId) filter.jobId = onlyJobId;
    const jobs = await Job.find(filter).sort({ createdAt: 1 }).select('jobId inputs apifyRuns pendingLaunches').lean();

    for (const job of jobs) {
        if (free <= 0) break;
        const ownCap = Math.min(Number(job.inputs?.maxConcurrentRuns) || DEFAULT_MAX_CONCURRENT_RUNS, MAX_ACTOR_RUNS_GLOBAL);
        let ownActive = job.apifyRuns.filter((r) => r.status === 'RUNNING').length;
        const due = job.pendingLaunches
            .filter((p) => new Date(p.launchAt) <= now)
            .sort((a, b) => new Date(a.launchAt) - new Date(b.launchAt));

        for (const entry of due) {
            if (free <= 0 || ownActive >= ownCap) break;

            // claim: pull this exact entry first so the next tick cannot start it too
            const claimed = await Job.findOneAndUpdate(
                { jobId: job.jobId, pendingLaunches: { $elemMatch: { keyword: entry.keyword, platform: entry.platform } } },
                { $pull: { pendingLaunches: { keyword: entry.keyword, platform: entry.platform } } },
                { returnDocument: 'before' }
            );
            if (!claimed) continue;

            const run = await launch(job.inputs, entry.keyword, entry.platform);
            await Job.updateOne({ jobId: job.jobId }, { $push: { apifyRuns: run } });
            touched.add(job.jobId);
            if (run.status === 'RUNNING') {
                free -= 1;
                ownActive += 1;
            }
            console.log(`Job ${job.jobId}: launched "${entry.keyword}" on ${entry.platform} (${run.status}), ${free} slots left`);
        }
    }

    return touched;
};
