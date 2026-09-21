import Schedule from '../models/schedule.model.js';
import Job from '../models/job.model.js';
import DeliveredListing from '../models/deliveredListing.model.js';
import { parseInputs } from '../services/search.service.js';
import { runSchedule, newScheduleId } from '../services/scheduler.service.js';
import DeliveredListingModel from '../models/deliveredListing.model.js';
import {
    computeNextRun,
    describeSchedule,
    isValidTimezone,
    isValidTime,
    localDateString,
} from '../helpers/scheduleHelpers.js';
import {
    FREQUENCY,
    DEFAULT_FREQUENCY,
    DEFAULT_RUN_TIME,
    DEFAULT_TIMEZONE,
    RUNS_PER_SCHEDULE,
} from '../constants/scheduleConstants.js';
import { JOB_STATUS_LABELS } from '../constants/apifyConstants.js';

const parseScheduleFields = (body = {}) => {
    const frequency = Object.values(FREQUENCY).includes(body.frequency) ? body.frequency : DEFAULT_FREQUENCY;
    const everyDays = Math.min(Math.max(Number(body.everyDays) || 1, 1), 365);
    const weekdays = [...new Set((Array.isArray(body.weekdays) ? body.weekdays : []).map(Number))]
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .sort();
    const runTime = isValidTime(body.runTime) ? body.runTime : DEFAULT_RUN_TIME;
    const timezone = isValidTimezone(body.timezone) ? body.timezone : DEFAULT_TIMEZONE;

    if (frequency === FREQUENCY.WEEKDAYS && !weekdays.length) {
        throw new Error('Pick at least one day of the week.');
    }

    return {
        name: String(body.name || '').trim().slice(0, 120),
        frequency,
        everyDays,
        weekdays,
        runTime,
        timezone,
        skipAlreadySent: body.skipAlreadySent !== false,
        enabled: body.enabled !== false,
    };
};

const runSummary = (job) => ({
    jobId: job.jobId,
    status: job.status,
    statusLabel: JOB_STATUS_LABELS[job.status] || job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    scrapedCount: job.scrapedCount || 0,
    keptCount: job.finalCount ?? job.keptCount ?? 0,
    sent: job.delivery?.sent ?? 0,
    failed: job.delivery?.failed ?? 0,
    error: job.error,
    emptyReason: job.emptyReason,
});

const present = async (schedule) => {
    const runs = await Job.find({ scheduleId: schedule.scheduleId })
        .sort({ createdAt: -1 })
        .limit(RUNS_PER_SCHEDULE)
        .select('jobId status createdAt updatedAt scrapedCount keptCount finalCount delivery error emptyReason')
        .lean();

    return {
        scheduleId: schedule.scheduleId,
        name: schedule.name,
        enabled: schedule.enabled,
        inputs: schedule.inputs,
        frequency: schedule.frequency,
        everyDays: schedule.everyDays,
        weekdays: schedule.weekdays,
        runTime: schedule.runTime,
        timezone: schedule.timezone,
        skipAlreadySent: schedule.skipAlreadySent,
        description: describeSchedule(schedule),
        nextRunAt: schedule.enabled ? schedule.nextRunAt : null,
        lastRunAt: schedule.lastRunAt,
        lastJobId: schedule.lastJobId,
        lastError: schedule.lastError,
        runCount: schedule.runCount,
        createdAt: schedule.createdAt,
        runs: runs.map(runSummary),
    };
};

export const listSchedules = async (req, res) => {
    try {
        const schedules = await Schedule.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, schedules: await Promise.all(schedules.map(present)) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createSchedule = async (req, res) => {
    try {
        const inputs = parseInputs(req.body.inputs || req.body);
        const fields = parseScheduleFields(req.body);
        const now = new Date();

        const schedule = await Schedule.create({
            scheduleId: newScheduleId(),
            ...fields,
            inputs,
            anchorDate: localDateString(now, fields.timezone),
        });
        schedule.nextRunAt = computeNextRun(schedule, now);
        await schedule.save();

        res.json({ success: true, schedule: await present(schedule.toObject()) });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const updateSchedule = async (req, res) => {
    try {
        const schedule = await Schedule.findOne({ scheduleId: req.params.scheduleId });
        if (!schedule) return res.status(404).json({ success: false, error: 'Schedule not found' });

        const body = req.body || {};
        const fields = parseScheduleFields({ ...schedule.toObject(), ...body });
        if (body.inputs) schedule.inputs = parseInputs(body.inputs);

        const timingChanged =
            fields.frequency !== schedule.frequency ||
            fields.everyDays !== schedule.everyDays ||
            fields.runTime !== schedule.runTime ||
            fields.timezone !== schedule.timezone ||
            JSON.stringify(fields.weekdays) !== JSON.stringify(schedule.weekdays);

        Object.assign(schedule, fields);
        if (timingChanged || !schedule.nextRunAt) {
            schedule.anchorDate = localDateString(new Date(), schedule.timezone);
            schedule.nextRunAt = computeNextRun(schedule, new Date());
        }
        await schedule.save();

        res.json({ success: true, schedule: await present(schedule.toObject()) });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const deleteSchedule = async (req, res) => {
    try {
        const result = await Schedule.deleteOne({ scheduleId: req.params.scheduleId });
        if (!result.deletedCount) return res.status(404).json({ success: false, error: 'Schedule not found' });
        await DeliveredListing.deleteMany({ scheduleId: req.params.scheduleId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const runScheduleNow = async (req, res) => {
    try {
        const schedule = await Schedule.findOne({ scheduleId: req.params.scheduleId }).lean();
        if (!schedule) return res.status(404).json({ success: false, error: 'Schedule not found' });

        const job = await runSchedule(schedule, { manual: true });
        res.json({ success: true, jobId: job.jobId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Forget what this schedule has sent, so the next run sends everything again.
export const resetDelivered = async (req, res) => {
    try {
        const result = await DeliveredListing.deleteMany({ scheduleId: req.params.scheduleId });
        res.json({ success: true, removed: result.deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ---------------------------------------------------------------------------
// Bulk operations
// Body: { scheduleIds: [..] | "all", inputs?: {partial}, schedule?: {partial}, action?: "pause"|"resume"|"run"|"delete" }
// Only the keys present in `inputs` / `schedule` are changed; everything else
// on each schedule stays as it is.
// ---------------------------------------------------------------------------

const selectSchedules = async (scheduleIds) => {
    if (scheduleIds === 'all') return Schedule.find();
    if (!Array.isArray(scheduleIds) || !scheduleIds.length) throw new Error('Pick at least one schedule.');
    return Schedule.find({ scheduleId: { $in: scheduleIds.map(String) } });
};

const TIMING_KEYS = ['frequency', 'everyDays', 'weekdays', 'runTime', 'timezone'];

export const bulkUpdateSchedules = async (req, res) => {
    try {
        const { scheduleIds, inputs: inputPatch, schedule: schedulePatch, action } = req.body || {};
        const schedules = await selectSchedules(scheduleIds);
        if (!schedules.length) return res.json({ success: true, updated: 0, failed: [] });

        const failed = [];
        let updated = 0;
        const startedJobs = [];

        for (const schedule of schedules) {
            try {
                if (action === 'delete') {
                    await Schedule.deleteOne({ scheduleId: schedule.scheduleId });
                    await DeliveredListingModel.deleteMany({ scheduleId: schedule.scheduleId });
                    updated += 1;
                    continue;
                }

                if (action === 'run') {
                    const job = await runSchedule(schedule.toObject(), { manual: true });
                    startedJobs.push(job.jobId);
                    updated += 1;
                    continue;
                }

                if (inputPatch && typeof inputPatch === 'object' && Object.keys(inputPatch).length) {
                    // drop keys sent as null/undefined so "leave unchanged" works
                    const patch = Object.fromEntries(
                        Object.entries(inputPatch).filter(([, v]) => v !== undefined && v !== '__unchanged__')
                    );
                    schedule.inputs = parseInputs({ ...schedule.inputs, ...patch });
                    schedule.markModified('inputs');
                }

                const fields = { ...(schedulePatch || {}) };
                if (action === 'pause') fields.enabled = false;
                if (action === 'resume') fields.enabled = true;

                if (Object.keys(fields).length) {
                    const merged = parseScheduleFields({ ...schedule.toObject(), ...fields });
                    const timingChanged = TIMING_KEYS.some((key) => fields[key] !== undefined) &&
                        JSON.stringify(TIMING_KEYS.map((k) => merged[k])) !== JSON.stringify(TIMING_KEYS.map((k) => schedule[k]));
                    Object.assign(schedule, merged);
                    if (timingChanged || (merged.enabled && !schedule.nextRunAt)) {
                        schedule.anchorDate = localDateString(new Date(), schedule.timezone);
                        schedule.nextRunAt = computeNextRun(schedule, new Date());
                    }
                }

                await schedule.save();
                updated += 1;
            } catch (error) {
                failed.push({ scheduleId: schedule.scheduleId, name: schedule.name, error: error.message });
            }
        }

        res.json({ success: true, updated, failed, startedJobs });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
