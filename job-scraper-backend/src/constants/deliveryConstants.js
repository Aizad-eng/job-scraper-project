// One webhook request per job listing, or one per company (jobs nested).
export const DELIVERY_MODE = {
    JOB: 'job',
    COMPANY: 'company',
};

export const DEFAULT_DELIVERY_MODE = DELIVERY_MODE.JOB;

// Clay and most webhook receivers are happy at a few requests a second.
export const DELIVERY_CONCURRENCY = 4;
export const DELIVERY_TIMEOUT_MS = 15_000;
export const DELIVERY_MAX_ATTEMPTS = 4;
export const DELIVERY_RETRY_BASE_MS = 1_000;

// How often the sent / failed counters are written back to the job document.
export const DELIVERY_PROGRESS_EVERY = 10;

export const DELIVERY_STATE = {
    PENDING: 'pending',
    SENDING: 'sending',
    DONE: 'done',
    FAILED: 'failed',
};
