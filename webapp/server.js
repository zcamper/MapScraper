/**
 * Lead Gen SaaS Server.
 *
 * Start: npm run webapp:start
 * Dev:   npm run webapp:dev
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import './db.js'; // Initialize database on import
import authRoutes from './routes/auth.js';
import scrapeRoutes from './routes/scrape.js';
import creditRoutes from './routes/credits.js';
import webhookRoutes from './routes/webhooks.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.WEBAPP_PORT || '3001', 10);

app.use(express.json({ limit: '10mb' }));

// CORS
app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});

// Serve static dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Mount API routes
app.use('/auth', authRoutes);
app.use('/scrape', scrapeRoutes);
app.use('/credits', creditRoutes);
app.use('/webhooks', webhookRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

// SPA fallback - serve dashboard for all unmatched routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`MapScraper Lead Gen SaaS running on http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}`);
    console.log(`API Docs: POST /auth/register to get started`);
});

export default app;
