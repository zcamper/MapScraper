/**
 * REST API routes for the Google Maps Scraper.
 *
 * POST /api/v1/scrape         - Start a scrape job (async)
 * GET  /api/v1/jobs/:id       - Get job status and results
 * GET  /api/v1/jobs/:id/export/:format - Download results
 * GET  /api/v1/jobs           - List recent jobs
 * GET  /api/v1/health         - Health check
 */

import { Router } from 'express';
import GoogleMapsScraper from '../src/scraper.js';
import { DataExporter } from '../src/index.js';
import jobStore from './jobStore.js';
import { rateLimit } from './middleware.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const router = Router();
const scrapeRateLimit = rateLimit({ windowMs: 60000, max: 5 });

// POST /scrape - Start a new scrape job
router.post('/scrape', scrapeRateLimit, async (req, res) => {
    try {
        const {
            searchTerms,
            location,
            directUrls,
            maxResults = 120,
            scrapeReviews = true,
            reviewsLimit = 5,
            scrapeOpeningHours = true,
            minRating,
            language = 'en',
        } = req.body;

        if ((!searchTerms || searchTerms.length === 0) && (!directUrls || directUrls.length === 0)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Provide either searchTerms (with location) or directUrls.',
            });
        }
        if (searchTerms?.length > 0 && !location) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'location is required when using searchTerms.',
            });
        }

        const job = jobStore.create({
            searchTerms, location, directUrls, maxResults,
            scrapeReviews, reviewsLimit, scrapeOpeningHours,
            minRating, language,
        });

        // Fire-and-forget background job
        runScrapeJob(job.id).catch(err => {
            console.error(`Job ${job.id} crashed:`, err.message);
        });

        res.status(202).json({
            jobId: job.id,
            status: job.status,
            message: 'Scrape job queued. Poll GET /api/v1/jobs/:id for status.',
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

// GET /jobs - List recent jobs
router.get('/jobs', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const offset = parseInt(req.query.offset || '0');
    res.json(jobStore.list(limit, offset));
});

// GET /jobs/:id - Get job status and results
router.get('/jobs/:id', (req, res) => {
    const job = jobStore.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not Found', message: 'Job not found.' });

    const response = {
        id: job.id,
        status: job.status,
        progress: job.progress,
        resultCount: job.results.length,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        error: job.error,
    };

    if (job.status === 'completed') {
        response.results = job.results;
    }

    res.json(response);
});

// GET /jobs/:id/export/:format - Download results
router.get('/jobs/:id/export/:format', async (req, res) => {
    const job = jobStore.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not Found' });
    if (job.status !== 'completed' || job.results.length === 0) {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'Job not completed or has no results.',
        });
    }

    const format = req.params.format.toLowerCase();
    const tmpDir = path.join(os.tmpdir(), 'mapscraper-exports');
    await fs.mkdir(tmpDir, { recursive: true });

    try {
        switch (format) {
            case 'json': {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="results_${job.id}.json"`);
                return res.json(job.results);
            }
            case 'csv': {
                const filePath = path.join(tmpDir, `results_${job.id}.csv`);
                await DataExporter.exportCSV(job.results, filePath);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="results_${job.id}.csv"`);
                const content = await fs.readFile(filePath, 'utf-8');
                await fs.unlink(filePath).catch(() => {});
                return res.send(content);
            }
            case 'excel':
            case 'xlsx': {
                const filePath = path.join(tmpDir, `results_${job.id}.xlsx`);
                await DataExporter.exportExcel(job.results, filePath);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="results_${job.id}.xlsx"`);
                const buffer = await fs.readFile(filePath);
                await fs.unlink(filePath).catch(() => {});
                return res.send(buffer);
            }
            default:
                return res.status(400).json({ error: 'Unsupported format. Use: json, csv, xlsx' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Export failed', message: error.message });
    }
});

// GET /health - Health check
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        activeJobs: Array.from(jobStore.jobs.values()).filter(j => j.status === 'running').length,
    });
});

// Background scrape job runner
async function runScrapeJob(jobId) {
    const job = jobStore.get(jobId);
    if (!job) return;

    let scraper = null;
    try {
        jobStore.update(jobId, {
            status: 'running',
            startedAt: new Date().toISOString(),
        });

        scraper = new GoogleMapsScraper({
            headless: true,
            maxResults: job.params.maxResults,
            language: job.params.language,
            scrapeReviews: job.params.scrapeReviews,
            reviewsLimit: job.params.reviewsLimit,
            scrapeOpeningHours: job.params.scrapeOpeningHours,
            timeout: 60000,
        });

        await scraper.initialize();
        let allResults = [];

        // Process direct URLs
        if (job.params.directUrls?.length > 0) {
            for (const url of job.params.directUrls) {
                const results = await scraper.scrapeUrl(url, {
                    maxResults: job.params.maxResults,
                    minRating: job.params.minRating,
                });
                allResults.push(...results);
                jobStore.update(jobId, { results: allResults });
            }
        }

        // Process search terms
        if (job.params.searchTerms?.length > 0) {
            for (let i = 0; i < job.params.searchTerms.length; i++) {
                const term = job.params.searchTerms[i];
                const results = await scraper.searchPlaces(term, job.params.location, {
                    maxResults: job.params.maxResults,
                    minRating: job.params.minRating,
                });
                allResults.push(...results);
                jobStore.update(jobId, {
                    progress: {
                        current: i + 1,
                        total: job.params.searchTerms.length,
                        message: `Completed "${term}"`,
                    },
                    results: allResults,
                });
            }
        }

        jobStore.update(jobId, {
            status: 'completed',
            results: allResults,
            completedAt: new Date().toISOString(),
        });
    } catch (error) {
        jobStore.update(jobId, {
            status: 'failed',
            error: error.message,
            completedAt: new Date().toISOString(),
        });
    } finally {
        if (scraper) await scraper.close();
    }
}

export default router;
