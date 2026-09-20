// One webhook request per job listing, or one per company (jobs nested).
export const DELIVERY_MODE = {
    JOB: 'job',
    COMPANY: 'company',
};

export const DEFAULT_DELIVERY_MODE = DELIVERY_MODE.JOB;

// Clay's webhook source accepts 5 requests per second. Requests are spaced
// so the whole worker pool never exceeds that, regardless of concurrency.
// Clay allows 5/s; we stay well under it and never more than 2 in flight.
export const DELIVERY_MAX_PER_SECOND = 3;
export const DELIVERY_CONCURRENCY = 2;
export const DELIVERY_TIMEOUT_MS = 20_000;
// 6 attempts: 2s, 4s, 8s, 16s, 30s between them (Retry-After wins when sent)
export const DELIVERY_MAX_ATTEMPTS = 6;
export const DELIVERY_RETRY_BASE_MS = 2_000;
export const DELIVERY_RETRY_MAX_MS = 30_000;

// How often the sent / failed counters are written back to the job document.
export const DELIVERY_PROGRESS_EVERY = 10;

export const DELIVERY_STATE = {
    PENDING: 'pending',
    SENDING: 'sending',
    DONE: 'done',
    FAILED: 'failed',
};
