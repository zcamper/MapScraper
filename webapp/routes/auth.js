/**
 * Authentication routes: register, login, profile.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { JWT_SECRET, authenticateToken } from '../middleware.js';

const router = Router();

// POST /auth/register
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = db.prepare(
            'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)'
        ).run(email, passwordHash, name || '');

        const userId = result.lastInsertRowid;

        // Generate API key
        const apiKey = `msk_${randomUUID().replace(/-/g, '')}`;
        db.prepare(
            'INSERT INTO api_keys (user_id, key, name) VALUES (?, ?, ?)'
        ).run(userId, apiKey, 'Default');

        // Log the signup bonus credits
        db.prepare(
            'INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)'
        ).run(userId, 100, 'bonus', 'Welcome bonus - 100 free credits');

        const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            token,
            apiKey,
            user: { id: userId, email, name: name || '', credits: 100, plan: 'free' },
        });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed', message: error.message });
    }
});

// POST /auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name, credits: user.credits, plan: user.plan },
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed', message: error.message });
    }
});

// GET /auth/me - Get current user profile + API keys
router.get('/me', authenticateToken, (req, res) => {
    const apiKeys = db.prepare(
        'SELECT id, name, key, is_active, created_at, last_used_at FROM api_keys WHERE user_id = ?'
    ).all(req.user.id);

    const jobCount = db.prepare(
        'SELECT COUNT(*) as count FROM scrape_jobs WHERE user_id = ?'
    ).get(req.user.id);

    res.json({
        user: req.user,
        apiKeys,
        totalJobs: jobCount.count,
    });
});

// POST /auth/api-keys - Generate a new API key
router.post('/api-keys', authenticateToken, (req, res) => {
    const { name } = req.body;
    const apiKey = `msk_${randomUUID().replace(/-/g, '')}`;

    db.prepare(
        'INSERT INTO api_keys (user_id, key, name) VALUES (?, ?, ?)'
    ).run(req.user.id, apiKey, name || 'API Key');

    res.status(201).json({ key: apiKey, name: name || 'API Key' });
});

// DELETE /auth/api-keys/:id - Revoke an API key
router.delete('/api-keys/:id', authenticateToken, (req, res) => {
    const result = db.prepare(
        'DELETE FROM api_keys WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) return res.status(404).json({ error: 'API key not found.' });
    res.json({ deleted: true });
});

export default router;
