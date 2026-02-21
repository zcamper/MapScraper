/**
 * Credit management routes: balance, history, top-up.
 */

import { Router } from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware.js';

const router = Router();

// GET /credits - Get balance and transaction history
router.get('/', authenticateToken, (req, res) => {
    const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
    const transactions = db.prepare(
        'SELECT id, amount, type, description, job_id, created_at FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.user.id);

    // Summary stats
    const totalUsed = db.prepare(
        "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM credit_transactions WHERE user_id = ? AND amount < 0"
    ).get(req.user.id);
    const totalAdded = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM credit_transactions WHERE user_id = ? AND amount > 0"
    ).get(req.user.id);

    res.json({
        credits: user.credits,
        totalUsed: totalUsed.total,
        totalAdded: totalAdded.total,
        transactions,
    });
});

// POST /credits/add - Manual credit top-up (Stripe integration placeholder)
router.post('/add', authenticateToken, (req, res) => {
    const { amount, description } = req.body;
    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
        return res.status(400).json({ error: 'Amount must be a positive integer.' });
    }

    db.prepare('UPDATE users SET credits = credits + ?, updated_at = datetime("now") WHERE id = ?')
        .run(amount, req.user.id);
    db.prepare(
        'INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, amount, 'topup', description || 'Credit top-up');

    const updated = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);
    res.json({ credits: updated.credits, added: amount });
});

export default router;
