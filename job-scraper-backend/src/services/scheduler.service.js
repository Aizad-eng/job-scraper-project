import { randomUUID } from 'crypto';
import Schedule from '../models/schedule.model.js';
import Job from '../models/job.model.js';
import { launchSearch, launchKeyword, callbackUrl } from './search.service.js';
import { finishJobIfComplete } from '../controllers/webhook.controller.js';
import { JOB_STATUS } from '../constants/apifyConstants.js';
import { computeNextRun } from '../helpers/scheduleHelpers.js';
import { SCHEDULER_TICK_MS } from '../constants/scheduleConstants.js';

// Launches one schedule. Called by the tick loop and by "Run now".
export const runSchedule = async (schedule, { manual = false } = {}) => {
    const now = new Date();
    try {
        const job = await launchSearch(schedule.inputs, {
            scheduleId: schedule.scheduleId,
            skipAlreadySent: schedule.skipAlreadySent,
        });

        await Schedule.updateOne(
            { scheduleId: schedule.scheduleId },
            {
                $set: {
                    lastRunAt: now,
                    lastJobId: job.jobId,
                    lastError: null,
                    launching: false,
                    ...(manual ? {} : { nextRunAt: computeNextRun(schedule, now) }),
                },
                $inc: { runCount: 1 },
            }
        );

        console.log(`Schedule ${schedule.scheduleId} started job ${job.jobId}`);
        return job;
    } catch (error) {
        await Schedule.updateOne(
            { scheduleId: schedule.scheduleId },
            {
                $set: {
                    lastRunAt: now,
                    lastError: error.message,
                    launching: false,
                    ...(manual ? {} : { nextRunAt: computeNextRun(schedule, now) }),
                },
            }
        );
        console.error(`Schedule ${schedule.scheduleId} failed to start:`, error.message);
        throw error;
    }
};

// Launches queued keyword searches whose time has come (spaced launches).
const launchDueSearches = async () => {
    const now = new Date();
    const jobs = await Job.find(
        { status: JOB_STATUS.SCRAPING, pendingLaunches: { $elemMatch: { launchAt: { $lte: now } } } }
    ).select('jobId inputs pendingLaunches').lean();

    for (const job of jobs) {
        const due = job.pendingLaunches.filter((p) => new Date(p.launchAt) <= now);
        // group by keyword so both boards for a keyword go together
        const keywords = [...new Set(due.map((p) => p.keyword))];

        for (const keyword of keywords) {
            // claim: remove this keyword's pending entries first, so a slow
            // launch can never be started twice by the next tick
            const claimed = await Job.findOneAndUpdate(
                { jobId: job.jobId, 'pendingLaunches.keyword': keyword },
                { $pull: { pendingLaunches: { keyword } } },
                { returnDocument: 'before' }
            );
            if (!claimed) continue;

            const platforms = claimed.pendingLaunches.filter((p) => p.keyword === keyword).map((p) => p.platform);
            const entries = await launchKeyword({ ...job.inputs, platforms }, keyword, callbackUrl());
            await Job.updateOne({ jobId: job.jobId }, { $push: { apifyRuns: { $each: entries } } });
            console.log(`Job ${job.jobId}: launched "${keyword}" on ${platforms.join(', ')} (spaced)`);

            // a launch that failed outright sends no webhook; check completion here
            if (entries.every((e) => e.status === 'FAILED')) {
                await finishJobIfComplete(job.jobId).catch((error) =>
                    console.error(`Job ${job.jobId}: finish check failed:`, error.message)
                );
            }
        }
    }
};

const tick = async () => {
    const now = new Date();

    await launchDueSearches().catch((error) => console.error('Spaced launch failed:', error.message));

    // Claim one due schedule at a time so a slow launch never double-fires.
    for (;;) {
        const due = await Schedule.findOneAndUpdate(
            { enabled: true, launching: false, nextRunAt: { $ne: null, $lte: now } },
            { $set: { launching: true } },
            { returnDocument: 'after' }
        );
        if (!due) break;

        try {
            await runSchedule(due);
        } catch {
            /* already logged and recorded on the schedule */
        }
    }
};

let timer = null;

export const startScheduler = () => {
    if (timer) return;
    console.log(`Scheduler running (every ${SCHEDULER_TICK_MS / 1000}s)`);

    // Anything left "launching" by a crash gets released on boot.
    Schedule.updateMany({ launching: true }, { $set: { launching: false } }).catch(() => {});

    const safeTick = () => tick().catch((error) => console.error('Scheduler tick failed:', error.message));
    safeTick();
    timer = setInterval(safeTick, SCHEDULER_TICK_MS);
    timer.unref();
};

export const newScheduleId = () => randomUUID();
