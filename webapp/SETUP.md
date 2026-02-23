# MapScraper SaaS - Setup & Deployment Guide

Complete guide for setting up the MapScraper Lead Gen SaaS locally, in development, and for production deployment.

## Table of Contents

1. [Local Development](#local-development)
2. [Docker Deployment](#docker-deployment)
3. [Cloud Deployment](#cloud-deployment)
4. [Production Checklist](#production-checklist)
5. [Environmental Configuration](#environmental-configuration)
6. [Troubleshooting](#troubleshooting)

---

## Local Development

### Prerequisites

- **Node.js**: 18+ (check: `node --version`)
- **npm**: 9+ (check: `npm --version`)
- **Git**: For version control

### Step 1: Install Dependencies

```bash
cd MapScraper
npm install
```

This installs:
- Express.js (web server)
- better-sqlite3 (database)
- Playwright (browser automation)
- bcryptjs (password hashing)
- jsonwebtoken (JWT auth)
- ExcelJS (Excel export)
- And more...

### Step 2: Create Environment File

```bash
# Copy the example config
cp webapp/.env.example webapp/.env
```

Edit `webapp/.env` to customize:

```env
WEBAPP_PORT=3001
JWT_SECRET=dev-secret-change-in-production
DATABASE_PATH=./webapp/data/mapscraper.db
CORS_ORIGIN=*
```

### Step 3: Start the Development Server

```bash
# With hot-reload (recommended for development)
npm run webapp:dev

# Or without hot-reload
npm run webapp:start
```

You'll see:
```
MapScraper Lead Gen SaaS running on http://localhost:3001
Dashboard: http://localhost:3001
API Docs: POST /auth/register to get started
```

### Step 4: Test the Setup

Open a new terminal:

```bash
# Health check
curl http://localhost:3001/health

# Response:
# {"status":"ok","uptime":10,"timestamp":"2026-02-20T15:32:45.123Z"}
```

### Step 5: Create First User

```bash
# Register
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@example.com",
    "password":"SecurePassword123!"
  }'

# Response:
# {
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "apiKey": "msk_1234567890abcdef",
#   "user": {
#     "id": 1,
#     "email": "admin@example.com",
#     "credits": 100,
#     "plan": "free"
#   }
# }
```

Save the `token` and `apiKey` for testing.

### Step 6: Test API Endpoints

```bash
# Get user profile
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:3001/auth/me

# Get credits
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:3001/credits

# Create a scrape job
curl -X POST http://localhost:3001/scrape \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "searchTerms": "pizza pizza restaurant",
    "location": "New York",
    "maxResults": 10
  }'
```

### Step 7: Open Dashboard

Visit **http://localhost:3001** in your browser

- Click "Register"
- Enter email & password
- You'll get 100 free credits
- Try a search!

---

## Docker Deployment

### Prerequisites

- **Docker**: 20.10+ ([install Docker](https://docs.docker.com/get-docker/))
- **Docker Compose**: 1.29+ (usually included with Docker Desktop)

### Build Docker Image

```bash
# Build the image
docker build -f webapp/Dockerfile -t mapscraper-saas:latest .

# Tag for registry (optional)
docker tag mapscraper-saas:latest myregistry.com/mapscraper-saas:latest
```

### Run Container (Simple)

```bash
# Run the container
docker run \
  -p 3001:3001 \
  -v mapscraper-data:/app/webapp/data \
  -e JWT_SECRET=your-secret-here \
  mapscraper-saas:latest

# Access at http://localhost:3001
```

### Run with Docker Compose

Create `docker-compose.yml` in project root:

```yaml
version: '3.9'

services:
  mapscraper-web:
    build:
      context: .
      dockerfile: webapp/Dockerfile
    ports:
      - "3001:3001"
    environment:
      WEBAPP_PORT: 3001
      JWT_SECRET: ${JWT_SECRET:-change-this-in-production}
      DATABASE_PATH: /app/webapp/data/mapscraper.db
      CORS_ORIGIN: "*"
      NODE_ENV: production
    volumes:
      - mapscraper-data:/app/webapp/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  mapscraper-data:
    driver: local
```

Run it:

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f mapscraper-web

# Stop services
docker-compose down

# Stop and remove data
docker-compose down -v
```

---

## Cloud Deployment

### Option 1: Railway (Easiest)

**Cost**: ~$5-20/month | **Setup time**: 5 minutes

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account
5. Select `MapScraper` repository
6. Railway auto-detects it's Node.js + Docker
7. Add environment variables:
   ```
   JWT_SECRET=your-random-secret
   NODE_ENV=production
   ```
8. Deploy! Your app is live at `your-project.railway.app`

**Pros**: Easy deployment, email support, custom domains
**Cons**: Lower free tier than some alternatives

### Option 2: Render (Good Free Plan)

**Cost**: Free tier available | **Setup time**: 10 minutes

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Connect your repository
5. Configure:
   - **Name**: mapscraper-saas
   - **Environment**: Docker
   - **Plan**: Free (0.10 CPU, 512 MB RAM)
6. Add at runtime → Environment:
   ```
   JWT_SECRET=your-random-secret
   NODE_ENV=production
   ```
7. Deploy!

**Pros**: Free tier, persistent disk storage, background workers
**Cons**: Spins down after 15 min inactivity on free tier

### Option 3: Fly.io (Global)

**Cost**: ~$5-15/month | **Setup time**: 15 minutes

```bash
# Install Fly CLI: https://fly.io/docs/getting-started/installing-flyctl/

# Login
flyctl auth login

# Launch
flyctl launch
# Prompted for app name, region, etc.

# Set secrets
flyctl secrets set \
  JWT_SECRET=your-random-secret \
  NODE_ENV=production

# Deploy
flyctl deploy

# View logs
flyctl logs
```

**Pros**: Global edge, fast, great performance
**Cons**: Steeper learning curve

### Option 4: DigitalOcean (Managed)

**Cost**: $12-24/month | **Setup time**: 20 minutes

1. Go to [digitalocean.com](https://digitalocean.com)
2. Create account and add payment method
3. Go to "App Platform"
4. Click "Create App"
5. Connect GitHub repository
6. Configure:
   - **Build command**: `npm install`
   - **Run command**: `npm run webapp:start`
   - **Port**: 3001
7. Add environment variables:
   ```
   JWT_SECRET=your-random-secret
   NODE_ENV=production
   ```
8. Click "Deploy"

**Pros**: Managed database (optional), reliable, good support
**Cons**: More expensive than alternatives

### Option 5: VPS (Self-Hosted, Cheapest)

**Cost**: $5-10/month | **Setup time**: 1 hour

Recommended VPS providers:
- **Hetzner** (~$3.99/month)
- **OVH** (~$4/month)
- **Vultr** (~$2.50/month)
- **DigitalOcean Droplets** (~$5/month)

#### Hetzner (Example)

1. Create account at [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Create new **Debian 12** Cloud Server (2GB RAM)
3. SSH into server:
   ```bash
   ssh root@your-server-ip
   ```

4. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs build-essential
   node --version  # v18.x.x
   ```

5. Install Playwright system deps:
   ```bash
   sudo apt-get install -y \
     chromium-browser \
     libnss3 libxss1 libasound2 libappindicator1 libindicator7
   ```

6. Clone repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/MapScraper.git
   cd MapScraper
   npm install
   ```

7. Create `.env`:
   ```bash
   cat > webapp/.env << 'EOF'
   WEBAPP_PORT=3001
   JWT_SECRET=your-very-random-secret-here
   DATABASE_PATH=/root/MapScraper/webapp/data/mapscraper.db
   CORS_ORIGIN=https://yourdomain.com
   NODE_ENV=production
   EOF
   ```

8. Install PM2 (process manager):
   ```bash
   npm install -g pm2
   pm2 start npm --name "mapscraper" -- run webapp:start
   pm2 startup
   pm2 save
   ```

9. Install Nginx (reverse proxy):
   ```bash
   sudo apt-get install -y nginx
   ```

10. Configure Nginx:
    ```bash
    sudo tee /etc/nginx/sites-available/mapscraper > /dev/null << 'EOF'
    server {
        listen 80;
        server_name yourdomain.com;

        location / {
            proxy_pass http://localhost:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    EOF
    ```

11. Enable Nginx site:
    ```bash
    sudo ln -s /etc/nginx/sites-available/mapscraper /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

12. Install SSL (Let's Encrypt):
    ```bash
    sudo apt-get install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.com
    ```

13. Done! Your app is live at `https://yourdomain.com`

**Pros**: Cheapest option, full control, no vendor lock-in
**Cons**: Self-managed infrastructure, require some DevOps knowledge

---

## Production Checklist

Before going live, verify:

### Security

- [ ] **JWT_SECRET**: Set to a long random string (min 32 chars)
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- [ ] **CORS_ORIGIN**: Set to your domain, NOT `*`
  ```env
  CORS_ORIGIN=https://yourdomain.com
  ```

- [ ] **HTTPS**: Enabled via reverse proxy (nginx, Caddy) or platform
  ```bash
  # Test with curl
  curl -I https://yourdomain.com
  # Should return 200 with HTTPS headers
  ```

- [ ] **API Rate Limiting**: Built-in, tune if needed in `middleware.js`

- [ ] **Database Backups**: Cron job to backup `mapscraper.db`
  ```bash
  # Example: daily backup
  0 2 * * * cp /path/to/webapp/data/mapscraper.db /backups/mapscraper-$(date +\%Y\%m\%d).db
  ```

### Monitoring

- [ ] **Uptime monitoring**: Set up external health check on `/health` endpoint
  - Recommended: [UptimeRobot](https://uptimerobot.com) (free)
  - Check interval: every 5 minutes

- [ ] **Error tracking**: Integrate Sentry or similar
  ```bash
  npm install @sentry/node
  # Add to server.js
  ```

- [ ] **Logs**: Centralize logs if using multiple servers
  - Option: ELK stack, Datadog, LogRocket

### Performance

- [ ] **Database**: SQLite for <1M records, consider Postgres for larger
- [ ] **Caching**: Add Redis for session store (optional)
- [ ] **CDN**: Use CloudFlare for static assets (optional)
- [ ] **Load testing**: Test with `ab` or `wrk` before launch
  ```bash
  ab -n 1000 -c 10 https://yourdomain.com/health
  ```

### Scaling for High Load

If you exceed 1M records or need >10 concurrent scrapes:

1. **Upgrade database**: Migrate SQLite → PostgreSQL
   ```bash
   # Install pg driver
   npm install pg pg-promise
   
   # Update db.js to use PostgreSQL
   ```

2. **Add job queue**: Redis + Bull for async jobs
   ```bash
   npm install bull redis
   ```

3. **Use multiple server instances**:
   - Load balancer (nginx)
   - Each server: `npm run webapp:start`
   - Shared PostgreSQL & Redis

4. **Scale Playwright instances**:
   - Multiple browser contexts per job
   - Proxy rotation to avoid blocks

See [ROADMAP.md](ROADMAP.md) Phase 2 for scheduler architecture.

---

## Environmental Configuration

### Development

```env
WEBAPP_PORT=3001
JWT_SECRET=dev-secret-not-for-production
DATABASE_PATH=./webapp/data/mapscraper.db
CORS_ORIGIN=*
NODE_ENV=development
```

### Production

```env
WEBAPP_PORT=3001
JWT_SECRET=<use-very-long-random-secret>
DATABASE_PATH=/var/lib/mapscraper/mapscraper.db
CORS_ORIGIN=https://yourdomain.com
NODE_ENV=production
```

### Phase 1: Payment (Stripe)

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Phase 2: Scheduled Jobs

```env
SCHEDULER_ENABLED=true
SCHEDULER_MAX_CONCURRENT=3
```

### Phase 3: Email Enrichment

```env
ENRICHMENT_ENABLED=true
ENRICHMENT_COST_PER_EMAIL=0.5
```

### Phase 7: Admin Panel

```env
ADMIN_EMAILS=admin@yourdomain.com,moderator@yourdomain.com
```

---

## Troubleshooting

### Database

**Q: "SQLITE_CANTOPEN" error?**
A: Check file permissions:
```bash
ls -la webapp/data/
chmod 755 webapp/data/
```

**Q: "database is locked"?**
A: SQLite WAL mode conflict. Ensure only one process is running:
```bash
ps aux | grep node
# Kill any extra processes
pkill -f "node webapp/server"
```

### Browser / Playwright

**Q: "Browser launch failed"?**
A: Install Playwright dependencies:
```bash
npx playwright install
npx playwright install-deps  # Linux systems
```

**Q: "Timeout waiting for element"?**
A: Increase timeout in `.env`:
```env
SCRAPER_TIMEOUT=60000  # 60 seconds
```

### API / Auth

**Q: "Invalid JWT token"?**
A: Token expired (7-day expiry). Call `/auth/login` again:
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

**Q: "API key not working"?**
A: Check it's enabled:
```bash
# Get all keys
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/auth/me
```

Revoke and regenerate if needed:
```bash
curl -X DELETE -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/auth/api-keys/KEY_ID
```

### Deployment

**Q: "Server won't start on Railway/Render"?**
A: Check build logs:
```bash
# Railway
railway logs

# Render
View the "Logs" tab in dashboard
```

**Q: "Database data lost after restart"?**
A: Missing volume mount in Docker:
```bash
# Ensure volume is mounted
docker run -v mapscraper-data:/app/webapp/data ...
```

**Q: "CORS errors in browser"?**
A: Set CORS_ORIGIN correctly:
```env
# If running on https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com

# Not:
CORS_ORIGIN=http://yourdomain.com  # Missing https
CORS_ORIGIN=yourdomain.com  # Missing protocol
```

### Performance

**Q: "Server using high CPU"?**
A: Playwright often using too much. Solutions:
1. Reduce MAX_CONCURRENT_REQUESTS
2. Use proxy service (decrease local load)
3. Upgrade server RAM

**Q: "Slow API responses"?**
A: Check database query performance:
```bash
# Enable SQLite query logging
sqlite3 webapp/data/mapscraper.db ".timer on"
```

Consider:
- Add database indexes
- Upgrade to PostgreSQL for large datasets
- Enable response caching (Redis)

---

## Next Steps

1. **Local development**: Follow [Local Development](#local-development)
2. **Deploy to production**: Pick an option from [Cloud Deployment](#cloud-deployment)
3. **Build Phase 1**: See [ROADMAP.md](ROADMAP.md) for Stripe integration
4. **Monitor metrics**: Set up tracking for users, conversions, revenue

---

**Still stuck?** Open an issue with:
- Your error message
- Environment (local/Docker/cloud provider)
- Steps to reproduce
