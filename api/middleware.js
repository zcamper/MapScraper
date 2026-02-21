/**
 * API middleware: authentication and rate limiting.
 */

const API_KEYS = new Set(
    (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean)
);

/**
 * API key authentication. Skips if no keys configured (dev mode).
 * Accepts: X-API-Key header, Authorization: Bearer <key>, or ?api_key query param.
 */
export function apiKeyAuth(req, res, next) {
    if (API_KEYS.size === 0) return next();

    const key = req.headers['x-api-key']
        || req.headers['authorization']?.replace('Bearer ', '')
        || req.query.api_key;

    if (!key || !API_KEYS.has(key)) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing API key. Provide via X-API-Key header.',
        });
    }
    next();
}

/**
 * Simple in-memory rate limiter per API key or IP.
 */
const rateLimitStore = new Map();

export function rateLimit({ windowMs = 60000, max = 10 } = {}) {
    return (req, res, next) => {
        const key = req.headers['x-api-key'] || req.ip;
        const now = Date.now();
        const record = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };

        if (now > record.resetAt) {
            record.count = 0;
            record.resetAt = now + windowMs;
        }

        record.count++;
        rateLimitStore.set(key, record);

        res.set('X-RateLimit-Limit', String(max));
        res.set('X-RateLimit-Remaining', String(Math.max(0, max - record.count)));
        res.set('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

        if (record.count > max) {
            return res.status(429).json({
                error: 'Too Many Requests',
                message: `Rate limit exceeded. Try again in ${Math.ceil((record.resetAt - now) / 1000)}s.`,
            });
        }
        next();
    };
}
