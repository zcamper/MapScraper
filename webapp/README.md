# MapScraper Lead Gen SaaS

A **self-hosted lead generation platform** built on top of the MapScraper core scraper. Users register, get credits, run Google Maps scrapes through a web dashboard or API, and export results in CRM-ready formats (HubSpot, Salesforce).

```
┌─────────────────────────────────────────┐
│         MapScraper Lead Gen SaaS        │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  Dashboard (Vanilla JS SPA)      │   │
│  │  • Search form & live results    │   │
│  │  • Job history & exports         │   │
│  │  • Credits & billing             │   │
│  │  • API key management            │   │
│  └──────────────────────────────────┘   │
│           ↓                              │
│  ┌──────────────────────────────────┐   │
│  │    REST API (Express.js)         │   │
│  │  • /auth (register, login, keys) │   │
│  │  • /scrape (jobs, results)       │   │
│  │  • /credits (balance, history)   │   │
│  │  • /webhooks (events)            │   │
│  │  • /billing (Stripe, plans)  [P1]   │
│  │  • /scheduled (cron jobs)    [P2]   │
│  │  • /orgs (teams)             [P4]   │
│  └──────────────────────────────────┘   │
│           ↓                              │
│  ┌──────────────────────────────────┐   │
│  │  SQLite Database                 │   │
│  │  • users, api_keys               │   │
│  │  • scrape_jobs, results          │   │
│  │  • credit_transactions           │   │
│  │  • saved_searches            [P2]   │
│  │  • subscriptions             [P1]   │
│  │  • places & history          [P5]   │
│  │  • organizations             [P4]   │
│  └──────────────────────────────────┘   │
│           ↓                              │
│  ┌──────────────────────────────────┐   │
│  │  Core Scraper (src/scraper.js)   │   │
│  │  • Playwright-based browser      │   │
│  │  • Google Maps navigation        │   │
│  │  • Data extraction               │   │
│  │  • Proxy rotation                │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘

[P1] Phase 1: Payment Integration
[P2] Phase 2: Scheduled Scrapes
[P4] Phase 4: Teams/Organizations
[P5] Phase 5: Data Deduplication
```

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start the SaaS server with hot-reload
npm run webapp:dev

# Server runs on http://localhost:3001
# Dashboard: http://localhost:3001
# API Health: GET http://localhost:3001/health
```

### First Time Setup

1. **Register a User**:
   ```bash
   curl -X POST http://localhost:3001/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"securepass123"}'
   ```

   Response includes: JWT token, API key, 100 free credits

2. **Open Dashboard**:
   Navigate to `http://localhost:3001` and log in

3. **Run Your First Search**:
   - Search term: "Pizza"
   - Location: "New York"
   - Max results: 20
   - Click "Search & Scrape"

4. **Export Results**:
   Once job completes, download as JSON, CSV, Excel, or CRM format (HubSpot/Salesforce)

## Project Structure

```
webapp/
├── 📚 Documentation
│   ├── README.md (this file)
│   ├── SETUP.md (detailed setup & deployment)
│   ├── ROADMAP.md (7-phase development plan)
│   ├── API.md (API endpoint reference)
│   └── PROJECT_OUTLINE.md (original specifications)
│
├── 🔧 Core Server
│   ├── server.js (Express app, routes mounting)
│   ├── db.js (SQLite initialization)
│   ├── middleware.js (JWT/API key auth, credit guards)
│   ├── schema.sql (database tables & indexes)
│   └── config.js (shared constants, env validation) [TODO]
│
├── 🛣️ API Routes
│   ├── routes/
│   │   ├── auth.js (register, login, API keys)
│   │   ├── scrape.js (jobs, results, exports)
│   │   ├── credits.js (balance, history, top-up)
│   │   ├── webhooks.js (event subscriptions)
│   │   ├── billing.js (Stripe integration) [Phase 1]
│   │   ├── scheduled.js (cron jobs) [Phase 2]
│   │   ├── enrich.js (email extraction) [Phase 3]
│   │   ├── orgs.js (team management) [Phase 4]
│   │   ├── places.js (deduplication) [Phase 5]
│   │   └── admin.js (admin dashboard) [Phase 7]
│
├── 🧠 Business Logic
│   ├── services/ (reusable logic) [TODO - Phase by phase]
│   │   ├── scrapeService.js (job queueing, result handling)
│   │   ├── billingService.js (credit transactions, subscriptions) [P1]
│   │   ├── schedulerService.js (cron runner) [P2]
│   │   ├── enrichmentService.js (email crawling) [P3]
│   │   ├── orgService.js (team/org logic) [P4]
│   │   └── deduplicationService.js (place tracking) [P5]
│
├── 🎨 Frontend Dashboard
│   ├── public/
│   │   ├── index.html (main SPA)
│   │   ├── styles.css (vanilla CSS)
│   │   ├── app.js (main controller)
│   │   └── api-client.js (API helper)
│   │
│   └── frontend/ [Phase 6 - React/Vue upgrade]
│       ├── package.json
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   └── App.jsx
│       └── build/... (outputs to public/)
│
├── 💾 Data & Config
│   ├── data/ (SQLite database, git-ignored)
│   │   └── mapscraper.db
│   └── .env.example (environment template)
│
└── 🐳 Deployment
    ├── Dockerfile (production image)
    └── docker-compose.yml (local stack) [TODO]
```

## Core Features (MVP)

### ✅ User Management
- Register with email & password (100 free credits)
- Login via email/password or OAuth [TODO]
- API key generation (msk_ prefix) & revocation
- Profile management (name, plan, subscription)

### ✅ Scraping Dashboard
- Search form with filters
  - Search terms (keywords, categories)
  - Location (city, country, zip)
  - Max results (1-1000)
  - Language, min rating, review counts
- Live job status polling
- Results table with rich data
- One-click exports (JSON, CSV, Excel)
- CRM exports (HubSpot, Salesforce CSV)

### ✅ Credit System
- 1 credit = 1 place scraped
- New users get 100 free credits
- Credit history & audit trail
- Manual top-up endpoint (Stripe TBD)
- Real-time balance display

### ✅ REST API
- 14 documented endpoints
- JWT token or API key authentication
- Rate limiting (built-in)
- Webhook support (HMAC-signed)

### ✅ Security
- Passwords: bcryptjs (10 rounds)
- Auth: JWT (7-day expiry) or API keys
- Webhooks: HMAC-SHA256 signatures
- CORS: configurable by environment

## Database Schema

### Users
```sql
id, email, password_hash, name, credits, plan, created_at, updated_at
```

### API Keys
```sql
id, user_id, key (msk_...), name, is_active, created_at, last_used_at
```

### Scrape Jobs
```sql
id, user_id, status, params (JSON), results (JSON), result_count, 
credits_used, error, created_at, started_at, completed_at
```

### Credit Transactions
```sql
id, user_id, amount, type (scrape/topup/admin), description, job_id, created_at
```

### Saved Searches
```sql
id, user_id, search_terms, location, schedule (cron), is_active, 
created_at, last_run_at
```

### Webhooks
```sql
id, user_id, url, events (JSON), secret (HMAC), created_at
```

### Subscriptions [Phase 1]
```sql
id, user_id, plan (free/starter/pro/business), stripe_subscription_id,
credits_per_month, status, renewal_date, created_at
```

### Organizations [Phase 4]
```sql
id, name, owner_user_id, shared_credits, created_at

org_members: user_id, org_id, role (owner/admin/member), joined_at
```

### Places [Phase 5]
```sql
id, place_id (Google), name, category, address, phone, website,
lat, lng, rating, review_count, last_seen_at, created_at

job_places: scrape_job_id, place_id, is_new, rating_changed
```

## API Endpoints

### Authentication (`POST /auth/...`)
| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /auth/register` | None | Create account (100 free credits) |
| `POST /auth/login` | None | Get JWT token (7 days) |
| `GET /auth/me` | JWT/Key | User profile & keys |
| `POST /auth/api-keys` | JWT/Key | Generate new API key |
| `DELETE /auth/api-keys/:id` | JWT/Key | Revoke an API key |

### Scraping (`POST /scrape/...`)
| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /scrape` | JWT/Key | Start async scrape job |
| `GET /scrape/jobs` | JWT/Key | List user's jobs (paginated) |
| `GET /scrape/jobs/:id` | JWT/Key | Get job status & results |
| `GET /scrape/jobs/:id/export/:fmt` | JWT/Key | Download (json/csv/xlsx/hubspot/salesforce) |

### Credits (`GET /credits/...`)
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /credits` | JWT/Key | Balance, history (last 50) |
| `POST /credits/add` | JWT/Key | Manual top-up (Stripe TBD) |

### Webhooks (`/webhooks`)
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /webhooks` | JWT/Key | List user's webhooks |
| `POST /webhooks` | JWT/Key | Register webhook (job.completed, job.failed) |
| `DELETE /webhooks/:id` | JWT/Key | Remove webhook |

## Environment Variables

```env
# Port
WEBAPP_PORT=3001

# JWT signing key (change in production!)
JWT_SECRET=your-random-secret-here

# Database path
DATABASE_PATH=./webapp/data/mapscraper.db

# CORS allowed origins
CORS_ORIGIN=*

# Stripe (Phase 1)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Phase 2 - notifications)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password

# Admin dashboard (Phase 7)
ADMIN_EMAILS=admin@example.com,moderator@example.com
```

## Development Roadmap

See [ROADMAP.md](ROADMAP.md) for complete 7-phase plan:

1. **Phase 1: Payment Integration** (HIGH priority)
   - Stripe Checkout + subscription plans
   - Files: `routes/billing.js`, updated schema

2. **Phase 2: Scheduled Scrapes** (HIGH priority)
   - Cron-based automation
   - Files: `scheduler.js`, `routes/scheduled.js`

3. **Phase 3: Email Enrichment** (MEDIUM priority)
   - Extract emails from websites
   - Files: `services/enrichmentService.js`, `routes/enrich.js`

4. **Phase 4: Teams/Organizations** (MEDIUM priority)
   - Multi-user workspaces with shared credits
   - Files: `routes/orgs.js`, schema updates

5. **Phase 5: Data Deduplication** (MEDIUM priority)
   - Track unique places, detect duplicates
   - Files: `routes/places.js`, schema updates

6. **Phase 6: React/Vue Frontend** (LOW priority)
   - Replace vanilla JS with modern SPA
   - Folder: `frontend/`, build outputs to `public/`

7. **Phase 7: Admin Panel** (LOW priority)
   - Internal analytics & user management
   - Files: `routes/admin.js`, admin dashboard UI

## Deployment

### Local Development
```bash
npm run webapp:dev
# Runs on http://localhost:3001
# Auto-reload on file changes
```

### Docker
```bash
docker build -f webapp/Dockerfile -t mapscraper-saas .
docker run -p 3001:3001 -v ./webapp/data:/app/webapp/data mapscraper-saas
```

### Production Deployment

Recommended platforms (low cost):
- **Railway**: $5-20/mo (easy GitHub integration)
- **Render**: $7-25/mo (background workers for jobs)
- **Fly.io**: $5-15/mo (global edge deployment)
- **DigitalOcean App**: $12-24/mo (managed containers)
- **VPS** (Hetzner/OVH): $5-10/mo (most cost-effective)

**Requirements**:
- Node 18+
- ~1GB RAM (Playwright uses 300MB per browser)
- Persistent storage (SQLite database)
- HTTPS (reverse proxy: nginx, Caddy)

See [SETUP.md](SETUP.md) for production checklist.

## Billing Model

| Plan | Credits/Month | Price | Use Case |
|------|--------------|-------|----------|
| **Free** | 100 | $0 | Try it out |
| **Starter** | 1,000 | $29/mo | SMBs, lead gen |
| **Pro** | 5,000 | $79/mo | Agencies, outreach |
| **Business** | 20,000 | $199/mo | Enterprises, automation |

**Credit System**:
- 1 credit = 1 place scraped
- Reviews + hours included free
- Unused credits roll over ([TBD] or expire monthly)
- Team plans share a credit pool

## Roadmap for Revenue

| Scenario | Users | Avg Credits/mo | Revenue/Credit | MRR |
|----------|-------|----------------|-----------------|-----|
| Early | 50 | 500 | $0.02 | $500 |
| Growth | 500 | 1,000 | $0.02 | $10,000 |
| Scale | 2,000 | 2,000 | $0.015 | $60,000 |

**Key metrics to track**:
- Signups/week
- Credits purchased/week
- Churn rate
- Avg job size
- Export format usage
- Trial-to-paid conversion

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js 18+ | Async, proven, large ecosystem |
| Server | Express.js | Simple, minimal, fast |
| Database | SQLite (better-sqlite3) | Zero-config, embedded, upgradeable to Postgres |
| Auth | JWT + bcryptjs | Stateless, pure JS |
| Scraper | Playwright | Headless browser, handles dynamic content |
| Frontend | Vanilla JS (SPA) | No build step, fast iteration, can upgrade to React later [P6] |
| Payments | Stripe (planned) | Industry standard, reliable, great docs [P1] |
| Container | Docker | Reproducible deploys, easy scaling |
| Scheduling | node-cron | Simple cron integration [P2] |

## FAQ

**Q: Can I self-host this?**
A: Yes! Deploy to Docker, VPS, or any Node.js-compatible platform.

**Q: What about data privacy?**
A: All data stays on your server. No cloud dependencies except Stripe (payments).

**Q: How do I connect to HubSpot/Salesforce?**
A: Export as CSV and import, or [Phase 3] integrate with their APIs directly.

**Q: Can I white-label this?**
A: Yes, customize colors, domain, branding in `public/index.html` and `server.js`.

**Q: Is there a free tier?**
A: Yes, 100 free credits on signup. Enough for ~1 small search.

**Q: What about rate limits from Google?**
A: Core scraper handles proxies & throttling. Webhook notifications can trigger manual review.

## Contributing

Areas for contribution:
- [ ] Phase implementations (1-7)
- [ ] Frontend redesign (React/Vue)
- [ ] Mobile app
- [ ] CRM integrations
- [ ] Email templates
- [ ] Admin panel
- [ ] Monitoring/analytics

## Support

- **Setup issues**: See [SETUP.md](SETUP.md)
- **API docs**: See [API.md](API.md) or `npm run webapp:dev` + Swagger docs [TODO]
- **Bug reports**: Open GitHub issue with logs
- **Feature requests**: See [ROADMAP.md](ROADMAP.md)

## License

MIT - See LICENSE in root

---

**Ready to build the SaaS?** Start with [SETUP.md](SETUP.md), then follow [ROADMAP.md](ROADMAP.md) for Phase 1 (Payments).
