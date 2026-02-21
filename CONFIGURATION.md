# Configuration Guide

## Environment Setup

### .env File Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

### Browser Settings

```env
# Run in headless mode (no visible browser window)
HEADLESS=true

# Page load timeout in milliseconds
TIMEOUT=30000

# Timeout for waiting for specific elements
WAIT_FOR_SELECTOR_TIMEOUT=10000

# Delay between scrolls to load more results (ms)
SCROLL_PAUSE_TIME=500
```

### Proxy Configuration

#### Without Authentication
```env
USE_PROXY=true
PROXY_LIST=http://proxy1.example.com:8080,http://proxy2.example.com:8080,http://proxy3.example.com:8080
```

#### With Authentication
```env
USE_PROXY=true
PROXY_LIST=http://user:pass@proxy1.example.com:8080,http://user:pass@proxy2.example.com:8080
PROXY_USERNAME=myusername
PROXY_PASSWORD=mypassword
```

#### SOCKS5 Proxies
```env
PROXY_LIST=socks5://proxy1.example.com:1080,socks5://proxy2.example.com:1080
```

### Rate Limiting

```env
# Maximum concurrent requests
MAX_CONCURRENT_REQUESTS=3

# Delay between requests in milliseconds
REQUEST_DELAY_MS=1000
```

### Output Configuration

```env
# Default output directory for exported files
OUTPUT_DIR=./output
```

## Command Line Overrides

Environment variables can be overridden via CLI flags:

```bash
# Override timeout
npm run scrape -- --search "cafe" --location "NYC" --timeout 45000

# Override headless mode
npm run scrape -- --search "cafe" --location "NYC" --headless false

# Enable proxy
npm run scrape -- --search "cafe" --location "NYC" --use-proxy
```

## Proxy Services Setup

### ScraperAPI

1. Sign up at https://www.scraperapi.com
2. Get your API key
3. Add to `.env`:

```env
USE_PROXY=true
PROXY_LIST=http://scraperapi.com:8001?api_key=YOUR_API_KEY
```

### Bright Data (Luminati)

1. Create account at https://brightdata.com
2. Set up proxy zone
3. Add to `.env`:

```env
USE_PROXY=true
PROXY_LIST=http://user-YOUR_ZONE:YOUR_PASSWORD@proxy.provider.com:PORT
```

### Oxylabs

1. Sign up at https://www.oxylabs.io
2. Create a proxy user
3. Add to `.env`:

```env
USE_PROXY=true
PROXY_LIST=http://YOUR_USERNAME:YOUR_PASSWORD@pr.oxylabs.io:7777
```

### Residential Proxies

```env
USE_PROXY=true
PROXY_LIST=http://proxy1.residential-provider.com:PORT,http://proxy2.residential-provider.com:PORT
PROXY_USERNAME=username
PROXY_PASSWORD=password
```

## Performance Tuning

### For Speed
```env
SCROLL_PAUSE_TIME=300           # Faster scrolling
WAIT_FOR_SELECTOR_TIMEOUT=5000  # Shorter waits
REQUEST_DELAY_MS=500             # Less delay
```

### For Reliability (Avoids Blocks)
```env
SCROLL_PAUSE_TIME=1000          # More realistic
WAIT_FOR_SELECTOR_TIMEOUT=15000 # Longer waits
REQUEST_DELAY_MS=2000           # More delay
MAX_CONCURRENT_REQUESTS=1        # One at a time
```

### For Large Batches
```env
USE_PROXY=true
PROXY_LIST=http://proxy1:8080,http://proxy2:8080,http://proxy3:8080
MAX_CONCURRENT_REQUESTS=3
SCROLL_PAUSE_TIME=500
REQUEST_DELAY_MS=1500
```

## Debugging

### Enable Visible Browser
```bash
npm run scrape -- --search "cafe" --location "NYC" --headless false
```

This shows you:
- Browser opening and loading pages
- Element selection in real-time
- Network requests
- Scroll behavior

### Longer Timeouts
```bash
npm run scrape -- --search "cafe" --location "NYC" --timeout 90000
```

Useful for:
- Slow network connections
- Heavy pages with many results
- Debugging selectors

### Check Network
1. Run with `--headless false`
2. Open DevTools (F12)
3. Check Console tab for errors
4. Monitor Network tab for requests

## Testing Configuration

### Test Proxy Setup
```bash
# Install curl if needed, then test
curl -x http://proxy.example.com:8080 https://ifconfig.me
```

### Test Database Connection
Update `src/config.js` if using database exports.

### Test Connectivity
```javascript
import axios from 'axios';

const proxyUrl = 'http://proxy.example.com:8080';
const response = await axios.get('https://ifconfig.me', {
  httpAgent: new (await import('http')).Agent({ proxy: proxyUrl }),
  timeout: 5000,
});
console.log(response.data); // Should show proxy IP
```

## Environment-Specific Configs

### Development
```env
HEADLESS=false          # See browser
TIMEOUT=45000          # Longer timeout for interruptions
SCROLL_PAUSE_TIME=800  # Realistic speed
USE_PROXY=false        # Test without proxy first
```

### Production
```env
HEADLESS=true          # No UI needed
TIMEOUT=30000          # Standard timeout
SCROLL_PAUSE_TIME=500  # Normal speed
USE_PROXY=true         # Rotation enabled
```

### CI/CD (GitHub Actions, etc.)
```env
HEADLESS=true
TIMEOUT=60000          # Account for slower CI runners
SCROLL_PAUSE_TIME=1000
USE_PROXY=true
```

## Scaling Configuration

For scraping thousands of results:

### Parallel Searches
```bash
# Use multiple instances with different locations
npm run scrape -- --search "cafe" --location "New York" &
npm run scrape -- --search "cafe" --location "London" &
npm run scrape -- --search "cafe" --location "Tokyo" &
```

### Batch Processing Script
```javascript
import GoogleMapsScraper from './src/index.js';

const locations = ['New York', 'London', 'Tokyo', 'Singapore'];
const searchTerm = 'restaurant';

for (const location of locations) {
  const scraper = new GoogleMapsScraper({
    useProxy: true,
    maxResults: 50,
  });
  
  await scraper.initialize();
  await scraper.searchPlaces(searchTerm, location);
  await scraper.close();
  
  // Delay before next search
  await delay(5000);
}
```

### Load Balancing
With multiple proxy pools:
```env
PROXY_LIST=http://proxy1.com:8080,http://proxy1.com:8081,http://proxy1.com:8082,http://proxy2.com:8080,http://proxy2.com:8081,http://proxy2.com:8082
```

## Troubleshooting Configuration

| Issue | Solution |
|-------|----------|
| Proxy not working | Verify format, test manually with curl |
| Timeouts frequent | Increase TIMEOUT, add more proxies |
| Results incomplete | Increase SCROLL_PAUSE_TIME |
| Browser crashes | Increase TIMEOUT, disable headless mode |
| Getting blocked | Enable proxies, add delays, smaller batches |
| Memory issues | Reduce MAX_CONCURRENT_REQUESTS |

For more help, see [README.md](README.md) troubleshooting section.
