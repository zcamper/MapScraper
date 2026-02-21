# MapScraper Lead Gen SaaS - Project Outline

## Overview

A self-hosted lead generation platform built on top of the MapScraper core scraper. Users register, get credits, run Google Maps scrapes through a web dashboard or API, and export results in CRM-ready formats (HubSpot, Salesforce).

---

## Current State (MVP - What's Built)

### Architecture

```
webapp/
├── server.js               # Express app, port 3001
├── db.js                    # SQLite init (better-sqlite3, WAL mode)
├── schema.sql               # 6 tables, 7 indexes
├── middleware.js             # JWT + API key auth, credit guard
├── routes/
│   ├── auth.js              # Register, login, profile, API key CRUD
│   ├── scrape.js            # Job creation, status, results, CRM export
│   ├── credits.js           # Balance, history, manual top-up
│   └── webhooks.js          # Webhook CRUD, HMAC-signed delivery
├── public/
│   └── index.html           # Single-page dashboard (vanilla JS)
├── data/
│   └── mapscraper.db        # SQLite database (auto-created, gitignored)
└── Dockerfile               # Production container image
```

### Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts | email, password_hash, credits, plan |
| `api_keys` | Programmatic API access | user_id, key (`msk_...`), is_active |
| `scrape_jobs` | Job tracking + results | user_id, status, params (JSON), results (JSON), credits_used |
| `credit_transactions` | Billing audit trail | user_id, amount (+/-), type, description, job_id |
| `saved_searches` | Reusable search configs | user_id, search_terms, location, schedule (cron), is_active |
| `webhooks` | Event notifications | user_id, url, events (JSON), secret (HMAC) |

### API Endpoints

#### Authentication (`/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | None | Create account (100 free credits + API key) |
| POST | `/auth/login` | None | Get JWT token (7-day expiry) |
| GET | `/auth/me` | JWT/Key | Profile, API keys, job count |
| POST | `/auth/api-keys` | JWT/Key | Generate new API key |
| DELETE | `/auth/api-keys/:id` | JWT/Key | Revoke an API key |

#### Scraping (`/scrape`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/scrape` | JWT/Key + Credits | Start async scrape job |
| GET | `/scrape/jobs` | JWT/Key | List user's jobs (paginated) |
| GET | `/scrape/jobs/:id` | JWT/Key | Job status + results |
| GET | `/scrape/jobs/:id/export/:format` | JWT/Key | Download: json, csv, xlsx, hubspot, salesforce |

#### Credits (`/credits`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/credits` | JWT/Key | Balance, total used/added, last 50 transactions |
| POST | `/credits/add` | JWT/Key | Manual top-up (Stripe placeholder) |

#### Webhooks (`/webhooks`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/webhooks` | JWT/Key | List user's webhooks |
| POST | `/webhooks` | JWT/Key | Register webhook (events: job.completed, job.failed) |
| DELETE | `/webhooks/:id` | JWT/Key | Remove webhook |

### Dashboard Features (index.html)
- Login / Register with instant API key generation
- Search form: terms, location, max results, language, min rating, reviews toggle
- Live job status polling (3-second interval)
- Jobs table with view/export actions
- Results table with name, category, rating, phone, website, address
- Export buttons: JSON, CSV, Excel, HubSpot CSV, Salesforce CSV
- Credits balance + transaction history
- API key management (generate/revoke)
- Webhook configuration

### Billing Model
- 1 credit = 1 place scraped (reviews + hours included free)
- New users get 100 free credits
- Manual top-up via `/credits/add` (Stripe integration pending)
- Credits deducted on job completion, not on start
- Full transaction audit trail

### Security
- Passwords: bcryptjs (10 rounds)
- Auth: JWT tokens (7-day expiry) OR API keys (`msk_` prefix)
- Webhooks: HMAC-SHA256 signatures via `X-Webhook-Signature` header
- CORS: configurable via `CORS_ORIGIN` env var
- API keys: per-user, revocable, last-used tracking

---

## Roadmap - What Needs to Be Built

### Phase 1: Payment Integration (Priority: HIGH)

**Goal**: Users can buy credits with real money.

- [ ] Stripe Checkout integration for credit packages
  - Packages: 500 credits/$10, 2000/$35, 5000/$75, 15000/$200
  - Stripe webhook to auto-add credits on successful payment
- [ ] `/credits/purchase` endpoint that creates a Stripe Checkout session
- [ ] Stripe webhook handler at `/webhooks/stripe`
- [ ] Receipt/invoice generation
- [ ] Subscription plans (monthly credit allotment)
  - Free: 100 credits/month
  - Starter ($29/mo): 1,000 credits/month
  - Pro ($79/mo): 5,000 credits/month
  - Business ($199/mo): 20,000 credits/month

**Files to create/modify**:
- `webapp/routes/billing.js` (new)
- `webapp/server.js` (mount billing routes)
- `webapp/schema.sql` (add subscriptions table)
- `webapp/public/index.html` (add pricing/billing tab)

### Phase 2: Scheduled / Recurring Scrapes (Priority: HIGH)

**Goal**: Users set up scrapes that run automatically on a schedule.

- [ ] Cron-based scheduler (node-cron or custom interval)
- [ ] `saved_searches.schedule` column already exists (cron format)
- [ ] Scheduler service that checks for due searches every minute
- [ ] Auto-deduct credits on each scheduled run
- [ ] Email notification on completion (or webhook)
- [ ] Dashboard UI: save search, set schedule, view run history
- [ ] Pause/resume scheduled searches

**Files to create/modify**:
- `webapp/scheduler.js` (new - cron runner)
- `webapp/routes/saved-searches.js` (new - CRUD for saved searches)
- `webapp/server.js` (import scheduler)
- `webapp/public/index.html` (add saved searches tab)

### Phase 3: Email Enrichment (Priority: MEDIUM)

**Goal**: Extract emails from business websites to create richer leads.

- [ ] After scraping a place's website URL, crawl it for email addresses
- [ ] Parse `mailto:` links, contact pages, footer content
- [ ] Add `emails[]` field to place results
- [ ] Separate enrichment credit cost (e.g., 0.5 credits per email lookup)
- [ ] Bulk enrichment endpoint for existing job results

**Files to create/modify**:
- `src/emailEnricher.js` (new - crawls websites for emails)
- `webapp/routes/enrich.js` (new)

### Phase 4: Team / Multi-User (Priority: MEDIUM)

**Goal**: Multiple users under one organization with shared credits.

- [ ] Organizations table (org_id, name, owner_user_id)
- [ ] Org membership (user_id, org_id, role: owner/admin/member)
- [ ] Shared credit pool per organization
- [ ] Admin can view all members' jobs
- [ ] Invite users via email

**Files to create/modify**:
- `webapp/schema.sql` (add organizations, org_members tables)
- `webapp/routes/orgs.js` (new)
- `webapp/middleware.js` (add org-level auth)

### Phase 5: Data Deduplication & History (Priority: MEDIUM)

**Goal**: Avoid re-scraping the same places, track changes over time.

- [ ] `places` table storing unique places by placeId
- [ ] Link scrape_jobs to places via junction table
- [ ] Detect if a place was already scraped (skip or update)
- [ ] Track rating/review changes over time
- [ ] "Monitor" mode: alert when a place's rating drops or it closes

**Files to create/modify**:
- `webapp/schema.sql` (add places, job_places tables)
- `webapp/routes/places.js` (new - search/browse scraped places)

### Phase 6: Dashboard v2 - React/Vue Frontend (Priority: LOW)

**Goal**: Replace vanilla JS dashboard with a proper SPA framework.

- [ ] React or Vue app in `webapp/frontend/`
- [ ] Component library (shadcn/ui, Radix, or Vuetify)
- [ ] Interactive data tables with sorting, filtering, pagination
- [ ] Charts: credits usage over time, scrape volume, rating distributions
- [ ] Map view of results (reuse existing MapVisualizer)
- [ ] Dark mode
- [ ] Mobile-responsive design
- [ ] Build step: `npm run webapp:build` outputs to `webapp/public/`

### Phase 7: Admin Panel (Priority: LOW)

**Goal**: Internal admin dashboard to manage users and monitor the platform.

- [ ] `/admin` routes with admin-only middleware
- [ ] View all users, their credit balances, job history
- [ ] Grant/revoke credits manually
- [ ] System stats: total users, total scrapes, active jobs, revenue
- [ ] Ban/suspend users
- [ ] View error logs

---

## Deployment Options

### Local Development
```bash
npm run webapp:dev          # Auto-reload on file changes
# Open http://localhost:3001
```

### Docker
```bash
docker build -f webapp/Dockerfile -t mapscraper-saas .
docker run -p 3001:3001 -v ./webapp/data:/app/webapp/data mapscraper-saas
```

### Cloud Deployment
| Platform | Estimated Cost | Notes |
|----------|---------------|-------|
| Railway | $5-20/mo | Easy deploy from GitHub, supports Playwright |
| Render | $7-25/mo | Background workers for scrape jobs |
| Fly.io | $5-15/mo | Global edge deployment, persistent volumes |
| DigitalOcean App Platform | $12-24/mo | Managed containers |
| VPS (Hetzner/OVH) | $5-10/mo | Most cost-effective, full control |

**Requirements**: Node 18+, ~1GB RAM minimum (Playwright uses ~300MB per browser instance), persistent storage for SQLite.

### Production Checklist
- [ ] Set strong `JWT_SECRET` in environment
- [ ] Set `CORS_ORIGIN` to your domain (not `*`)
- [ ] Set up HTTPS (reverse proxy: nginx, Caddy, or platform-provided)
- [ ] Set up database backups (cron job copying `mapscraper.db`)
- [ ] Rate limiting (already built in, tune values)
- [ ] Monitoring (uptime check on `/health`)
- [ ] Error tracking (Sentry or similar)

---

## Environment Variables

```env
WEBAPP_PORT=3001                          # Server port
JWT_SECRET=your-random-secret-here        # JWT signing key
DATABASE_PATH=./webapp/data/mapscraper.db # SQLite file location
CORS_ORIGIN=*                             # Allowed origins (* for dev)
```

---

## Revenue Projections

| Scenario | Users | Avg Credits/mo | Price/Credit | MRR |
|----------|-------|----------------|-------------|-----|
| Early | 50 | 500 | $0.02 | $500 |
| Growth | 500 | 1,000 | $0.02 | $10,000 |
| Scale | 2,000 | 2,000 | $0.015 | $60,000 |

**Key metrics to track**: signups/week, credits purchased/week, churn rate, avg job size, export format usage.

---

## Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Server | Express.js | Simple, proven, huge ecosystem |
| Database | SQLite (better-sqlite3) | Zero config, embedded, upgradeable to Postgres |
| Auth | JWT + bcryptjs | Stateless, pure JS (no native build deps) |
| Scraper | Playwright | Handles dynamic Google Maps content |
| Frontend | Vanilla HTML/JS | No build step, fast iteration, swap to React later |
| Payments | Stripe (planned) | Industry standard, great docs |
| Container | Docker (Playwright base) | Reproducible deploys |
