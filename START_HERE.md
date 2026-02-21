# START HERE 🚀

Welcome! You now have a **fully-built Google Maps scraper**. Here's how to get started in 5 minutes.

## What You Have

A production-ready tool that:
- ✅ Scrapes Google Maps search results
- ✅ Extracts 20+ data fields per place
- ✅ Exports to JSON, CSV, Excel, HTML
- ✅ Filters by rating, category, status
- ✅ Uses proxy rotation for reliability
- ✅ Works as both CLI and Node.js library

## 1. Install Dependencies

```bash
npm install
```

This downloads Playwright and all required packages.

## 2. First Run

```bash
npm run scrape -- --search "pizza" --location "New York"
```

You'll see:
- Browser starting
- Scraping progress
- Results exported to `./output/`

That's it! Check the generated files.

## 3. Next Steps

### Want to learn more?
- **[QUICKSTART.md](QUICKSTART.md)** - 5-minute quick reference
- **[README.md](README.md)** - Full documentation
- **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)** - Project structure

### Want to configure?
- **[CONFIGURATION.md](CONFIGURATION.md)** - Proxy setup, performance tuning

### Want examples?
- **[examples.js](examples.js)** - Code samples for various use cases

## Common Commands

```bash
# Search for restaurants and filter by rating
npm run scrape -- --search "restaurant" --location "Paris" --min-rating 4.5

# Export to multiple formats
npm run scrape -- --search "cafe" --location "London" \
  --format json csv excel html

# Search multiple categories at once
npm run scrape -- --search "pizza,sushi,burger" --location "Tokyo"

# Scrape a direct Google Maps URL
npm run scrape -- --url "https://www.google.com/maps/search/cafe+berlin/"

# Get only open places
npm run scrape -- --search "hotel" --location "Dubai" --status open

# Use proxies (set up in .env first)
npm run scrape -- --search "restaurant" --location "NYC" --use-proxy
```

## Project Structure

```
MapScraper/
├── src/           # Source code (CLI, scraper, exporter, etc.)
├── tests/         # Test files
├── examples.js    # Usage examples
├── README.md      # Full documentation
├── QUICKSTART.md  # 5-minute guide
├── CONFIGURATION.md  # Proxy & settings guide
└── output/        # Where results are saved
```

## What Gets Extracted

For each place:
- **Name, URL, Place ID**
- **Category, Price level**
- **Phone, Website, Address**
- **Rating (stars), Review count**
- **Coordinates (lat/lng)**
- **Open/Closed status**
- **Claimability status**
- **Extraction timestamp**

## All Available Options

```bash
npm run scrape -- --help
```

Shows all CLI options:
- `--search` : Search term(s)
- `--location` : City, country, or zip code
- `--url` : Direct Google Maps URL
- `--max-results` : How many to scrape (default: 120)
- `--min-rating` : Filter by minimum rating (e.g., 4.0)
- `--status` : Filter by status (open, closed_permanent, closed_temporary)
- `--format` : Export format (json, csv, excel, html)
- `--output` : Output directory
- `--headless` : true/false for visible browser (default: true)
- `--use-proxy` : Enable proxy rotation
- `--timeout` : Browser timeout in milliseconds

## Programmatic Usage

Use in your Node.js code:

```javascript
import GoogleMapsScraper, { DataExporter } from './src/index.js';

const scraper = new GoogleMapsScraper();
await scraper.initialize();

const results = await scraper.searchPlaces('cafe', 'Berlin, Germany');

await DataExporter.exportJSON(results, './results.json');
await scraper.close();
```

## Proxies (Optional)

To use rotating proxies:

1. Edit `.env` and add proxies:
```env
USE_PROXY=true
PROXY_LIST=http://proxy1.com:8080,http://proxy2.com:8080
```

2. Use `--use-proxy` flag:
```bash
npm run scrape -- --search "cafe" --location "NYC" --use-proxy
```

See [CONFIGURATION.md](CONFIGURATION.md) for proxy service setup (ScraperAPI, Bright Data, Oxylabs, etc.)

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot find module" | Run `npm install` |
| No browser launches | Run `npx playwright install` |
| Timeout errors | Increase timeout: `--timeout 60000` |
| No results | Check location exists, use broader search |
| Getting blocked | Enable proxy with `--use-proxy` |
| Want to debug | Run with `--headless false` |

## File Organization

- `src/scraper.js` - Main scraping logic (Playwright)
- `src/dataExtractor.js` - Extract data from DOM
- `src/dataExporter.js` - Export to JSON/CSV/Excel/HTML
- `src/proxyManager.js` - Proxy rotation
- `src/cli.js` - Command-line interface
- `src/utils.js` - Helper functions
- `examples.js` - Usage examples
- `tests/test-installation.js` - Verify installation

## Quick Reference

```bash
# Any of these work:
npm run scrape -- --search "cafe" --location "NYC"
npm run scrape -- -s "cafe" -l "NYC"
npm run scrape -- --url "https://www.google.com/maps/search/cafe+NYC/"

# Compare prices across locations:
npm run scrape -- --search "pizza" --location "NYC" &
npm run scrape -- --search "pizza" --location "LA" &
npm run scrape -- --search "pizza" --location "Chicago" &
```

## Documentation

- **[START_HERE](START_HERE.md)** - This file (you are here)
- **[QUICKSTART.md](QUICKSTART.md)** - 5-minute quick start
- **[README.md](README.md)** - Complete documentation
- **[CONFIGURATION.md](CONFIGURATION.md)** - Advanced setup
- **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)** - Project details
- `npm run scrape -- --help` - CLI help

## What's Different from Apify?

Our tool:
- ✅ Self-hosted (no monthly fees)
- ✅ Open source (modify as needed)
- ✅ Same core functionality
- ✅ Simpler setup (single code base)
- ✅ No API limitations
- ✅ Full control over parameters

Apify's tool:
- ✅ Managed hosting  
- ✅ Advanced analytics
- ✅ Scheduled runs
- ✅ Team collaboration
- ✅ 24/7 support

## Performance Tips

- Use smaller `--max-results` for faster scraping
- Add `--min-rating` to filter early
- Use `--headless false` only for debugging
- Add delays between multiple searches
- Use rotating proxies for large batches

## Support & Help

1. **Installation**: `node tests/test-installation.js`
2. **Quick help**: `npm run scrape -- --help`
3. **Stuck?**: Read [QUICKSTART.md](QUICKSTART.md)
4. **Advanced**: Check [CONFIGURATION.md](CONFIGURATION.md)
5. **Examples**: See [examples.js](examples.js)

## Ready?

```bash
# Go to the project directory
cd MapScraper

# Install dependencies
npm install

# Try your first search!
npm run scrape -- --search "best restaurants" --location "Paris"

# Find results in ./output/
```

Happy scraping! 🗺️

---

**Questions?** Read [README.md](README.md) or check [QUICKSTART.md](QUICKSTART.md)
