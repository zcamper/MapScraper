/**
 * In-memory job store for tracking async scrape jobs.
 * Can be replaced with Redis for multi-process deployments.
 */

import { randomUUID } from 'crypto';

class JobStore {
    constructor() {
        this.jobs = new Map();
        // Clean up completed jobs older than 1 hour every 5 minutes
        this._cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    create(params) {
        const id = randomUUID();
        const job = {
            id,
            status: 'queued',
            params,
            results: [],
            error: null,
            progress: { current: 0, total: 0, message: '' },
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
        };
        this.jobs.set(id, job);
        return job;
    }

    get(id) {
        return this.jobs.get(id) || null;
    }

    update(id, updates) {
        const job = this.jobs.get(id);
        if (job) Object.assign(job, updates);
        return job;
    }

    list(limit = 20, offset = 0) {
        const all = Array.from(this.jobs.values())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return { jobs: all.slice(offset, offset + limit), total: all.length };
    }

    cleanup(maxAgeMs = 3600000) {
        const now = Date.now();
        for (const [id, job] of this.jobs) {
            if (job.completedAt && (now - new Date(job.completedAt).getTime()) > maxAgeMs) {
                this.jobs.delete(id);
            }
        }
    }
}

export default new JobStore();
