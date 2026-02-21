/**
 * Webhook management routes and delivery.
 */

import { Router } from 'express';
import { createHmac } from 'crypto';
import db from '../db.js';
import { authenticateToken } from '../middleware.js';

const router = Router();

// GET /webhooks - List user's webhooks
router.get('/', authenticateToken, (req, res) => {
    const webhooks = db.prepare(
        'SELECT id, url, events, is_active, created_at FROM webhooks WHERE user_id = ?'
    ).all(req.user.id);

    res.json({
        webhooks: webhooks.map(w => ({ ...w, events: JSON.parse(w.events) })),
    });
});

// POST /webhooks - Register a new webhook
router.post('/', authenticateToken, (req, res) => {
    const { url, events = ['job.completed'], secret } = req.body;

    if (!url) return res.status(400).json({ error: 'url is required.' });

    try {
        new URL(url); // validate URL format
    } catch {
        return res.status(400).json({ error: 'Invalid URL format.' });
    }

    const result = db.prepare(
        'INSERT INTO webhooks (user_id, url, events, secret) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, url, JSON.stringify(events), secret || null);

    res.status(201).json({
        id: result.lastInsertRowid,
        url,
        events,
    });
});

// DELETE /webhooks/:id - Remove a webhook
router.delete('/:id', authenticateToken, (req, res) => {
    const result = db.prepare(
        'DELETE FROM webhooks WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) return res.status(404).json({ error: 'Webhook not found.' });
    res.json({ deleted: true });
});

/**
 * Fire webhooks for a user's event.
 * Called by scrape routes when jobs complete or fail.
 */
export async function fireWebhooks(userId, eventName, payload) {
    const webhooks = db.prepare(
        'SELECT * FROM webhooks WHERE user_id = ? AND is_active = 1'
    ).all(userId);

    for (const webhook of webhooks) {
        const events = JSON.parse(webhook.events);
        if (!events.includes(eventName)) continue;

        const body = JSON.stringify({
            event: eventName,
            timestamp: new Date().toISOString(),
            data: payload,
        });

        const headers = { 'Content-Type': 'application/json' };
        if (webhook.secret) {
            headers['X-Webhook-Signature'] = createHmac('sha256', webhook.secret)
                .update(body).digest('hex');
        }

        // Fire-and-forget
        fetch(webhook.url, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(10000),
        }).catch(err => {
            console.warn(`Webhook ${webhook.id} to ${webhook.url} failed: ${err.message}`);
        });
    }
}

export default router;
