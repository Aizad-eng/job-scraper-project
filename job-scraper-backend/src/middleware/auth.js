import crypto from 'crypto';

// Constant-time compare so the key can't be guessed by timing the response.
const safeEqual = (a, b) => {
    const bufA = Buffer.from(String(a ?? ''));
    const bufB = Buffer.from(String(b ?? ''));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Gate for everything a human triggers (scrape / status / download).
 * Accepts the key in the `x-access-key` header, or as `?key=` for plain
 * browser navigations like the download links (an <a href> can't set headers).
 */
export const requireAccessKey = (req, res, next) => {
    const expected = process.env.APP_ACCESS_KEY;

    // Fail closed: if the env var is missing, nobody gets in.
    if (!expected) {
        console.error('APP_ACCESS_KEY is not set — refusing all API requests.');
        return res.status(503).json({
            success: false,
            error: 'Server not configured.',
        });
    }

    const provided = req.get('x-access-key') || req.query.key || '';

    if (!safeEqual(provided, expected)) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized. A valid access key is required.',
        });
    }

    next();
};

/**
 * Gate for the Apify / AI-Ark webhooks. These are called by machines, not
 * people, so they get their own secret passed in the callback URL.
 */
export const requireWebhookSecret = (req, res, next) => {
    const expected = process.env.WEBHOOK_SECRET;

    if (!expected) {
        console.error('WEBHOOK_SECRET is not set — refusing all webhook calls.');
        return res.status(503).send('Server not configured.');
    }

    if (!safeEqual(req.query.s || '', expected)) {
        console.warn(`Rejected webhook with bad secret from ${req.ip}`);
        return res.status(401).send('Unauthorized');
    }

    next();
};
