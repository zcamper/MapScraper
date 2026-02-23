# MapScraper SaaS - API Reference

Complete API documentation for all endpoints. Base URL: `http://localhost:3001` (or your deployment URL).

**Authentication**: All endpoints (except `/auth/register` and `/auth/login`) require:
- `Authorization: Bearer <JWT_TOKEN>` OR
- `X-API-Key: <API_KEY>`

---

## Authentication (`/auth`)

### Register

```
POST /auth/register

Body:
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe"  // optional
}

Response (201):
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "apiKey": "msk_1234567890abcdef",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "credits": 100,
    "plan": "free"
  }
}

Error (400):
{ "error": "Email already registered" }
{ "error": "Password must be at least 8 characters" }
```

### Login

```
POST /auth/login

Body:
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}

Response (200):
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "credits": 100,
    "plan": "free"
  }
}

Error (401):
{ "error": "Invalid credentials" }
```

### Get Profile

```
GET /auth/me

Headers:
Authorization: Bearer <JWT_TOKEN>
OR
X-API-Key: <API_KEY>

Response (200):
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "credits": 85,
    "plan": "free",
    "created_at": "2026-02-20T10:00:00Z"
  },
  "apiKeys": [
    {
      "id": 1,
      "name": "Default",
      "key": "msk_1234567890abcdef",
      "is_active": 1,
      "created_at": "2026-02-20T10:00:00Z",
      "last_used_at": "2026-02-21T15:30:00Z"
    }
  ],
  "jobCount": 5,
  "recentJobs": [
    {
      "id": "job_1708515600000",
      "status": "completed",
      "result_count": 12,
      "credits_used": 12,
      "created_at": "2026-02-21T15:00:00Z"
    }
  ]
}

Error (401):
{ "error": "Authentication required" }
```

### Generate API Key

```
POST /auth/api-keys

Headers:
Authorization: Bearer <JWT_TOKEN>

Body:
{
  "name": "Development Key"  // optional, defaults to timestamp
}

Response (201):
{
  "id": 2,
  "name": "Development Key",
  "key": "msk_newkeyhere123456789",
  "is_active": 1,
  "created_at": "2026-02-21T16:00:00Z"
}
```

### Revoke API Key

```
DELETE /auth/api-keys/:id

Headers:
Authorization: Bearer <JWT_TOKEN>

Response (200):
{ "status": "deleted" }

Error (404):
{ "error": "API key not found" }
```

---

## Scraping (`/scrape`)

### Create Scrape Job

```
POST /scrape

Headers:
Authorization: Bearer <JWT_TOKEN>
OR
X-API-Key: <API_KEY>
Content-Type: application/json

Body:
{
  "searchTerms": "pizza restaurant pizzeria",  // required
  "location": "New York, NY",                   // required
  "maxResults": 50,                            // optional, default 120
  "language": "en",                            // optional
  "minRating": 4.0,                            // optional
  "reviews": true,                             // optional, default true
  "categories": ["restaurant"]                 // optional
}

Response (201):
{
  "jobId": "job_1708515600000",
  "status": "queued",
  "created_at": "2026-02-21T16:00:00Z",
  "estimatedCompletion": "2026-02-21T16:05:00Z"
}

Error (400):
{ "error": "searchTerms and location are required" }

Error (402):
{ "error": "Insufficient credits", "creditsRequired": 50, "creditsAvailable": 10 }
```

### List Jobs

```
GET /scrape/jobs

Headers:
Authorization: Bearer <JWT_TOKEN>

Query Parameters:
?page=1                    // optional, default 1
&limit=10                  // optional, default 10
&status=completed          // optional: queued, running, completed, failed

Response (200):
{
  "jobs": [
    {
      "id": "job_1708515600000",
      "status": "completed",
      "params": {
        "searchTerms": "pizza restaurant",
        "location": "New York",
        "maxResults": 50
      },
      "result_count": 45,
      "credits_used": 45,
      "error": null,
      "created_at": "2026-02-21T16:00:00Z",
      "started_at": "2026-02-21T16:00:05Z",
      "completed_at": "2026-02-21T16:04:30Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "hasMore": true
  }
}
```

### Get Job Details

```
GET /scrape/jobs/:id

Headers:
Authorization: Bearer <JWT_TOKEN>

Response (200):
{
  "job": {
    "id": "job_1708515600000",
    "status": "completed",
    "params": { ... },
    "result_count": 45,
    "credits_used": 45,
    "results": [
      {
        "placeName": "Joe's Pizza",
        "url": "https://www.google.com/maps/place/...",
        "category": "Pizza Restaurant",
        "totalReviewScore": 4.5,
        "reviewCount": 234,
        "priceLevel": 2,
        "phoneNumber": "+1 (212) 366-1182",
        "website": "https://joespizza.com",
        "address": {
          "street": "124 Fulton St",
          "neighborhood": "Two Bridges",
          "city": "New York",
          "state": "NY",
          "postalCode": "10038",
          "fullAddress": "124 Fulton St, Two Bridges, New York, NY 10038, United States"
        },
        "coordinates": {
          "latitude": 40.7074,
          "longitude": -74.0023
        },
        "permanentlyClosed": false,
        "temporarilyClosed": false,
        "canBeClaimed": false,
        "countryCode": "US",
        "placeId": "ChIJoQ2tL7ZawokRYnrwPJB7AW0",
        "scrapedAt": "2026-02-21T16:04:30Z"
      },
      // ... more results
    ],
    "error": null,
    "created_at": "2026-02-21T16:00:00Z",
    "completed_at": "2026-02-21T16:04:30Z"
  }
}

Error (404):
{ "error": "Job not found" }

Error (403):
{ "error": "Access denied" }
```

### Export Job Results

```
GET /scrape/jobs/:id/export/:format

Headers:
Authorization: Bearer <JWT_TOKEN>

Path Parameters:
:id = job ID
:format = json | csv | xlsx | hubspot | salesforce

Response (200):
Returns file in requested format

json:
  Structured JSON array of places

csv:
  CSV file: place_name,category,rating,url,...

xlsx:
  Excel file with formatted columns and headers

hubspot:
  CSV formatted for HubSpot bulk import
  Columns: First Name, Last Name, Phone, Website, Company, StreetAddress, City, State, Zip, Country, Rating

salesforce:
  CSV formatted for Salesforce bulk import
  Columns: Name, Phone, Website, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry

Error (404):
{ "error": "Job not found" }

Error (400):
{ "error": "Invalid format. Allowed: json, csv, xlsx, hubspot, salesforce" }
```

---

## Credits (`/credits`)

### Get Balance & History

```
GET /credits

Headers:
Authorization: Bearer <JWT_TOKEN>

Query Parameters:
?limit=50              // optional, default 50

Response (200):
{
  "balance": {
    "available": 85,
    "used": 15,
    "total": 100,
    "plan": "free",
    "lastRefill": "2026-02-20T10:00:00Z",
    "nextRefill": "2026-03-20T10:00:00Z"  // for subscription plans
  },
  "transactions": [
    {
      "id": 1,
      "amount": -12,
      "type": "scrape",
      "description": "Scrape job job_1708515600000",
      "created_at": "2026-02-21T16:00:00Z"
    },
    {
      "id": 2,
      "amount": 100,
      "type": "signup",
      "description": "Welcome bonus",
      "created_at": "2026-02-20T10:00:00Z"
    }
  ]
}
```

### Manual Top-up

```
POST /credits/add

Headers:
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Body:
{
  "packageId": "small"  // small (500), medium (2000), large (5000), enterprise (15000)
}

Response (200):
{
  "checkoutUrl": "https://checkout.stripe.com/pay/...",
  "sessionId": "cs_test_..."
}

// Redirect user to checkoutUrl
// On success, Stripe webhook auto-adds credits
// User is redirected back to dashboard
```

---

## Webhooks (`/webhooks`)

### List Webhooks

```
GET /webhooks

Headers:
Authorization: Bearer <JWT_TOKEN>

Response (200):
{
  "webhooks": [
    {
      "id": 1,
      "url": "https://example.com/webhooks/mapscraper",
      "events": ["job.completed", "job.failed"],
      "secret": "whsec_...",
      "is_active": 1,
      "created_at": "2026-02-21T16:00:00Z",
      "last_delivered_at": "2026-02-21T16:04:30Z"
    }
  ]
}
```

### Create Webhook

```
POST /webhooks

Headers:
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Body:
{
  "url": "https://example.com/webhooks/mapscraper",
  "events": ["job.completed", "job.failed"]
}

Response (201):
{
  "id": 1,
  "url": "https://example.com/webhooks/mapscraper",
  "events": ["job.completed", "job.failed"],
  "secret": "whsec_abc123def456...",
  "is_active": 1,
  "created_at": "2026-02-21T16:00:00Z"
}

Save the secret securely!
```

### Delete Webhook

```
DELETE /webhooks/:id

Headers:
Authorization: Bearer <JWT_TOKEN>

Response (200):
{ "status": "deleted" }
```

### Webhook Events

When you register a webhook, we send POST requests to your URL when events occur:

**Event Body**:
```json
{
  "type": "job.completed",
  "timestamp": "2026-02-21T16:04:30Z",
  "data": {
    "jobId": "job_1708515600000",
    "userId": 1,
    "resultCount": 45,
    "creditsUsed": 45,
    "params": { ... }
  }
}
```

**Verification**:
All webhook requests include an `X-Webhook-Signature` header:
```
X-Webhook-Signature: sha256=abc123def456...
```

Verify by computing:
```
sha256(body + secret) == header_value
```

**Events**:
- `job.completed` - Scrape job finished successfully
- `job.failed` - Scrape job encountered an error

---

## Billing (`/billing`) - Phase 1

### Create Checkout Session

```
POST /billing/checkout

Headers:
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Body:
{
  "packageId": "small"  // small, medium, large, enterprise
}

Response (200):
{
  "sessionId": "cs_test_...",
  "checkoutUrl": "https://checkout.stripe.com/pay/..."
}

User redirects to checkoutUrl, completes payment, returns to dashboard.
On success, webhook auto-adds credits.
```

### Get Subscriptions

```
GET /billing/subscriptions

Headers:
Authorization: Bearer <JWT_TOKEN>

Response (200):
{
  "subscription": {
    "plan": "starter",
    "status": "active",
    "creditsPerMonth": 1000,
    "creditsUsedThisMonth": 234,
    "renewalDate": "2026-03-20T00:00:00Z",
    "daysSinceRenewal": 5,
    "daysUntilRenewal": 25
  }
}
```

### Cancel Subscription

```
POST /billing/cancel-subscription

Headers:
Authorization: Bearer <JWT_TOKEN>

Response (200):
{
  "status": "cancelled",
  "effectiveDate": "2026-03-20T00:00:00Z",
  "message": "Your subscription will be cancelled at the end of the billing period."
}
```

### Get Invoices

```
GET /billing/invoices

Headers:
Authorization: Bearer <JWT_TOKEN>

Response (200):
{
  "invoices": [
    {
      "id": "inv_123",
      "date": "2026-02-20",
      "amount": 2900,  // cents
      "status": "paid",
      "pdfUrl": "https://..."
    }
  ]
}
```

---

## Scheduled Searches (`/scheduled`) - Phase 2

### Create Saved Search

```
POST /scheduled/saved-searches

Headers:
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Body:
{
  "name": "Weekly Pizza Leads",
  "searchTerms": "pizza restaurant pizzeria",
  "location": "New York, NY",
  "maxResults": 50,
  "schedule": "0 9 * * MON",  // Cron format
  "minRating": 4.0
}

Response (201):
{
  "id": 1,
  "name": "Weekly Pizza Leads",
  "schedule": "0 9 * * MON",
  "nextRunAt": "2026-02-24T09:00:00Z",
  "isActive": true
}

Cron format examples:
  "0 9 * * MON"         = Every Monday at 9am
  "0 */6 * * *"         = Every 6 hours
  "30 2 1 * *"          = 1st of each month at 2:30am
  "*/30 * * * *"        = Every 30 minutes
```

### List Saved Searches

```
GET /scheduled/saved-searches

Headers:
Authorization: Bearer <JWT_TOKEN>

Response (200):
{
  "searches": [
    {
      "id": 1,
      "name": "Weekly Pizza Leads",
      "schedule": "0 9 * * MON",
      "nextRunAt": "2026-02-24T09:00:00Z",
      "lastRunAt": "2026-02-21T09:00:00Z",
      "isActive": true,
      "created_at": "2026-02-21T16:00:00Z"
    }
  ]
}
```

### Get Run History

```
GET /scheduled/saved-searches/:id/history

Headers:
Authorization: Bearer <JWT_TOKEN>

Query Parameters:
?limit=50

Response (200):
{
  "runs": [
    {
      "jobId": "job_1708515600000",
      "scheduledFor": "2026-02-21T09:00:00Z",
      "startedAt": "2026-02-21T09:00:05Z",
      "completedAt": "2026-02-21T09:04:30Z",
      "resultCount": 45,
      "creditsUsed": 45,
      "status": "completed"
    }
  ]
}
```

### Update Saved Search

```
PUT /scheduled/saved-searches/:id

Headers:
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Body:
{
  "schedule": "0 10 * * MON",
  "minRating": 4.5,
  "isActive": true
}

Response (200):
{ "status": "updated" }
```

### Delete Saved Search

```
DELETE /scheduled/saved-searches/:id

Headers:
Authorization: Bearer <JWT_TOKEN>

Response (200):
{ "status": "deleted" }
```

---

## Error Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Job fetched successfully |
| 201 | Created | Job created, webhook added |
| 204 | No Content | Deletion successful |
| 400 | Bad Request | Missing required field, invalid input |
| 401 | Unauthorized | No auth header, expired token |
| 402 | Payment Required | Insufficient credits |
| 403 | Forbidden | Access denied (not your job) |
| 404 | Not Found | Job doesn't exist |
| 429 | Too Many Requests | Rate limited |
| 500 | Server Error | Unexpected crash |

---

## Rate Limiting

All endpoints are rate-limited to **60 requests per minute** per API key/user.

When limit is exceeded, you get:
```json
HTTP 429
{
  "error": "Rate limit exceeded",
  "retryAfter": 30
}
```

Wait the specified seconds before retrying.

---

## Example Workflows

### Register & Scrape

```bash
# 1. Register
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Save token from response

# 2. Create scrape
curl -X POST http://localhost:3001/scrape \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "searchTerms": "pizza",
    "location": "New York",
    "maxResults": 20
  }'

# Save jobId from response

# 3. Poll job status
curl http://localhost:3001/scrape/jobs/<jobId> \
  -H "Authorization: Bearer <TOKEN>"

# 4. Export results
curl http://localhost:3001/scrape/jobs/<jobId>/export/csv \
  -H "Authorization: Bearer <TOKEN>" \
  > results.csv
```

### Use API Key

```bash
# Get API key from /auth/me

# Use it instead of token
curl http://localhost:3001/scrape/jobs \
  -H "X-API-Key: msk_yourkeyhehehehe"
```

### Setup Webhook

```bash
# 1. Create webhook
curl -X POST http://localhost:3001/webhooks \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/hook",
    "events": ["job.completed"]
  }'

# 2. Your server receives POST to https://example.com/hook:
# {
#   "type": "job.completed",
#   "timestamp": "...",
#   "data": { ... }
# }

# 3. Verify signature
# Compare X-Webhook-Signature header with sha256(body + secret)
```

---

**Need help?** Check [README.md](README.md) or deploy with [SETUP.md](SETUP.md).
