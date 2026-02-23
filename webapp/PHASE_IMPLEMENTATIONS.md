# Phase Implementation Checklist

Quick reference for implementing each phase. Use this to track progress and ensure nothing is missed.

---

## Phase 1: Payment Integration ✅ TODO

### Pre-Implementation
- [ ] Read [ROADMAP.md](ROADMAP.md#phase-1-payment-integration-priority-high)
- [ ] Create Stripe account at [stripe.com](https://stripe.com)
- [ ] Get API keys: Secret & Publishable
- [ ] Create credit packages in Stripe Dashboard

### Database
- [ ] Update `schema.sql`:
  ```sql
  ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
  
  CREATE TABLE subscriptions (...);
  CREATE TABLE invoices (...);
  ```
- [ ] Run migrations to update existing database

### Backend

#### New File: `routes/billing.js`
- [ ] `POST /billing/checkout` - Create Stripe Checkout session
- [ ] `POST /billing/subscribe` - Setup subscription
- [ ] `GET /billing/subscriptions` - Get user subscription
- [ ] `POST /billing/cancel-subscription` - Cancel subscription
- [ ] `GET /billing/invoices` - List invoices
- [ ] `GET /billing/invoices/:id` - Download invoice PDF

#### New File: `services/billingService.js`
- [ ] `createCheckoutSession(userId, packageId)`
- [ ] `addCreditsFromStripe(userId, amount, transactionId)`
- [ ] `createSubscription(userId, plan, stripeSubId)`
- [ ] `generateInvoice(userId, jobId, amount)`
- [ ] `cancelSubscription(userId)`

#### Update `server.js`
- [ ] Import billing routes
- [ ] Mount `/billing` routes
- [ ] Add Stripe webhook handler: `POST /webhooks/stripe`

#### Update `middleware.js`
- [ ] Add Stripe webhook verification (HMAC)

### Frontend

#### Update `public/index.html`
- [ ] Add "Buy Credits" button to dashboard
- [ ] Add billing tab with:
  - [ ] Credit packages (small, medium, large, enterprise)
  - [ ] Current subscription status
  - [ ] Invoice history
  - [ ] Billing portal link

#### Update `public/app.js`
- [ ] Add `createCheckout()` function
- [ ] Add `loadSubscription()` function
- [ ] Add `loadInvoices()` function
- [ ] Redirect to Stripe Checkout on purchase click

### Environment Variables
- [ ] Add to `.env`:
  ```env
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_PUBLISHABLE_KEY=pk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  ```

### Testing
- [ ] Install Stripe CLI
- [ ] Test checkout flow locally
- [ ] Test webhook delivery
- [ ] Test credit injection
- [ ] Verify database entries

### Deployment
- [ ] Deploy to staging
- [ ] Test with real Stripe test cards
- [ ] Verify webhooks deliver in production
- [ ] Deploy to production
- [ ] Monitor for errors

### Documentation
- [ ] Update [README.md](README.md) with billing info
- [ ] Update [API.md](API.md) with billing endpoints
- [ ] Create Stripe integration guide

### Success Criteria
- [ ] First customer subscription ✓
- [ ] Credits auto-added on payment ✓
- [ ] Invoice generated ✓
- [ ] Zero failed webhooks ✓

---

## Phase 2: Scheduled / Recurring Scrapes ✅ TODO

### Pre-Implementation
- [ ] Read [ROADMAP.md](ROADMAP.md#phase-2-scheduled--recurring-scrapes-priority-high)
- [ ] Understand cron syntax (0 9 * * MON notation)
- [ ] Plan scheduler architecture (no external services needed)

### Database
- [ ] Verify `schema.sql` has:
  ```sql
  saved_searches (already exists)
  scheduled_runs (add if missing)
  ```
- [ ] Create indexes for performance

### Backend

#### New File: `scheduler.js`
- [ ] Import `node-cron`
- [ ] `class SchedulerService { ... }`
- [ ] `start()` - Load and schedule all active searches
- [ ] `scheduleSearch(search)` - Add a cron job
- [ ] `runSearch(search)` - Execute the scrape
- [ ] `stop()` - Cleanly shutdown

#### New File: `routes/scheduled.js`
- [ ] `POST /scheduled/saved-searches` - Create saved search
- [ ] `GET /scheduled/saved-searches` - List user's searches
- [ ] `PUT /scheduled/saved-searches/:id` - Update search
- [ ] `DELETE /scheduled/saved-searches/:id` - Delete search
- [ ] `GET /scheduled/saved-searches/:id/history` - View run history

#### New File: `services/schedulerService.js`
- [ ] `createSavedSearch(userId, params)` - Validate & save
- [ ] `executeSavedSearch(searchId)` - Run immediately
- [ ] `getRunHistory(searchId)` - Query past runs

#### Update `server.js`
- [ ] Import scheduler and routes
- [ ] `scheduler.start()` on server startup
- [ ] `scheduler.stop()` on SIGTERM
- [ ] Mount `/scheduled` routes

#### Update `routes/schedule.js`
- [ ] Link saved search updates to scheduler reschedule

### Frontend

#### Update `public/index.html`
- [ ] Add "Scheduled Searches" tab
- [ ] Cron editor form:
  - [ ] Name
  - [ ] Search terms
  - [ ] Location
  - [ ] Cron schedule (text input or UI picker)
  - [ ] Min rating, max results

#### Update `public/app.js`
- [ ] `createSavedSearch()` - API call to create
- [ ] `loadScheduledSearches()` - Fetch and display
- [ ] `deleteSavedSearch(id)` - Remove search
- [ ] `viewRunHistory(id)` - Show past runs
- [ ] Auto-refresh run history on scheduler tab

### Environment Variables
- [ ] Add to `.env` (optional):
  ```env
  SCHEDULER_ENABLED=true
  SCHEDULER_MAX_CONCURRENT=3
  SCHEDULER_TIMEZONE=America/New_York
  ```

### Dependencies
- [ ] `npm install node-cron`
- [ ] Verify installation: `npm ls node-cron`

### Testing
- [ ] Create test saved search (runs every minute)
- [ ] Watch logs: `npm run webapp:dev`
- [ ] Verify job executes at scheduled time
- [ ] Check credits deducted
- [ ] Test multiple concurrent runs
- [ ] Test pause/resume

### Deployment
- [ ] Deploy to staging
- [ ] Test scheduled job execution
- [ ] Monitor cron timing accuracy
- [ ] Deploy to production
- [ ] Setup uptime monitoring for scheduler

### Documentation
- [ ] Update [README.md](README.md) with scheduler info
- [ ] Update [API.md](API.md) with `/scheduled` endpoints
- [ ] Add cron examples to docs

### Success Criteria
- [ ] Scheduled job runs at correct time ✓
- [ ] Credits deducted on execution ✓
- [ ] Multiple jobs run without conflicts ✓
- [ ] Run history tracked ✓

---

## Phase 3: Email Enrichment ✅ TODO

### Pre-Implementation
- [ ] Read [ROADMAP.md](ROADMAP.md#phase-3-email-enrichment-priority-medium)
- [ ] Decide on email extractor library (cheerio + puppeteer or jsdom)
- [ ] Plan enrichment credit cost (e.g., 0.5 per email)

### Database
- [ ] Update `schema.sql`:
  ```sql
  ALTER TABLE scrape_jobs ADD COLUMN enriched_at TEXT;
  
  CREATE TABLE enriched_emails (...);
  CREATE TABLE email_validation_logs (...);
  ```

### Backend

#### New File: `services/enrichmentService.js`
- [ ] `crawlWebsiteForEmails(url)` - Extract emails from site
- [ ] `validateEmail(email)` - Check validity
- [ ] `enrichJobResults(jobId)` - Add emails to all places in job
- [ ] `addEmailsToPlace(placeId, emails)` - Save emails

#### New File: `routes/enrich.js`
- [ ] `POST /enrich/job/:jobId` - Enrich existing job
- [ ] `GET /enrich/status/:jobId` - Check enrichment status
- [ ] `POST /enrich/validate-email` - Validate single email

#### Update `routes/scrape.js`
- [ ] Add `emailEnriched` field to export
- [ ] Option to enrich during scrape

### Frontend

#### Update `public/index.html`
- [ ] Add checkbox: "Enrich with emails (0.5 credits per place)"
- [ ] Show email addresses in results table
- [ ] Add filter: "Only places with emails"

### Testing
- [ ] Extract emails from known websites
- [ ] Test validation
- [ ] Verify credit deduction
- [ ] Test bulk enrichment on existing job

### Deployment
- [ ] Deploy to staging
- [ ] Test enrichment quality
- [ ] Monitor processing time
- [ ] Deploy to production

### Documentation
- [ ] Update API docs
- [ ] Add enrichment to README

### Success Criteria
- [ ] Emails extracted from 80%+ of sites ✓
- [ ] Credits deducted correctly ✓
- [ ] Validation prevents bad data ✓

---

## Phase 4: Teams / Organizations ✅ TODO

### Pre-Implementation
- [ ] Read [ROADMAP.md](ROADMAP.md#phase-4-team--multi-user-organizations-priority-medium)
- [ ] Design org hierarchy: owner > admin > member

### Database
- [ ] Update `schema.sql`:
  ```sql
  CREATE TABLE organizations (...);
  CREATE TABLE org_members (...);
  ALTER TABLE credit_transactions ADD COLUMN org_id;
  ```

### Backend

#### New File: `routes/orgs.js`
- [ ] `POST /orgs` - Create organization
- [ ] `GET / orgs` - Get user's orgs
- [ ] `PUT /orgs/:id` - Update org
- [ ] `POST /orgs/:id/members` - Invite member
- [ ] `DELETE /orgs/:id/members/:userId` - Remove member
- [ ] `PUT /orgs/:id/members/:userId` - Change role

#### Update `middleware.js`
- [ ] Add org-level auth layer
- [ ] Check membership before accessing org resources

### Frontend
- [ ] Add teams/organizations tab
- [ ] Create org form
- [ ] Members list with invite interface
- [ ] Switch between orgs

### Testing
- [ ] Create org with multiple members
- [ ] Test role-based access
- [ ] Verify credit sharing works

### Deployment
- [ ] Test multi-user scenarios
- [ ] Deploy to production

---

## Phase 5: Data Deduplication & History ✅ TODO

### Database
- [ ] Add `places` table (global unique places by placeId)
- [ ] Add `job_places` junction table

### Backend

#### New File: `routes/places.js`
- [ ] Browse all scraped places
- [ ] View scrape history for a place
- [ ] Track rating/review changes

### Features
- [ ] Detect duplicates in results
- [ ] Skip re-scraping known places
- [ ] Monitor mode: alert on changes

---

## Phase 6: React/Vue Frontend ✅ TODO

### Setup
- [ ] Create `webapp/frontend/` directory
- [ ] Initialize React/Vue project
- [ ] Configure Vite/webpack build

### Build
- [ ] Migrate components from vanilla JS
- [ ] Add dark mode
- [ ] Add responsive design
- [ ] Build outputs to `public/`

---

## Phase 7: Admin Panel ✅ TODO

### Database
- [ ] Add admin role to users table

### Backend

#### New File: `routes/admin.js`
- [ ] `GET /admin/users` - List all users
- [ ] `GET /admin/stats` - System stats
- [ ] `POST /admin/users/:id/credits` - Grant credits
- [ ] `POST /admin/users/:id/ban` - Suspend user

### Frontend
- [ ] Create admin dashboard
- [ ] User management interface
- [ ] Analytics & reporting

---

## General Checklist (All Phases)

### Before Starting
- [ ] Read entire [ROADMAP.md](ROADMAP.md)
- [ ] Review [SETUP.md](SETUP.md) for deployment
- [ ] Understand [API.md](API.md) endpoints

### During Implementation
- [ ] Write tests as you go (`tests/phase-X.test.js`)
- [ ] Update docs incrementally
- [ ] Commit frequently with clear messages
- [ ] Run `npm run webapp:dev` to verify

### Before Merging
- [ ] All tests pass
- [ ] Documentation updated
- [ ] No console errors
- [ ] API endpoints work
- [ ] Database migrations tested

### Before Deploying
- [ ] Tag release: `git tag v1.0-phase-X`
- [ ] Update CHANGELOG.md
- [ ] Test in staging environment
- [ ] Brief production checklist
- [ ] Monitor after deployment

---

## Quick Command Reference

```bash
# Start dev server
npm run webapp:dev

# Test API endpoint
curl -X GET http://localhost:3001/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check database
sqlite3 webapp/data/mapscraper.db
> SELECT * FROM users;

# View logs (tail)
pm2 logs mapscraper

# Restart after code changes
npm run webapp:start
```

---

## Priority Matrix

```
High Priority (Build ASAP):
├─ Phase 1: Payment ($$ revenue)
└─ Phase 2: Scheduler (engagement)

Medium Priority (Build Soon):
├─ Phase 3: Enrichment (premium feature)
└─ Phase 4: Teams (B2B growth)

Lower Priority (Build After):
├─ Phase 5: Deduplication (data quality)
├─ Phase 6: React Frontend (UX polish)
└─ Phase 7: Admin Panel (operations)
```

---

**Start here**: Pick a phase above, complete the checklist, then deploy! 🚀
