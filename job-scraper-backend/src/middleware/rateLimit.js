// Small in-memory brute-force guard for the password check.
// No dependency, no database. Render runs one instance, so this is enough.

const attempts = new Map(); // ip -> { count, firstAt, blockedUntil }

const WINDOW_MS = 15 * 60 * 1000; // count failures over 15 minutes
const MAX_FAILURES = 8;           // then lock that IP out
const BLOCK_MS = 15 * 60 * 1000;  // for 15 minutes

// Stop the map growing forever.
setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of attempts) {
        if (now - rec.firstAt > WINDOW_MS && (rec.blockedUntil || 0) < now) {
            attempts.delete(ip);
        }
    }
}, WINDOW_MS).unref();

export const loginRateLimit = (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const rec = attempts.get(ip);

    if (rec?.blockedUntil > now) {
        const mins = Math.ceil((rec.blockedUntil - now) / 60000);
        return res.status(429).json({
            success: false,
            error: `Too many attempts. Try again in ${mins} minute(s).`,
        });
    }

    // Let the request run, then inspect how it went.
    res.on('finish', () => {
        const current = attempts.get(ip);

        if (res.statusCode === 200) {
            attempts.delete(ip); // correct password, forget the failures
            return;
        }

        if (res.statusCode !== 401) return; // only count wrong passwords

        if (!current || now - current.firstAt > WINDOW_MS) {
            attempts.set(ip, { count: 1, firstAt: now });
            return;
        }

        current.count += 1;
        if (current.count >= MAX_FAILURES) {
            current.blockedUntil = now + BLOCK_MS;
            console.warn(`Locked out ${ip} after ${current.count} bad passwords.`);
        }
    });

    next();
};
