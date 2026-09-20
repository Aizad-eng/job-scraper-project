// A "No" (direct employer) verdict is reused for this long before re-checking.
export const VERDICT_TTL_DAYS = 180;

// An "Unknown" verdict is retried after this long.
export const UNKNOWN_RETRY_DAYS = 30;

// A "Yes" (staffing agency) verdict never expires — once an agency, always
// skipped, unless someone overrides it by hand.

// After a company is sent to the webhook, hold it back for this many days
// (across every run and schedule). Per-search input; 0 turns it off.
export const DEFAULT_COOLDOWN_DAYS = 21;
export const MAX_COOLDOWN_DAYS = 365;

export const COMPANIES_PAGE_SIZE = 50;

export const COMPANY_FILTER = {
    ALL: 'all',
    AGENCY: 'agency',
    EMPLOYER: 'employer',
    UNKNOWN: 'unknown',
    OVERRIDDEN: 'overridden',
    COOLDOWN: 'cooldown',
};

export const VERDICT_SOURCE = {
    OVERRIDE: 'override',
    MEMORY: 'memory',
};
