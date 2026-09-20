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
