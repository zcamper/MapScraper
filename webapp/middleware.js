/**
 * SaaS middleware: JWT authentication, API key auth, credit checks.
 */

import jwt from 'jsonwebtoken';
import db from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';

/**
 * Authenticate via JWT Bearer token or X-API-Key header.
 * Sets req.user with { id, email, name, credits, plan }.
 */
export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const apiKey = req.headers['x-api-key'];

    if (token) {
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            const user = db.prepare(
                'SELECT id, email, name, credits, plan FROM users WHERE id = ?'
            ).get(payload.userId);
            if (!user) return res.status(401).json({ error: 'User not found' });
            req.user = user;
            return next();
        } catch {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
    }

    if (apiKey) {
        const row = db.prepare(`
            SELECT u.id, u.email, u.name, u.credits, u.plan
            FROM api_keys ak JOIN users u ON ak.user_id = u.id
            WHERE ak.key = ? AND ak.is_active = 1
        `).get(apiKey);

        if (!row) return res.status(401).json({ error: 'Invalid API key' });

        db.prepare('UPDATE api_keys SET last_used_at = datetime("now") WHERE key = ?').run(apiKey);
        req.user = row;
        return next();
    }

    return res.status(401).json({
        error: 'Authentication required',
        message: 'Provide a Bearer token or X-API-Key header.',
    });
}

/**
 * Guard that checks the user has enough credits before proceeding.
 */
export function requireCredits(minCredits = 1) {
    return (req, res, next) => {
        if (req.user.credits < minCredits) {
            return res.status(402).json({
                error: 'Insufficient credits',
                credits: req.user.credits,
                required: minCredits,
                message: 'Add more credits to continue scraping.',
            });
        }
        next();
    };
}
