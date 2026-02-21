/**
 * Scrape job routes with credit deduction and webhook notifications.
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import GoogleMapsScraper from '../../src/scraper.js';
import { DataExporter } from '../../src/index.js';
import db from '../db.js';
import { authenticateToken, requireCredits } from '../middleware.js';
import { fireWebhooks } from './webhooks.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const router = Router();

// POST /scrape - Start a scrape job (requires auth + credits)
router.post('/', authenticateToken, requireCredits(1), async (req, res) => {
    try {
        const {
            searchTerms = [],
            location = '',
            directUrls = [],
            maxResults = 120,
            scrapeReviews = true,
            reviewsLimit = 5,
            scrapeOpeningHours = true,
            minRating,
            language = 'en',
        } = req.body;

        if (!searchTerms.length && !directUrls.length) {
            return res.status(400).json({ error: 'Provide searchTerms or directUrls.' });
        }
        if (searchTerms.length > 0 && !location) {
            return res.status(400).json({ error: 'location is required with searchTerms.' });
        }

        const jobId = randomUUID();
        const params = JSON.stringify({
            searchTerms, location, directUrls, maxResults,
            scrapeReviews, reviewsLimit, scrapeOpeningHours, minRating, language,
        });

        db.prepare(
            'INSERT INTO scrape_jobs (id, user_id, params) VALUES (?, ?, ?)'
        ).run(jobId, req.user.id, params);

        // Run in background
        runWebappScrapeJob(jobId, req.user.id).catch(err => {
            console.error(`Webapp job ${jobId} crashed:`, err.message);
        });

        res.status(202).json({
            jobId,
            status: 'queued',
            credits: req.user.credits,
            message: 'Scrape job queued. Credits will be deducted on completion.',
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create job', message: error.message });
    }
});

// GET /scrape/jobs - List user's jobs
router.get('/jobs', authenticateToken, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const offset = parseInt(req.query.offset || '0');

    const jobs = db.prepare(`
        SELECT id, status, result_count, credits_used, error, created_at, started_at, completed_at
        FROM scrape_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(req.user.id, limit, offset);

    const total = db.prepare(
        'SELECT COUNT(*) as count FROM scrape_jobs WHERE user_id = ?'
    ).get(req.user.id);

    res.json({ jobs, total: total.count });
});

// GET /scrape/jobs/:id - Get job details with results
router.get('/jobs/:id', authenticateToken, (req, res) => {
    const job = db.prepare(
        'SELECT * FROM scrape_jobs WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!job) return res.status(404).json({ error: 'Job not found.' });

    res.json({
        id: job.id,
        status: job.status,
        resultCount: job.result_count,
        creditsUsed: job.credits_used,
        error: job.error,
        params: JSON.parse(job.params),
        results: job.results ? JSON.parse(job.results) : [],
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
    });
});

// GET /scrape/jobs/:id/export/:format - Download results
router.get('/jobs/:id/export/:format', authenticateToken, async (req, res) => {
    const job = db.prepare(
        'SELECT * FROM scrape_jobs WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!job || job.status !== 'completed') {
        return res.status(400).json({ error: 'Job not completed or not found.' });
    }

    const results = JSON.parse(job.results || '[]');
    if (results.length === 0) {
        return res.status(400).json({ error: 'Job has no results.' });
    }

    const format = req.params.format.toLowerCase();

    // CRM-specific export formats
    if (format === 'hubspot' || format === 'salesforce') {
        const csvData = formatCRMExport(results, format);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${format}_import_${job.id}.csv"`);
        return res.send(csvData);
    }

    // Standard formats via DataExporter
    const tmpDir = path.join(os.tmpdir(), 'mapscraper-exports');
    await fs.mkdir(tmpDir, { recursive: true });

    try {
        switch (format) {
            case 'json': {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="results_${job.id}.json"`);
                return res.json(results);
            }
            case 'csv': {
                const filePath = path.join(tmpDir, `results_${job.id}.csv`);
                await DataExporter.exportCSV(results, filePath);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="results_${job.id}.csv"`);
                const content = await fs.readFile(filePath, 'utf-8');
                await fs.unlink(filePath).catch(() => {});
                return res.send(content);
            }
            case 'xlsx':
            case 'excel': {
                const filePath = path.join(tmpDir, `results_${job.id}.xlsx`);
                await DataExporter.exportExcel(results, filePath);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="results_${job.id}.xlsx"`);
                const buffer = await fs.readFile(filePath);
                await fs.unlink(filePath).catch(() => {});
                return res.send(buffer);
            }
            default:
                return res.status(400).json({
                    error: 'Unsupported format. Use: json, csv, xlsx, hubspot, salesforce',
                });
        }
    } catch (error) {
        res.status(500).json({ error: 'Export failed', message: error.message });
    }
});

/**
 * Format results for CRM import.
 */
function formatCRMExport(results, crmType) {
    let headers, rows;

    if (crmType === 'hubspot') {
        headers = [
            'Company name', 'Company Domain Name', 'Phone Number',
            'Street Address', 'City', 'State/Region', 'Postal Code',
            'Country/Region', 'Description', 'Google Maps URL',
        ];
        rows = results.map(r => [
            r.placeName || '',
            r.website ? safeHostname(r.website) : '',
            r.phoneNumber || '',
            r.address?.street || '',
            r.address?.city || '',
            r.address?.state || '',
            r.address?.postalCode || '',
            r.countryCode || '',
            r.category || '',
            r.url || '',
        ]);
    } else {
        // Salesforce
        headers = [
            'Account Name', 'Phone', 'Website', 'Billing Street',
            'Billing City', 'Billing State', 'Billing Zip',
            'Billing Country', 'Type', 'Description', 'Rating',
        ];
        rows = results.map(r => [
            r.placeName || '',
            r.phoneNumber || '',
            r.website || '',
            r.address?.street || '',
            r.address?.city || '',
            r.address?.state || '',
            r.address?.postalCode || '',
            r.countryCode || '',
            r.category || '',
            r.description || '',
            r.totalReviewScore ? `${r.totalReviewScore}/5` : '',
        ]);
    }

    return [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
}

function safeHostname(url) {
    try { return new URL(url).hostname; } catch { return ''; }
}

/**
 * Background job runner with credit deduction and webhook notifications.
 */
async function runWebappScrapeJob(jobId, userId) {
    let scraper = null;
    try {
        db.prepare(
            'UPDATE scrape_jobs SET status = ?, started_at = datetime("now") WHERE id = ?'
        ).run('running', jobId);

        const job = db.prepare('SELECT * FROM scrape_jobs WHERE id = ?').get(jobId);
        const params = JSON.parse(job.params);

        scraper = new GoogleMapsScraper({
            headless: true,
            maxResults: params.maxResults,
            language: params.language,
            scrapeReviews: params.scrapeReviews,
            reviewsLimit: params.reviewsLimit,
            scrapeOpeningHours: params.scrapeOpeningHours,
            timeout: 60000,
        });

        await scraper.initialize();
        let allResults = [];

        if (params.directUrls?.length > 0) {
            for (const url of params.directUrls) {
                const results = await scraper.scrapeUrl(url, {
                    maxResults: params.maxResults,
                    minRating: params.minRating,
                });
                allResults.push(...results);
            }
        }

        if (params.searchTerms?.length > 0) {
            for (const term of params.searchTerms) {
                const results = await scraper.searchPlaces(term, params.location, {
                    maxResults: params.maxResults,
                    minRating: params.minRating,
                });
                allResults.push(...results);
            }
        }

        // Deduct credits: 1 per place
        const creditsUsed = allResults.length;
        db.prepare(
            'UPDATE users SET credits = credits - ?, updated_at = datetime("now") WHERE id = ?'
        ).run(creditsUsed, userId);
        db.prepare(
            'INSERT INTO credit_transactions (user_id, amount, type, description, job_id) VALUES (?, ?, ?, ?, ?)'
        ).run(userId, -creditsUsed, 'scrape', `Scraped ${creditsUsed} places`, jobId);

        db.prepare(`
            UPDATE scrape_jobs
            SET status = 'completed', results = ?, result_count = ?, credits_used = ?, completed_at = datetime('now')
            WHERE id = ?
        `).run(JSON.stringify(allResults), allResults.length, creditsUsed, jobId);

        await fireWebhooks(userId, 'job.completed', {
            jobId, resultCount: allResults.length, creditsUsed,
        });

    } catch (error) {
        db.prepare(
            "UPDATE scrape_jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?"
        ).run(error.message, jobId);

        await fireWebhooks(userId, 'job.failed', { jobId, error: error.message });
    } finally {
        if (scraper) await scraper.close();
    }
}

export default router;
