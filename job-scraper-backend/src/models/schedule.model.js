import mongoose from 'mongoose';
import { FREQUENCY, DEFAULT_RUN_TIME, DEFAULT_TIMEZONE } from '../constants/scheduleConstants.js';

const scheduleSchema = new mongoose.Schema(
    {
        scheduleId: { type: String, required: true, unique: true, index: true },
        name: { type: String, default: '' },
        enabled: { type: Boolean, default: true },

        // Same shape as Job.inputs. Stored loosely so the search form owns it.
        inputs: { type: Object, default: {} },

        frequency: { type: String, enum: Object.values(FREQUENCY), default: FREQUENCY.DAILY },
        everyDays: { type: Number, default: 1 },
        weekdays: { type: [Number], default: [] },   // 0 = Sunday … 6 = Saturday
        runTime: { type: String, default: DEFAULT_RUN_TIME }, // "HH:mm" in timezone
        timezone: { type: String, default: DEFAULT_TIMEZONE },
        // "YYYY-MM-DD" in timezone; every_n_days counts from here
        anchorDate: { type: String, default: null },

        skipAlreadySent: { type: Boolean, default: true },

        nextRunAt: { type: Date, default: null, index: true },
        lastRunAt: { type: Date, default: null },
        lastJobId: { type: String, default: null },
        runCount: { type: Number, default: 0 },
        lastError: { type: String, default: null },
        // set while a tick is launching this schedule, so two ticks never overlap
        launching: { type: Boolean, default: false },
    },
    { timestamps: true, minimize: false }
);

export default mongoose.model('Schedule', scheduleSchema);
