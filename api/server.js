/**
 * REST API Server for Google Maps Scraper.
 *
 * Start: npm run api:start
 * Dev:   npm run api:dev
 */

import express from 'express';
import dotenv from 'dotenv';
import { apiKeyAuth, rateLimit } from './middleware.js';
import routes from './routes.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.API_PORT || '3000', 10);

app.use(express.json({ limit: '1mb' }));

// CORS
app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization, X-RapidAPI-Key, X-RapidAPI-Host');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});

// Global rate limit
app.use(rateLimit({ windowMs: 60000, max: 30 }));

// API key auth for /api routes
app.use('/api', apiKeyAuth);

// Mount routes
app.use('/api/v1', routes);

// Root info
app.get('/', (req, res) => {
    res.json({
        name: 'Google Maps Scraper API',
        version: '1.0.0',
        endpoints: {
            scrape: 'POST /api/v1/scrape',
            jobStatus: 'GET /api/v1/jobs/:id',
            jobExport: 'GET /api/v1/jobs/:id/export/:format',
            jobsList: 'GET /api/v1/jobs',
            health: 'GET /api/v1/health',
        },
        docs: 'See openapi.yaml for full API specification',
    });
});

app.listen(PORT, () => {
    console.log(`Google Maps Scraper API running on http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/api/v1/health`);
    if (!process.env.API_KEYS) {
        console.log('Warning: No API_KEYS configured. Auth is disabled (dev mode).');
    }
});

export default app;
