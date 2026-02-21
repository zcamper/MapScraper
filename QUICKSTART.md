# Quick Start Guide

Get up and running with the Google Maps Scraper in 5 minutes!

## 1️⃣ Installation

```bash
# Navigate to project
cd MapScraper

# Install dependencies
npm install

# Verify installation
npm run scrape -- --help
```

## 2️⃣ First Search

```bash
# Simple search for restaurants in New York
npm run scrape -- --search "restaurant" --location "New York, USA"
```

You'll see:
- ✓ Browser initialization
- 🔍 Search progress
- 📊 Export progress
- ✅ Results saved to `./output/`

## 3️⃣ Check Your Results

Look in the `output/` folder:
- `google_maps_results_YYYY-MM-DD.json` - Structured data
- `google_maps_results_YYYY-MM-DD.csv` - Excel-compatible
- (Optional) `.xlsx` and `.html` files if specified

## 4️⃣ Common Tasks

### Filter by Rating
```bash
npm run scrape -- --search "hotel" --location "Paris" --min-rating 4.5
```

### Get Only Open Places
```bash
npm run scrape -- --search "cafe" --location "Berlin" --status open
```

### Export to Multiple Formats
```bash
npm run scrape -- --search "museum" --location "Rome" --format json csv excel html
```

### Scrape a Direct URL
```bash
npm run scrape -- --url "https://www.google.com/maps/search/pizza+brooklyn/"
```

### Search Multiple Terms
```bash
npm run scrape -- --search "pizza,pasta,gelato" --location "Rome"
```

## 5️⃣ Use in Your Code

```javascript
import GoogleMapsScraper, { DataExporter } from './src/index.js';

const scraper = new GoogleMapsScraper({ maxResults: 50 });
await scraper.initialize();

const results = await scraper.searchPlaces('cafe', 'London, UK');
await DataExporter.exportJSON(results, './results.json');
await scraper.close();
```

## 📋 Common Errors & Fixes

| Error | Fix |
|-------|-----|
| "Cannot find playwright" | Run `npm install` |
| "Element not found" | Verify location exists, try `--headless false` |
| "No results found" | Check spelling, use broader search term |
| Timeout | Increase with `--timeout 60000` |
| IP blocked | Set up proxies in `.env` and use `--use-proxy` |

## 🚀 Next Steps

1. **Check examples:**
   - Review [examples.js](examples.js) for code samples
   - See [README.md](README.md) for detailed documentation

2. **Set up proxies (optional):**
   - Add proxies to `.env`
   - Enable with `--use-proxy`

3. **Automate scripting:**
   - Create a batch script to scrape multiple locations
   - Schedule with cron/Task Scheduler

4. **Integrate with apps:**
   - Use the programmatic API
   - Export to your database
   - Build reports or dashboards

## 📞 Need Help?

1. Run with debug mode: `--headless false`
2. Check [README.md](README.md) Troubleshooting section
3. Verify Google Maps loads manually in your browser
4. Ensure proxies work (if using)

## ✅ Complete!

You're ready to scrape! Try:

```bash
npm run scrape -- --search "best restaurants" --location "London" \
  --min-rating 4.0 --format json csv excel --output ./my_results
```

Happy scraping! 🗺️
