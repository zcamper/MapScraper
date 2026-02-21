# Project Overview

## What You Have Built

A **production-ready Google Maps scraper/extractor** tool that replicates Apify's Google Maps Extractor actor functionality. This tool allows you to:

- 🔍 Search Google Maps by keyword, category, or location
- 📍 Scrape direct Google Maps URLs
- 📊 Extract comprehensive place data (name, URL, rating, reviews, address, phone, website, coordinates, etc.)
- 🔄 Rotate through proxies to avoid IP blocking
- 📁 Export results in JSON, CSV, Excel, and HTML formats
- 🎯 Filter results by rating, category, and open/closed status
- ⚡ Bypass Google Maps' 120-result display limit through pagination

## Project Structure

```
MapScraper/
├── src/
│   ├── cli.js                 # Command-line interface
│   ├── scraper.js             # Core Playwright-based scraper
│   ├── dataExtractor.js       # DOM parsing and data extraction
│   ├── dataExporter.js        # Export to multiple formats
│   ├── proxyManager.js        # Proxy rotation logic
│   ├── utils.js               # Utility functions
│   └── index.js               # Main module exports
├── tests/
│   └── test-installation.js   # Installation verification
├── examples.js                # Code usage examples
├── package.json               # Node.js dependencies
├── .env.example               # Environment configuration template
├── .gitignore                 # Git ignore rules
├── README.md                  # Comprehensive documentation
├── QUICKSTART.md              # 5-minute quick start
├── CONFIGURATION.md           # Configuration guide (proxies, etc.)
└── LICENSE                    # MIT License

output/                         # Results directory (created after first run)
└── google_maps_results_*.json  # Exported data files
```

## Key Features

### 1. Multiple Input Methods
- **Search terms**: Keywords, categories, business types
- **Location**: City, country, zip code, or address
- **Direct URLs**: Paste a Google Maps search URL
- **Batch searching**: Search multiple terms in one run

### 2. Comprehensive Data Extraction
Each place record includes:
- Place name and Google Maps URL
- Business category and country code
- Phone number and website
- Full address with components (street, neighborhood, city, state, postal)
- Price level ($$ - $$$$)
- Review score and review count
- GPS coordinates (latitude/longitude)
- Open/closed status (permanent or temporary)
- Claimability status
- Unique Place ID
- Extraction timestamp

### 3. Advanced Filtering
- **By rating**: Get only highly-rated places (e.g., 4.5+ stars)
- **By status**: Filter open, permanently closed, or temporarily closed places
- **By category**: Group and filter by business type results

### 4. Export Flexibility
- **JSON**: Structured data for APIs and databases
- **CSV**: Comma-separated for Excel and spreadsheet tools
- **Excel**: XLSX format with formatting and styling
- **HTML**: Beautiful interactive reports with statistics

### 5. Proxy Support
- **Proxy rotation**: Cycle through multiple proxies
- **Authentication**: Support for username/password proxies
- **Flexible providers**: Works with any proxy service
- **Built-in testing**: Verify proxies before use

## Getting Started

### Installation (2 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env

# 3. Verify installation
npm run scrape -- --help
```

### First Search (5 minutes)

```bash
# Simple search
npm run scrape -- --search "restaurant" --location "New York, USA"

# Results saved to ./output/
# Check the generated files!
```

## Usage Examples

### CLI Commands

```bash
# Basic search
npm run scrape -- --search "cafe" --location "London"

# Filter by rating
npm run scrape -- --search "hotel" --location "Paris" --min-rating 4.5

# Get only open places
npm run scrape -- --search "restaurant" --location "Tokyo" --status open

# Export to multiple formats
npm run scrape -- --search "museum" --location "Rome" \
  --format json csv excel html

# Search multiple categories
npm run scrape -- --search "pizza,sushi,burger" --location "NYC"

# Scrape direct URL
npm run scrape -- --url "https://www.google.com/maps/search/cafe+berlin/"

# Use proxies
npm run scrape -- --search "restaurant" --location "NYC" --use-proxy
```

### Programmatic API

```javascript
import GoogleMapsScraper, { DataExporter } from './src/index.js';

// Initialize
const scraper = new GoogleMapsScraper({
  maxResults: 100,
  useProxy: true,
});

await scraper.initialize();

// Search
const results = await scraper.searchPlaces('cafe', 'London, UK', {
  minRating: 4.0,
  status: 'open'
});

// Export
await DataExporter.exportMultiple(
  results,
  './output',
  ['json', 'csv', 'excel', 'html']
);

// Cleanup
await scraper.close();
```

## Configuration

### Basic Setup (.env)

```env
# Browser settings
HEADLESS=true
TIMEOUT=30000

# Proxies (optional)
USE_PROXY=false
PROXY_LIST=http://proxy1.com:8080,http://proxy2.com:8080

# Output
OUTPUT_DIR=./output
```

### With Proxies

```env
USE_PROXY=true
PROXY_LIST=http://user:pass@proxy1.com:8080,http://user:pass@proxy2.com:8080
```

See [CONFIGURATION.md](CONFIGURATION.md) for detailed proxy setup with services like ScraperAPI, Bright Data, Oxylabs, etc.

## Data Fields Extracted

For each place, you get:

| Field | Type | Example |
|-------|------|---------|
| placeName | string | "Joe's Pizza" |
| url | string | "https://www.google.com/maps/place/..." |
| category | string | "Pizza Restaurant" |
| totalReviewScore | number | 4.5 |
| reviewCount | number | 2840 |
| priceLevel | number | 2 ($ symbols) |
| phoneNumber | string | "+1 (212) 366-1182" |
| address.street | string | "124 Fulton St" |
| address.city | string | "New York" |
| website | string | "https://joespizzanyc.com" |
| coordinates.latitude | number | 40.7074 |
| coordinates.longitude | number | -74.0023 |
| permanentlyClosed | boolean | false |
| temporarilyClosed | boolean | false |
| canBeClaimed | boolean | false |
| countryCode | string | "US" |
| placeId | string | "ChIJoQ2tL..." |
| scrapedAt | ISO string | "2024-02-20T15:32:45.123Z" |

## Performance & Reliability

### Speed Optimizations
- Parallel result collection
- Efficient DOM parsing
- Minimal wait times
- Headless browser mode

### Reliability Features
- Automatic retry logic
- Proxy rotation support
- Rate limiting
- Timeout handling
- Error recovery

### Anti-Detection Tricks
- Realistic user agent
- Proper viewport settings
- Behavioral delays
- Request throttling
- Proxy support for IP rotation

## Common Use Cases

### 1. Business Intelligence
Extract competitor data, pricing, locations for market analysis

### 2. Lead Generation
Gather contact info for local businesses for outreach

### 3. Location Research
Find businesses by type and rating in specific areas

### 4. Data Enrichment
Supplement your existing data with Google Maps information

### 5. Report Generation
Create beautiful HTML reports of business findings

### 6. Price Comparison
Monitor pricing levels of similar businesses over time

## Limitations

- **Google's Dynamic Content**: Results load as you scroll
- **Rate Limits**: Google has protections against bulk scraping
- **Pagination Cap**: ~1000 results max per unique search
- **DOM Structure**: Changes to Google's UI may require updates
- **Legal Considerations**: Check Google Maps ToS and local laws

## Next Steps

1. **Run installation test**:
   ```bash
   node tests/test-installation.js
   ```

2. **Try examples**:
   - Check [QUICKSTART.md](QUICKSTART.md) for 5-minute guide
   - Review [examples.js](examples.js) for code samples
   - See [README.md](README.md) for full documentation

3. **Set up proxies** (optional):
   - Follow [CONFIGURATION.md](CONFIGURATION.md)
   - Add proxy URLs to `.env`

4. **Run your first search**:
   ```bash
   npm run scrape -- --search "cafe" --location "London"
   ```

5. **Check results**:
   - Open `./output/` folder
   - Review JSON, CSV, Excel, or HTML files

## Troubleshooting

### Installation Issues
```bash
# Reinstall all dependencies
rm -rf node_modules package-lock.json
npm install

# Install Playwright browsers
npx playwright install
```

### Runtime Issues
```bash
# Test with visible browser for debugging
npm run scrape -- --search "cafe" --location "NYC" --headless false

# Increase timeout for slow connections
npm run scrape -- --search "cafe" --location "NYC" --timeout 60000
```

### Getting Blocked
1. Enable proxies in `.env`
2. Use `--use-proxy` flag
3. Reduce MAX_CONCURRENT_REQUESTS
4. Add delays between searches

See [README.md](README.md) Troubleshooting section for more details.

## Technical Stack

- **Runtime**: Node.js 16+
- **Browser Automation**: Playwright (Chromium)
- **Data Export**: 
  - JSON (native)
  - CSV (csv library)
  - Excel (ExcelJS)
  - HTML (native)
- **CLI**: yargs
- **Configuration**: dotenv
- **DOM Parsing**: JSDOM

## Architecture Diagram

```
User Input
    ↓
CLI Interface (yargs)
    ↓
Google Maps Scraper
    ├─ Browser Manager (Playwright)
    ├─ Proxy Manager (rotation)
    ├─ Page Navigation
    └─ Scroll & Load Results
    ↓
Data Extractor
├─ Parse DOM
├─ Extract Fields
└─ Normalize Data
    ↓
Data Exporter
├─ JSON
├─ CSV
├─ Excel
└─ HTML
    ↓
Output Files
```

## License & Legal

This tool is provided under the MIT License. Users are responsible for:
- Compliance with Google Maps Terms of Service
- Respectful use of scraped data
- Adherence to local laws and regulations

See [LICENSE](LICENSE) for full terms.

## Support

For issues or questions:
1. Check [QUICKSTART.md](QUICKSTART.md)
2. Review [README.md](README.md) 
3. Check [CONFIGURATION.md](CONFIGURATION.md)
4. Run `npm run scrape -- --help`
5. Enable debug mode: `--headless false`

## What's Included vs. Apify Actor

| Feature | Our Tool | Apify Actor |
|---------|----------|-------------|
| Search scraping | ✅ | ✅ |
| URL scraping | ✅ | ✅ |
| Proxy support | ✅ | ✅ |
| Multiple formats | ✅ | ✅ |
| Filtering | ✅ | ✅ |
| Self-hosted | ✅ | ❌ |
| Free/Open source | ✅ | ❌ |
| Advanced analytics | ❌ | ✅ |
| Managed hosting | ❌ | ✅ |
| Advanced scheduling | ❌ | ✅ |

## Summary

You now have a complete, production-ready Google Maps scraper that:
- ✅ Searches and scrapes Google Maps results
- ✅ Extracts 20+ data fields per place
- ✅ Supports proxy rotation
- ✅ Exports to 4 formats
- ✅ Includes filtering capabilities
- ✅ Provides both CLI and API interfaces
- ✅ Is fully self-hosted and open source

Ready to start scraping! 🗺️
