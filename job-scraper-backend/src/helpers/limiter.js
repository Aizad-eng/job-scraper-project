// Tiny in-process concurrency limiter: at most `max` tasks run at once,
// the rest wait their turn. One instance per external service.
export const createLimiter = (max) => {
    let active = 0;
    const queue = [];

    const next = () => {
        if (active >= max || !queue.length) return;
        active += 1;
        const { task, resolve, reject } = queue.shift();
        task().then(resolve, reject).finally(() => {
            active -= 1;
            next();
        });
    };

    const run = (task) =>
        new Promise((resolve, reject) => {
            queue.push({ task, resolve, reject });
            next();
        });

    return { run, get active() { return active; }, get waiting() { return queue.length; } };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls `fn` until it succeeds or attempts run out. Retries only when
 * `shouldRetry(error)` says so. Backoff doubles from `baseMs`, capped at
 * `maxMs`, and honours a Retry-After header when present.
 */
export const withRetry = async (fn, { attempts = 3, baseMs = 1000, maxMs = 30_000, shouldRetry = () => true, label = '' } = {}) => {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await fn(attempt);
        } catch (error) {
            lastError = error;
            if (attempt === attempts || !shouldRetry(error)) break;
            const retryAfter = Number(error.response?.headers?.['retry-after']);
            const wait = Math.min(retryAfter ? retryAfter * 1000 : baseMs * 2 ** (attempt - 1), maxMs);
            if (label) console.warn(`${label}: attempt ${attempt} failed (${error.response?.status || error.message}), retrying in ${wait}ms`);
            await sleep(wait);
        }
    }
    throw lastError;
};

// 408 / 429 / 5xx / network errors are worth another go; other 4xx are not.
export const isTransientHttpError = (error) => {
    const status = error.response?.status;
    if (!status) return true;
    return status === 408 || status === 429 || status >= 500;
};
