# MapScraper SaaS - Development Roadmap

7-phase plan to build the complete lead generation SaaS platform. This document details what needs to be built, technical architecture, and estimated effort for each phase.

```
Phase 1: Payment             Phase 2: Scheduler         Phase 3: Enrichment
├─ Stripe Checkout          ├─ Cron runner             ├─ Email extraction
├─ Subscriptions            ├─ Saved searches          ├─ Contact crawling
└─ Invoices                 └─ Email notifications     └─ New data fields

Phase 4: Teams              Phase 5: Deduplication    Phase 6: Frontend       Phase 7: Admin
├─ Organizations            ├─ Place tracking         ├─ React/Vue            ├─ User management
├─ Shared credits           ├─ Duplicate detection    ├─ Components           ├─ Revenue analytics
└─ Org-level auth           └─ Change monitoring      └─ Dashboards           └─ Support tools
```

---

## Phase 1: Payment Integration (Priority: HIGH)

**Goal**: Users can purchase credits with real money via Stripe.

**Timeline**: 2-3 weeks  
**Estimated Effort**: 40-60 hours  
**Business Impact**: Enable revenue generation

### Features

#### 1.1 Stripe Checkout Integration

Users can purchase credits in predefined packages:

```
Package          Credits    Price
────────────────────────────────
Small             500       $10
Medium          2,000       $35
Large           5,000       $75
Enterprise     15,000       $200
```

**Flow**:
1. User clicks "Buy Credits"
2. Modal with package options
3. Redirects to Stripe Checkout
4. On success, webhook auto-adds credits
5. Return to dashboard with updated balance

**Files to create/modify**:

- **`routes/billing.js`** (new)
  ```javascript
  // POST /billing/create-checkout-session
  // Params: packageId, quantity
  // Returns: { checkoutUrl, sessionId }
  
  // POST /billing/customer-portal
  // Returns: { portalUrl }
  ```

- **`services/billingService.js`** (new)
  ```javascript
  // createCheckoutSession(userId, packageId)
  // addCreditsFromStripe(userId, amount, transactionId)
  // createInvoice(userId, jobId, creditsUsed)
  ```

- **`schema.sql`** (update)
  ```sql
  -- Add to users table
  ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
  
  -- New tables
  CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      plan TEXT DEFAULT 'free',  -- free, starter, pro, business
      stripe_subscription_id TEXT,
      credits_per_month INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',  -- active, cancelled, past_due
      renewal_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      stripe_invoice_id TEXT UNIQUE,
      amount_cents INTEGER,
      status TEXT,  -- draft, open, paid, cancelled, uncollectible
      pdf_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  ```

- **`public/index.html`** (update)
  - Add "Buy Credits" button
  - Credit packages modal with pricing
  - Billing history tab
  - Subscription management

- **`server.js`** (update)
  ```javascript
  import billingRoutes from './routes/billing.js';
  app.use('/billing', billingRoutes);
  
  // Stripe webhook
  app.post('/webhooks/stripe', stripeWebhookHandler);
  ```

#### 1.2 Subscription Plans

**Free Plan** (default)
- 100 credits/month
- API access
- Dashboard
- Community support

**Starter** ($29/month)
- 1,000 credits/month
- Email support
- Scheduled scrapes [Phase 2]
- API webhooks

**Pro** ($79/month)
- 5,000 credits/month
- Priority support
- Email enrichment [Phase 3]
- Advanced filtering

**Business** ($199/month)
- 20,000 credits/month
- Phone support
- Team management [Phase 4]
- Custom integrations

**Implementation**:
```javascript
// routes/billing.js

POST /billing/subscribe
  Params: { plan: 'starter'|'pro'|'business' }
  Auth: JWT/Key
  Returns: { subscription, nextBillingDate }

GET /billing/subscriptions
  Auth: JWT/Key
  Returns: [ { plan, status, creditsRemaining, renewalDate } ]

POST /billing/cancel-subscription
  Auth: JWT/Key
  Returns: { status, effectiveDate }
```

#### 1.3 Webhook Handling

Stripe webhooks automatically:
- Add credits on successful payment
- Update subscription status
- Generate invoices
- Send confirmation emails [Phase 2]

```javascript
// services/billingService.js

function handleStripeWebhook(event) {
  switch (event.type) {
    case 'charge.succeeded':
      // Add credits to user
      addCredits(userId, amountInCredits);
      break;
    
    case 'customer.subscription.updated':
      // Update subscription status in DB
      updateSubscription(userId, newPlan);
      break;
    
    case 'customer.subscription.deleted':
      // Downgrade to free plan
      downgradeToFree(userId);
      break;
  }
}
```

#### 1.4 Manual Top-up

For users on free/starter/pro:

```javascript
POST /billing/topup
  Params: { packageId }
  Auth: JWT/Key
  Returns: { checkoutUrl }
```

Redirects to Stripe, auto-adds credits on success.

#### 1.5 Invoicing

Auto-generate invoices for:
- One-time purchases
- Monthly subscriptions
- Usage-based overages

```javascript
GET /billing/invoices
  Auth: JWT/Key
  Returns: [ { id, date, amount, status, pdfUrl } ]

GET /billing/invoices/:id
  Auth: JWT/Key
  Returns: PDF file
```

### Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Forward webhooks locally
stripe listen --forward-to localhost:3001/webhooks/stripe

# Trigger test events
stripe trigger charge.succeeded

# Test checkout
npm run webapp:dev
# Go to http://localhost:3001
# Click "Buy Credits"
# Use test card: 4242 4242 4242 4242
```

### Deployment Notes

1. **Stripe secrets**: Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in production
2. **HTTPS required**: Stripe won't work without HTTPS
3. **Customer portal**: Enable in Stripe Dashboard for self-service billing
4. **Tax**: Add tax collection if required by your jurisdiction

### Success Metrics

- [ ] First customer subscription ✓
- [ ] Zero failed payments ✓
- [ ] Invoice auto-sent within 5 min ✓
- [ ] Webhook delivery 100% ✓

---

## Phase 2: Scheduled / Recurring Scrapes (Priority: HIGH)

**Goal**: Users can set up scrapes to run automatically on a schedule.

**Timeline**: 2-3 weeks  
**Estimated Effort**: 35-50 hours  
**Business Impact**: Increase user engagement, recurring revenue

### Features

#### 2.1 Saved Searches

Save and reuse search configurations:

```javascript
POST /scheduled/saved-searches
  Params: {
    name: "Weekly Pizza Leads",
    searchTerms: "pizza restaurant pizzeria",
    location: "New York, NY",
    maxResults: 50,
    schedule: "0 9 * * MON",  // Cron format
    minRating: 4.0,
    language: "en",
    timezone: "America/New_York"
  }
  Auth: JWT/Key
  Returns: { id, nextRunAt }

GET /scheduled/saved-searches
  Auth: JWT/Key
  Returns: [ { id, name, schedule, nextRunAt, lastRunAt, status } ]

GET /scheduled/saved-searches/:id/history
  Auth: JWT/Key  
  Returns: [ { runId, startedAt, completedAt, result_count, creditsUsed } ]

PUT /scheduled/saved-searches/:id
  Params: { ...updates }
  Auth: JWT/Key
  Returns: { updatedSearch }

DELETE /scheduled/saved-searches/:id
  Auth: JWT/Key
  Returns: { status: 'deleted' }
```

**Database**:
```sql
-- Already exists in schema.sql
CREATE TABLE IF NOT EXISTS saved_searches (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    search_terms TEXT NOT NULL,
    location TEXT NOT NULL,
    max_results INTEGER DEFAULT 50,
    schedule TEXT,  -- Cron format: "0 9 * * MON"
    min_rating REAL,
    language TEXT DEFAULT 'en',
    timezone TEXT DEFAULT 'America/New_York',
    is_active INTEGER DEFAULT 1,
    last_run_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Link saved search runs to scrape jobs
CREATE TABLE IF NOT EXISTS scheduled_runs (
    id INTEGER PRIMARY KEY,
    saved_search_id INTEGER NOT NULL,
    scrape_job_id TEXT NOT NULL,
    scheduled_for TEXT,
    started_at TEXT,
    completed_at TEXT,
    status TEXT DEFAULT 'pending',
    error TEXT,
    FOREIGN KEY (saved_search_id) REFERENCES saved_searches(id) ON DELETE CASCADE,
    FOREIGN KEY (scrape_job_id) REFERENCES scrape_jobs(id) ON DELETE CASCADE
);
```

#### 2.2 Scheduler Service

**File**: `webapp/scheduler.js`

```javascript
import cron from 'node-cron';
import db from './db.js';
import GoogleMapsScraper from '../src/scraper.js';

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.maxConcurrent = 3;
    this.running = 0;
  }

  /**
   * Start scheduler - run once on server startup
   */
  async start() {
    console.log('Starting scheduler...');

    // Load all active saved searches
    const searches = db.prepare(`
      SELECT * FROM saved_searches WHERE is_active = 1
    `).all();

    for (const search of searches) {
      this.scheduleSearch(search);
    }

    console.log(`Scheduled ${searches.length} searches`);
  }

  /**
   * Schedule a single search
   */
  scheduleSearch(search) {
    // Cancel existing job if any
    if (this.jobs.has(search.id)) {
      this.jobs.get(search.id).stop();
    }

    // Create cron job
    const job = cron.schedule(search.schedule, () => {
      this.runSearch(search);
    });

    this.jobs.set(search.id, job);
  }

  /**
   * Execute a scheduled search
   */
  async runSearch(search) {
    // Check concurrent limit
    if (this.running >= this.maxConcurrent) {
      console.log(`Max concurrent reached, queue delayed`);
      return;
    }

    this.running++;

    try {
      const user = db.prepare(`
        SELECT * FROM users WHERE id = ?
      `).get(search.user_id);

      // Check credits
      if (user.credits < search.max_results) {
        console.warn(`Insufficient credits for search ${search.id}`);
        return;
      }

      // Create scrape job
      const scraper = new GoogleMapsScraper({
        maxResults: search.max_results,
      });

      await scraper.initialize();

      const results = await scraper.searchPlaces(
        search.search_terms,
        search.location,
        {
          minRating: search.min_rating,
          maxResults: search.max_results
        }
      );

      // Save job & deduct credits
      const jobId = `job_${Date.now()}`;
      db.transaction(() => {
        db.prepare(`
          INSERT INTO scrape_jobs (id, user_id, status, params, results, result_count, credits_used)
          VALUES (?, ?, 'completed', ?, ?, ?, ?)
        `).run(
          jobId,
          search.user_id,
          JSON.stringify({
            searchTerms: search.search_terms,
            location: search.location,
            maxResults: search.max_results,
            source: 'scheduled'
          }),
          JSON.stringify(results),
          results.length,
          results.length
        );

        // Deduct credits
        db.prepare(`
          UPDATE users SET credits = credits - ? WHERE id = ?
        `).run(results.length, search.user_id);

        // Log transaction
        db.prepare(`
          INSERT INTO credit_transactions (user_id, amount, type, description, job_id)
          VALUES (?, ?, 'scrape', ?, ?)
        `).run(search.user_id, -results.length, `Scheduled search: ${search.name}`, jobId);

        // Record run
        db.prepare(`
          INSERT INTO scheduled_runs (saved_search_id, scrape_job_id, started_at, completed_at, status)
          VALUES (?, ?, datetime('now'), datetime('now'), 'completed')
        `).run(search.id, jobId);

        // Update last_run_at
        db.prepare(`
          UPDATE saved_searches SET last_run_at = datetime('now') WHERE id = ?
        `).run(search.id);
      })();

      // Send notification [Phase 3]
      // await sendNotification(user.email, results.length);

      await scraper.close();
    } catch (error) {
      console.error(`Scheduled search failed: ${error.message}`);
      // Log error in DB
      db.prepare(`
        UPDATE scheduled_runs SET status = 'failed', error = ? 
        WHERE saved_search_id = ? ORDER BY id DESC LIMIT 1
      `).run(error.message, search.id);
    } finally {
      this.running--;
    }
  }

  /**
   * Stop all jobs (on server shutdown)
   */
  stop() {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    console.log('Scheduler stopped');
  }
}

export default new SchedulerService();
```

#### 2.3 Route Handler

**File**: `webapp/routes/scheduled.js`

```javascript
import express from 'express';
import { authenticateToken } from '../middleware.js';
import db from '../db.js';
import scheduler from '../scheduler.js';

const router = express.Router();

// Create saved search
router.post('/saved-searches', authenticateToken, (req, res) => {
  const { name, searchTerms, location, maxResults, schedule, minRating } = req.body;

  const id = db.prepare(`
    INSERT INTO saved_searches 
    (user_id, name, search_terms, location, max_results, schedule, min_rating, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    req.user.id, name, searchTerms, location, maxResults, schedule, minRating
  ).lastInsertRowid;

  // Schedule it
  const search = db.prepare(`SELECT * FROM saved_searches WHERE id = ?`).get(id);
  scheduler.scheduleSearch(search);

  res.json({ id, status: 'scheduled' });
});

// List saved searches
router.get('/saved-searches', authenticateToken, (req, res) => {
  const searches = db.prepare(`
    SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);

  res.json(searches);
});

// Get run history for a search
router.get('/saved-searches/:id/history', authenticateToken, (req, res) => {
  const runs = db.prepare(`
    SELECT sr.*, sj.result_count, sj.credits_used
    FROM scheduled_runs sr
    JOIN scrape_jobs sj ON sr.scrape_job_id = sj.id
    WHERE sr.saved_search_id = ?
    ORDER BY sr.completed_at DESC
    LIMIT 50
  `).all(req.params.id);

  res.json(runs);
});

// Update saved search
router.put('/saved-searches/:id', authenticateToken, (req, res) => {
  const search = db.prepare(`
    SELECT * FROM saved_searches WHERE id = ? AND user_id = ?
  `).get(req.params.id, req.user.id);

  if (!search) return res.status(404).json({ error: 'Not found' });

  const { name, schedule, minRating, isActive } = req.body;
  db.prepare(`
    UPDATE saved_searches 
    SET name = ?, schedule = ?, min_rating = ?, is_active = ?
    WHERE id = ?
  `).run(name, schedule, minRating, isActive ? 1 : 0, req.params.id);

  // Reschedule if active
  if (isActive) {
    const updated = db.prepare(`SELECT * FROM saved_searches WHERE id = ?`).get(req.params.id);
    scheduler.scheduleSearch(updated);
  } else {
    // Stop scheduling
    if (scheduler.jobs.has(parseInt(req.params.id))) {
      scheduler.jobs.get(parseInt(req.params.id)).stop();
      scheduler.jobs.delete(parseInt(req.params.id));
    }
  }

  res.json({ status: 'updated' });
});

// Delete saved search
router.delete('/saved-searches/:id', authenticateToken, (req, res) => {
  const search = db.prepare(`
    SELECT * FROM saved_searches WHERE id = ? AND user_id = ?
  `).get(req.params.id, req.user.id);

  if (!search) return res.status(404).json({ error: 'Not found' });

  db.prepare(`DELETE FROM saved_searches WHERE id = ?`).run(req.params.id);
  
  // Stop job
  if (scheduler.jobs.has(parseInt(req.params.id))) {
    scheduler.jobs.get(parseInt(req.params.id)).stop();
    scheduler.jobs.delete(parseInt(req.params.id));
  }

  res.json({ status: 'deleted' });
});

export default router;
```

#### 2.4 Server Integration

**File**: `webapp/server.js` (update)

```javascript
import scheduler from './scheduler.js';
import scheduledRoutes from './routes/scheduled.js';

// ... other setup ...

// Mount routes
app.use('/scheduled', scheduledRoutes);

// Start scheduler on server start
scheduler.start();

// Stop scheduler on shutdown
process.on('SIGTERM', () => {
  scheduler.stop();
  process.exit(0);
});
```

#### 2.5 UI Components

**File**: `public/index.html` (add tab)

```html
<div id="scheduled-tab" class="tab-panel">
  <h2>Scheduled Searches</h2>
  
  <div class="section">
    <!-- Create new -->
    <div class="cron-editor">
      <label>
        Name:
        <input type="text" id="schedule-name" placeholder="Weekly Pizza Leads">
      </label>
      
      <label>
        Search Terms:
        <input type="text" id="schedule-terms" placeholder="pizza restaurant pizzeria">
      </label>
      
      <label>
        Location:
        <input type="text" id="schedule-location" placeholder="New York">
      </label>
      
      <label>
        Schedule (Cron):
        <input type="text" id="schedule-cron" placeholder="0 9 * * MON" title="Every Monday 9am UTC">
      </label>
      
      <button onclick="createSchedule()">Save Schedule</button>
    </div>
  </div>
  
  <!-- List of scheduled searches -->
  <div class="section">
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Schedule</th>
          <th>Next Run</th>
          <th>Last Run</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="scheduled-list"></tbody>
    </table>
  </div>
</div>
```

### Dependencies

```bash
npm install node-cron
```

### Testing

```bash
# Create a test saved search that runs every minute
curl -X POST http://localhost:3001/scheduled/saved-searches \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Schedule",
    "searchTerms": "cafe",
    "location": "London",
    "maxResults": 5,
    "schedule": "* * * * *"
  }'

# Watch the scheduler run the job
npm run webapp:dev  # Check console logs
```

### Success Metrics

- [ ] Scheduled jobs run on time ✓
- [ ] Credits deducted correctly ✓
- [ ] Zero race conditions in concurrent execution ✓
- [ ] Webhook notifications sent [Phase 3] ✓

---

## Phase 3: Email Enrichment (Priority: MEDIUM)

**Goal**: Extract emails from business websites to enrich lead data.

**Timeline**: 2 weeks  
**Estimated Effort**: 25-35 hours  
**Business Impact**: Higher-quality leads, premium feature

### Features Planned

- [ ] Extract emails from `website` URL
- [ ] Parse contact pages, footers, `mailto:` links
- [ ] Separate enrichment cost (0.5 credits per email)
- [ ] Bulk enrichment for existing jobs
- [ ] Email validation & deduplication
- [ ] Async processing with job queue [Phase 2+]

**Files to create**:
- `services/enrichmentService.js`
- `routes/enrich.js` (new)

---

## Phase 4: Teams / Multi-User Organizations (Priority: MEDIUM)

**Goal**: Multiple users under one organization with shared credits.

**Timeline**: 3 weeks  
**Estimated Effort**: 40-60 hours  
**Business Impact**: B2B growth, higher LTV

### Features Planned

- [ ] Create organizations with owner & members
- [ ] Role-based access (owner/admin/member)
- [ ] Shared credit pool
- [ ] Invite users via email
- [ ] Usage visibility by team member
- [ ] Org-level API keys
- [ ] Usage quotas per member

**Files to create**:
- `routes/orgs.js` (new)
- `schema.sql` (add org tables)
- `middleware.js` (org auth layer)

---

## Phase 5: Data Deduplication & History (Priority: MEDIUM)

**Goal**: Avoid duplicate scrapes, track changes over time.

**Timeline**: 2 weeks  
**Estimated Effort**: 30-45 hours  
**Business Impact**: Cost savings, data quality

### Features Planned

- [ ] Global `places` table by Google `placeId`
- [ ] Detect duplicate places across jobs
- [ ] Track rating/review changes
- [ ] "Monitor" mode alerts (price drop, closure, etc.)
- [ ] Dedup before returning results
- [ ] Merge results from multiple searches

**Files to create**:
- `routes/places.js` (new)
- `schema.sql` (add place tables)
- `services/deduplicationService.js`

---

## Phase 6: Frontend Upgrade to React/Vue (Priority: LOW)

**Goal**: Replace vanilla JS dashboard with modern SPA framework.

**Timeline**: 3-4 weeks  
**Estimated Effort**: 50-80 hours  
**Business Impact**: Better UX, developer velocity

### Features Planned

- [ ] React or Vue.js SPA
- [ ] Component library (shadcn/ui, Radix, Vuetify)
- [ ] Advanced data tables (sorting, filtering, pagination)
- [ ] Charts & analytics dashboard
- [ ] Map view of results
- [ ] Dark mode
- [ ] Mobile responsive design
- [ ] Build step with vite/webpack

**Folder**:
```
webapp/frontend/
├── package.json
├── vite.config.js
├── src/
│   ├── App.jsx
│   ├── components/
│   │   ├── SearchForm.jsx
│   │   ├── ResultsTable.jsx
│   │   ├── JobHistory.jsx
│   │   └── ...
│   ├── pages/
│   └── api.js
└── public/
    └── index.html
```

Build outputs to `webapp/public/dist/`

---

## Phase 7: Admin Panel (Priority: LOW)

**Goal**: Internal dashboard for managing users and monitoring platform.

**Timeline**: 2 weeks  
**Estimated Effort**: 25-40 hours  
**Business Impact**: Platform operations, support efficiency

### Features Planned

- [ ] Admin-only routes (`/admin/*`)
- [ ] View all users & credit balances
- [ ] Manual credit grants/refunds
- [ ] System analytics (users, scrapes, revenue)
- [ ] Ban/suspend users
- [ ] Error logs & debugging
- [ ] Email delivery logs
- [ ] Payment dispute management

**Files to create**:
- `routes/admin.js` (new)
- `middleware.js` (admin auth)
- `public/admin/` (separate UI)

---

## Implementation Workflow

### Phase Selection

**For MVP (before Phase 1)**:
- ✅ User registration & login
- ✅ Credit system
- ✅ Scrape jobs
- ✅ API endpoints
- ✅ Basic dashboard

**Next (Phase 1-2)**:
- 🔄 Payment integration
- 🔄 Scheduled scrapes
- 🔄 Needed for revenue & engagement

**Later (Phase 3-7)**:
- 📅 Advanced features
- 📅 Polish & optimization

### Per-Phase Checklist

For each phase:
1. Update `schema.sql` with new tables
2. Create route file(s) in `routes/`
3. Create service file(s) in `services/`
4. Add migration if DB changes
5. Update `server.js` to mount routes
6. Add UI in `public/index.html`
7. Write tests in `tests/`
8. Update `README.md` & `API.md`
9. Tag git release
10. Deploy to staging

### Code Organization

```javascript
// Phase structure example

// routes/payment.js
export async function handleCheckout(req, res) {
  // Input validation
  // DB transaction
  // Call Stripe API
  // Return response
}

// services/billingService.js
export class BillingsService {
  static async processPayment(userId, amount) { ... }
  static async refund(userId, amount) { ... }
  static async generateInvoice(userId, jobId) { ... }
}

// Tests should follow
tests/
├── auth.test.js
├── scrape.test.js
├── billing.test.js  // Phase 1
├── scheduled.test.js  // Phase 2
└── ...
```

---

## Timeline & Milestones

```
Q1 2026:
  - Week 1-2: Phase 1 (Payment)
  - Week 3-4: Phase 1 testing & launch
  - Week 5-6: Phase 2 (Scheduler)

Q2 2026:
  - Week 1-2: Phase 2 testing & launch
  - Week 3-4: Phase 3 (Enrichment)
  - Phase 4-7 (as capacity allows)

Q3+ 2026:
  - Remaining phases
  - Scaling optimizations
  - Regional expansion
```

---

## Budget & Resourcing

### Team

**MVP Phase** (what's built):
- 1 Full-stack developer: 4 weeks

**Phase 1** (Payment):
- 1 Backend developer: 3 weeks
- 0.5 Frontend developer: 1 week
- Stripe API expertise: existing

**Phase 2** (Scheduler):
- 1 Backend developer: 2-3 weeks
- Email/notification service: external or Phase 3

**Phases 3-7**:
- Scale team based on goals/timeline

### Costs

| Item | Phase 1-2 | Phase 3-7 |
|------|-----------|-----------|
| Stripe fee | 2.9% + $0.30 per payment | Same |
| SendGrid (emails) | ~$30/mo | ~$300+/mo |
| Redis (job queue) | $10/mo | $30+/mo |
| PostgreSQL (scale) | $9/mo | $50+/mo |
| Monitoring (Sentry) | $29/mo | $99+/mo |
| **Total** | ~$80-100/mo | ~$500+/mo |

---

## Success Metrics

Per phase, measure:

- ✅ Feature completion
- ✅ Test coverage >80%
- ✅ Deploy without downtime
- ✅ User adoption
- ✅ Revenue impact
- ✅ Bug/error rates <0.1%

---

## Questions & Updates

- Update this document as features change
- Reference specific phases in PR descriptions
- Tag releases: `v1.0-phase1`, `v1.1-phase2`, etc.

---

**Ready to build Phase 1?** See [SETUP.md](SETUP.md) for deployment, then create `routes/billing.js`.
