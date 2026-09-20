// A "No" (direct employer) verdict is reused for this long before re-checking.
export const VERDICT_TTL_DAYS = 180;

// An "Unknown" verdict is retried after this long.
export const UNKNOWN_RETRY_DAYS = 30;

// A "Yes" (staffing agency) verdict never expires — once an agency, always
// skipped, unless someone overrides it by hand.

export const COMPANIES_PAGE_SIZE = 50;

export const COMPANY_FILTER = {
    ALL: 'all',
    AGENCY: 'agency',
    EMPLOYER: 'employer',
    UNKNOWN: 'unknown',
    OVERRIDDEN: 'overridden',
};

export const VERDICT_SOURCE = {
    OVERRIDE: 'override',
    MEMORY: 'memory',
};
