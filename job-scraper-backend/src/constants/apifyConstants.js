export const APIFY_BASE_URL = 'https://api.apify.com/v2';

export const ACTOR_IDS = {
    // Apify uses ~ instead of / in API URLs for actor IDs.
    LINKEDIN: 'claygenius~cheapest-linkedin-job-scrapper',
    INDEED: 'claygenius~best-cheapest-indeed-job-scrapper',
};

export const PLATFORMS = {
    LINKEDIN: 'linkedin',
    INDEED: 'indeed',
};

export const JOB_STATUS = {
    PENDING: 'pending',
    SCRAPING: 'scraping',
    FILTERING: 'filtering',
    CLASSIFYING: 'classifying',
    DELIVERING: 'delivering',
    DONE: 'done',
    EMPTY: 'empty',
    FAILED: 'failed',
};

export const JOB_STATUS_LABELS = {
    pending: 'Queued',
    scraping: 'Scraping job listings',
    filtering: 'Applying filters',
    classifying: 'Removing staffing agencies',
    delivering: 'Sending to webhook',
    done: 'Done',
    empty: 'Nothing to send',
    failed: 'Failed',
};

export const APIFY_RUN_STATUS = {
    RUNNING: 'RUNNING',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    ABORTED: 'ABORTED',
    TIMED_OUT: 'TIMED-OUT',
};

export const APIFY_TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'];

export const POSTED_WITHIN = {
    ANY: 'any',
    DAY: 'day',
    THREE_DAYS: 'three_days',
    WEEK: 'week',
    TWO_WEEKS: 'two_weeks',
    MONTH: 'month',
};

// LinkedIn wants r-prefixed seconds. Indeed wants a day count as a string and
// only accepts 0 / 1 / 3 / 7 / 14, so "month" falls back to its widest window.
export const POSTED_WITHIN_MAP = {
    [POSTED_WITHIN.ANY]: { linkedin: '', indeed: '0' },
    [POSTED_WITHIN.DAY]: { linkedin: 'r86400', indeed: '1' },
    [POSTED_WITHIN.THREE_DAYS]: { linkedin: 'r259200', indeed: '3' },
    [POSTED_WITHIN.WEEK]: { linkedin: 'r604800', indeed: '7' },
    [POSTED_WITHIN.TWO_WEEKS]: { linkedin: 'r1209600', indeed: '14' },
    [POSTED_WITHIN.MONTH]: { linkedin: 'r2592000', indeed: '14' },
};

export const POSTED_WITHIN_LABELS = {
    any: 'Any time',
    day: 'Past 24 hours',
    three_days: 'Past 3 days',
    week: 'Past week',
    two_weeks: 'Past 2 weeks',
    month: 'Past month',
};

// Never more than this many actor runs in flight across every search and
// schedule. Set MAX_ACTOR_RUNS in the environment to raise it (default 5).
// Each search can ask for fewer (maxConcurrentRuns input).
export const MAX_ACTOR_RUNS_GLOBAL = Math.min(Math.max(Math.round(Number(process.env.MAX_ACTOR_RUNS)) || 5, 1), 100);
export const DEFAULT_MAX_CONCURRENT_RUNS = Math.min(5, MAX_ACTOR_RUNS_GLOBAL);

// A run still marked RUNNING after this long is checked directly with Apify,
// in case its webhook never arrived.
export const STALE_RUN_CHECK_MINUTES = 5;
