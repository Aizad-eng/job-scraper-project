import { FREQUENCY, MAX_LOOKAHEAD_DAYS } from '../constants/scheduleConstants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const isValidTimezone = (tz) => {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
    } catch {
        return false;
    }
};

export const isValidTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));

const partsIn = (date, timeZone) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const out = {};
    formatter.formatToParts(date).forEach((part) => {
        if (part.type !== 'literal') out[part.type] = Number(part.value);
    });
    return out;
};

// Offset of `timeZone` from UTC at `date`, in ms.
const offsetAt = (date, timeZone) => {
    const p = partsIn(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

// The instant at which `timeZone` shows y-m-d hh:mm.
export const zonedTimeToUtc = (year, month, day, hour, minute, timeZone) => {
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    let result = guess - offsetAt(new Date(guess), timeZone);
    // second pass catches DST transitions
    result = guess - offsetAt(new Date(result), timeZone);
    return new Date(result);
};

// "YYYY-MM-DD" of `date` as seen in `timeZone`.
export const localDateString = (date, timeZone) => {
    const p = partsIn(date, timeZone);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

const dayNumber = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
};

const weekdayOf = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const addDays = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + n));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
};

const dayMatches = (ymd, schedule) => {
    switch (schedule.frequency) {
        case FREQUENCY.WEEKDAYS:
            return (schedule.weekdays || []).includes(weekdayOf(ymd));
        case FREQUENCY.EVERY_N_DAYS: {
            const n = Math.max(1, Number(schedule.everyDays) || 1);
            const anchor = schedule.anchorDate || ymd;
            const diff = dayNumber(ymd) - dayNumber(anchor);
            return diff >= 0 && diff % n === 0;
        }
        case FREQUENCY.DAILY:
        default:
            return true;
    }
};

/**
 * First instant strictly after `after` on which the schedule should run.
 * Returns null when nothing matches (e.g. weekdays with none selected).
 */
export const computeNextRun = (schedule, after = new Date()) => {
    const timeZone = schedule.timezone || 'UTC';
    const [hour, minute] = String(schedule.runTime || '08:00').split(':').map(Number);
    let day = localDateString(after, timeZone);

    for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i += 1) {
        if (dayMatches(day, schedule)) {
            const [y, m, d] = day.split('-').map(Number);
            const instant = zonedTimeToUtc(y, m, d, hour, minute, timeZone);
            if (instant.getTime() > after.getTime()) return instant;
        }
        day = addDays(day, 1);
    }

    return null;
};

// Human summary used in API responses: "Every weekday at 08:00 (Europe/Berlin)"
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const describeSchedule = (schedule) => {
    const time = `${schedule.runTime} (${schedule.timezone})`;
    switch (schedule.frequency) {
        case FREQUENCY.WEEKDAYS: {
            const days = [...(schedule.weekdays || [])].sort().map((d) => DAY_NAMES[d]);
            const isWeekdays = days.length === 5 && !days.includes('Sat') && !days.includes('Sun');
            return `${isWeekdays ? 'Every weekday' : days.length ? `Every ${days.join(', ')}` : 'No days selected'} at ${time}`;
        }
        case FREQUENCY.EVERY_N_DAYS: {
            const n = Math.max(1, Number(schedule.everyDays) || 1);
            return n === 1 ? `Every day at ${time}` : `Every ${n} days at ${time}`;
        }
        case FREQUENCY.DAILY:
        default:
            return `Every day at ${time}`;
    }
};
