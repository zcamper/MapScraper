# MapScraper: Complete Project Guide

**Welcome!** This document serves as your entry point to the MapScraper project. Use this to understand structure, navigate documentation, and get started quickly.

---

## 📁 Project Structure

```
MapScraper/
├── src/                          # Google Maps scraper library
│   ├── scrapers.js              # Main Playwright-based scraper
│   ├── dataExtractor.js         # DOM parsing and field extraction
│   ├── dataExporter.js          # Multi-format export (JSON, CSV, Excel, HTML)
│   ├── proxyManager.js          # Proxy rotation and authentication
│   ├── utils.js                 # 15+ utility functions
│   ├── cli.js                   # Command-line interface
│   └── index.js                 # Module exports
│
├── webapp/                       # SaaS platform (Node.js + Express)
│   ├── server.js                # Express app and route mounting
│   ├── db.js                    # SQLite database initialization
│   ├── middleware.js            # JWT/API key authentication
│   ├── schema.sql               # Database schema (6 tables)
│   ├── package.json             # Dependencies
│   ├── .env.example             # Environment template
│   ├── Dockerfile               # Production container
│   │
│   ├── routes/                  # API route handlers (14 endpoints)
│   │   ├── auth.js              # Auth endpoints (register, login, API keys)
│   │   ├── scrape.js            # Scrape job endpoints
│   │   ├── credits.js           # Credit management endpoints
│   │   └── webhooks.js          # Webhook CRUD endpoints
│   │
│   ├── public/                  # Frontend (vanilla JavaScript)
│   │   ├── index.html           # Single page dashboard
│   │   ├── app.js               # Dashboard logic
│   │   └── style.css            # Styling
│   │
│   ├── Documentation/           # This section ↓
│   ├── README.md                # Main hub (architecture, features, quick start)
│   ├── SETUP.md                 # Setup and deployment (6 options)
│   ├── ROADMAP.md               # 7-phase development plan
│   ├── API.md                   # API reference (14+ endpoints with examples)
│   ├── PHASE_IMPLEMENTATIONS.md # Quick checklist for each phase
│   └── PROJECT_OUTLINE.md       # Original specifications (reference)
│
├── examples.js                  # 7 scraper code examples
├── tests/
│   └── test-installation.js     # Installation verification
└── package.json                 # Root dependencies (Node.js, Playwright, etc.)
```

---

## 🚀 Quick Start (5 Minutes)

### 1. Install Dependencies
```bash
cd z:\MapScraper
npm install
```

### 2. Try the Scraper
```bash
# Example: Search for restaurants in NYC
node src/cli.js --search "restaurants" --location "New York City" --results 10
```

### 3. Start the SaaS Platform
```bash
cd z:\MapScraper/webapp
npm run start  # or npm run dev for development
# Visit: http://localhost:3001
```

### 4. Create an Account
- Register: Email + password
- Get API key: Click "Settings" > "API Keys"
- Use JWT or API key to authenticate

---

## 📚 Documentation Guide

| Document | Purpose | Read Time | When to Use |
|----------|---------|-----------|------------|
| [README.md](README.md) | Main hub - architecture, features, quick start | 15 min | **Start here** |
| [SETUP.md](SETUP.md) | How to set up locally and deploy | 20 min | Deploy to production |
| [ROADMAP.md](ROADMAP.md) | 7-phase development plan with code examples | 30 min | Plan next features |
| [API.md](API.md) | Complete API reference (14+ endpoints) | 30 min | Build integrations |
| [PHASE_IMPLEMENTATIONS.md](PHASE_IMPLEMENTATIONS.md) | Checklist for implementing features | 10 min | Start a new phase |
| [PROJECT_OUTLINE.md](PROJECT_OUTLINE.md) | Original specifications (reference) | 20 min | Understand context |

---

## 🎯 What's Built

### ✅ Scraper Library (Ready to Use)
- **Google Maps search** with pagination
- **20+ data fields** extracted (name, rating, address, phone, website, coordinates, etc.)
- **Multiple export formats**: JSON, CSV, Excel, HTML
- **Proxy rotation** support with authentication
- **CLI interface** with advanced options
- **Programmatic API** for integration
- **Error handling and retry logic**
- **15,000+ lines of documentation**

### ✅ SaaS MVP (Production Ready)
- **User authentication** (register, login, JWT tokens)
- **API key management** with msk_ prefix
- **Credit-based billing** (1 credit = 1 place)
- **Scrape job management** (queue, status, results)
- **Export to CRM** (HubSpot, Salesforce formats)
- **Webhook support** with HMAC signing
- **SQLite database** with 6 tables & indexes
- **Security stack**: bcrypt passwords, JWT auth, rate limiting

### ⚠️ Not Yet Built (7-Phase Roadmap)
- Stripe/payment integration (Phase 1)
- Scheduled/recurring scrapes (Phase 2)
- Email enrichment from websites (Phase 3)
- Teams and multi-user orgs (Phase 4)
- Deduplication and change tracking (Phase 5)
- React/Vue frontend (Phase 6)
- Admin panel (Phase 7)

---

## 🔧 Development Workflow

### Scraper Development
```bash
# Run scraper in dev mode
npx nodemon src/cli.js --search "coffee shops" --location "San Francisco"

# Check logs for debugging
tail -f logs/scraper.log

# Run tests
npm run test
```

### SaaS Development
```bash
# Start development server with hot reload
cd webapp && npm run dev

# Test an API endpoint
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"securepass"}'

# View database
sqlite3 webapp/data/mapscraper.db
.schema users
SELECT * FROM users;

# Check logs
npm logs webapp
```

---

## 📊 Database Schema (MVP)

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `users` | User accounts | id, email, password_hash, created_at |
| `api_keys` | API authentication | id, user_id, key_hash, name, prefix |
| `scrape_jobs` | Search history | id, user_id, search_terms, status, results_count |
| `credit_transactions` | Billing ledger | id, user_id, amount, type, job_id |
| `saved_searches` | For scheduler | id, user_id, location, search_terms, cron_expression |
| `webhooks` | Event delivery | id, user_id, url, events, secret, last_triggered |

**Schema file**: [webapp/schema.sql](webapp/schema.sql)
**ERD diagram**: See [README.md](README.md#database-schema)

---

## 🔐 Authentication Methods

### 1. JWT Token (Browser)
```bash
# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass"}'

# Response: { token: "eyJhbGc..." }

# Use token in header
curl -X GET http://localhost:3001/auth/me \
  -H "Authorization: Bearer eyJhbGc..."
```

### 2. API Key (External)
```bash
# Generate in settings
# Key format: msk_live_1234567890abcdef

# Use as Authorization header
curl -X POST http://localhost:3001/scrape/create \
  -H "Authorization: ApiKey msk_live_1234567890abcdef" \
  -H "Content-Type: application/json" \
  -d '{"search":"coffee shops","location":"NYC"}'
```

**See**: [API.md](API.md#authentication)

---

## 💡 Next Steps

Pick your immediate goal:

### 🎯 Goal: Deploy to Production
→ Read [SETUP.md](SETUP.md)
- Choose deployment platform (Railway, Render, Fly.io, DigitalOcean, or VPS)
- Follow step-by-step deployment guide
- Configure environment variables
- Run production checks

### 🎯 Goal: Build Feature (Phase 1-2)
→ Read [PHASE_IMPLEMENTATIONS.md](PHASE_IMPLEMENTATIONS.md)
1. Choose phase (recommended: Phase 1 Payment, Phase 2 Scheduler)
2. Follow implementation checklist
3. Read relevant section in [ROADMAP.md](ROADMAP.md)
4. Code examples and architecture provided
5. Test locally, then deploy

### 🎯 Goal: Integrate with Your App
→ Read [API.md](API.md)
- Create API key
- Use REST endpoints to create scrape jobs
- Webhook for async notifications
- Export to JSON/CSV/Excel or CRM formats

### 🎯 Goal: Understand Architecture
→ Read [README.md](README.md)
- System architecture diagram
- Components and data flow
- Features and limitations
- FAQ answering common questions

---

## 🚁 High-Level Architecture

```
┌─ Scraper (CLI/Programmatic) ──────────────────┐
│  Playwright automation → Google Maps search    │
│  Extracts: name, rating, address, phone, etc  │
│  Exports: JSON, CSV, Excel, HTML              │
└────────────────────────────────────────────────┘
                       ↓
┌─ SaaS API (Express.js) ───────────────────────┐
│  Authentication: JWT + API Keys               │
│  Jobs: Create, Status, Results, Export        │
│  Credits: Purchase, Transaction History       │
│  Webhooks: HMAC-signed events                 │
└────────────────────────────────────────────────┘
                       ↓
┌─ Database (SQLite) ───────────────────────────┐
│  6 tables: users, jobs, credits, webhooks...  │
│  Indexed for fast queries                     │
│  WAL mode for concurrent access               │
└────────────────────────────────────────────────┘
                       ↓
┌─ Dashboard (Vanilla JS) ──────────────────────┐
│  Browse: Search history, Results              │
│  Action: Buy credits, Create API key          │
│  Admin: Job status, Transaction logs          │
└────────────────────────────────────────────────┘
```

---

## 📈 Revenue Model

Current (MVP):
- Credit-based pricing: 1 credit = 1 place
- No payment processing yet

Phase 1 (Coming):
- **Credit packages**: Small ($9), Medium ($49), Large ($199), Enterprise
- **Subscriptions**: Pro ($99/mo, 5,000 credits), Enterprise ($499/mo)
- **Stripe integration**: Checkout + subscriptions + invoicing

**Projected revenue** (at 100 users):
- Year 1: $14,400 (if 20% convert)
- Year 2: $144,000 (if 10% of users on Pro)
- Year 3: $432,000 (assuming growth to 300 users)

See [ROADMAP.md](ROADMAP.md#phase-1-payment-integration-priority-high) for details.

---

## ❓ FAQ

### Q: Can I use the scraper without the SaaS backend?
**A**: Yes! The scraper (src/) is a standalone library. Use `npm install` then `node examples.js`. No database needed.

### Q: How do I add my own features?
**A**: Follow [PHASE_IMPLEMENTATIONS.md](PHASE_IMPLEMENTATIONS.md) checklist. Most features need:
1. Database schema change
2. API endpoint(s)
3. Frontend UI
4. Tests

### Q: What's the credit cost of enrichment?
**A**: Enrichment is Phase 3. Currently: 0.5 credits per email extracted. Can be customized.

### Q: Can I white-label this?
**A**: Yes! The dashboard is vanilla JS (easy to brand). Update public/app.js and styles. SaaS can be rebranded in README/marketing.

### Q: How many places can I scrape?
**A**: Depends on credits. MVP has unlimited search, but results are limited by Google Maps pagination (typically 200 per search). No hard limits.

### Q: Is the data real-time?
**A**: Yes, scraper always gets current Google Maps data. Historical tracking (Phase 5) isn't built yet.

**More FAQ**: See [README.md](README.md#faq)

---

## 🆘 Troubleshooting

### Server won't start
```bash
# Check if port 3001 is in use
lsof -i :3001

# Or try different port
PORT=3002 npm run `start`
```

### Database error: "no such table"
```bash
# Reinitialize database
rm webapp/data/mapscraper.db
npm run webapp:start  # Creates new DB with schema
```

### Scraper returns no results
```bash
# Check if proxy is working (if using one)
# Try different search terms
# Increase timeout: --timeout 10000

node src/cli.js --search "coffee" --location "NYC" --timeout 10000
```

### API returns 401 Unauthorized
```bash
# Check token is included in header
curl -v -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/auth/me

# Login to get new token if expired
node src/cli.js --help  # See --token option
```

**Full troubleshooting**: See [SETUP.md → Troubleshooting](SETUP.md#troubleshooting)

---

## 📞 Support & Resources

- **Issues?** Check [README.md FAQ](README.md#faq)
- **Setup help?** See [SETUP.md](SETUP.md) for all deployment methods
- **API questions?** Read [API.md](API.md) with request/response examples
- **Feature development?** Follow [PHASE_IMPLEMENTATIONS.md](PHASE_IMPLEMENTATIONS.md)

---

## 📋 Checklist: First Time Setup

- [ ] Read this guide (you're here ✓)
- [ ] Read [README.md](README.md) (15 min)
- [ ] `npm install` in root directory
- [ ] Try scraper: `node src/cli.js --search "restaurants" --location "NYC" --results 5`
- [ ] `cd webapp && npm run dev`
- [ ] Register account at http://localhost:3001
- [ ] Create API key in settings
- [ ] Create first scrape job via dashboard
- [ ] Read [SETUP.md](SETUP.md) if deploying

---

## 🎓 Learning Path

**Beginner (understand existing code):**
1. Read [README.md](README.md) - Overview (15 min)
2. Try examples: `node examples.js` (10 min)
3. Explore [src/](src/) source code (30 min)
4. Explore [webapp/](webapp/) routes and DB (30 min)

**Intermediate (customize & extend):**
1. Read [ROADMAP.md](ROADMAP.md) Phase 1-2 (30 min)
2. Follow [PHASE_IMPLEMENTATIONS.md](PHASE_IMPLEMENTATIONS.md) (15 min)
3. Add new endpoint following existing patterns
4. Test locally before deploying

**Advanced (deploy & scale):**
1. Read [SETUP.md](SETUP.md) - All 6 deployment options (30 min)
2. Choose platform and deploy to staging
3. Run production checklist
4. Monitor and optimize

---

## 📄 File Reference

| File | Purpose | Updates |
|------|---------|---------|
| [webapp/README.md](README.md) | Main documentation hub | When adding features |
| [webapp/SETUP.md](SETUP.md) | Deployment guide | Per deployment |
| [webapp/ROADMAP.md](ROADMAP.md) | 7-phase plan | As implementing |
| [webapp/API.md](API.md) | API reference | For new endpoints |
| [webapp/PHASE_IMPLEMENTATIONS.md](PHASE_IMPLEMENTATIONS.md) | Feature checklists | Throughout development |
| [webapp/schema.sql](schema.sql) | Database | Per new table |
| [webapp/package.json](package.json) | Dependencies | When adding libs |
| [webapp/.env.example](.env.example) | Config template | When adding vars |

---

**Last updated**: 2024
**Status**: MVP Complete + 7-Phase Roadmap
**Maintenance**: Community-driven contributions welcome

🎉 **Ready to build!** Pick a goal above and jump in.
