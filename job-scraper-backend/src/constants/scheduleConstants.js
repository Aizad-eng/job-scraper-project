export const FREQUENCY = {
    DAILY: 'daily',
    EVERY_N_DAYS: 'every_n_days',
    WEEKDAYS: 'weekdays',
};

export const DEFAULT_FREQUENCY = FREQUENCY.DAILY;
export const DEFAULT_RUN_TIME = '08:00';
export const DEFAULT_TIMEZONE = 'UTC';

// How often the server looks for due schedules.
export const SCHEDULER_TICK_MS = 30_000;

// How far ahead to search for the next matching day (covers "every 30 days").
export const MAX_LOOKAHEAD_DAYS = 400;

// How many past runs to return per schedule.
export const RUNS_PER_SCHEDULE = 10;

// Keys of delivered listings are kept this long so reruns can skip them.
export const DELIVERED_TTL_DAYS = 120;
