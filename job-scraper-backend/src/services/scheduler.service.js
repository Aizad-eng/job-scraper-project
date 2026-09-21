import { randomUUID } from 'crypto';
import Schedule from '../models/schedule.model.js';
import { launchSearch } from './search.service.js';
import { launchDueSearches } from './launchQueue.service.js';
import { finishJobIfComplete, reconcileStaleRuns } from '../controllers/webhook.controller.js';
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

const tick = async () => {
    const now = new Date();

    // 1. free slots held by runs whose webhook never came
    await reconcileStaleRuns().catch((error) => console.error('Watchdog failed:', error.message));

    // 2. start queued searches as slots allow
    try {
        const touched = await launchDueSearches();
        for (const jobId of touched) {
            await finishJobIfComplete(jobId).catch((error) => console.error(`Job ${jobId}: finish check failed:`, error.message));
        }
    } catch (error) {
        console.error('Queued launch failed:', error.message);
    }

    // 3. schedules due now

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
