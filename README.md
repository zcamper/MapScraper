# Google Maps Scraper & Extractor

A comprehensive, production-ready Google Maps scraper/extractor tool built with Node.js and Playwright. Similar to Apify's Google Maps Extractor actor, this tool extracts detailed place information, supports multiple export formats, and includes proxy rotation for reliable scraping.

## Features

✨ **Core Functionality**
- 🔍 Search Google Maps by keyword, category, or location
- 📍 Scrape direct Google Maps URLs
- ⚙️ Bypass the 120-result display limit with pagination
- 🔄 Rotate through multiple proxies to avoid blocking
- 🎯 Filter results by rating, category, and open/closed status
- ⏱️ Rate limiting and throttling to be respectful

📦 **Data Extraction**
Extracts comprehensive place information:
- Place name, URL, and Google Maps Place ID
- Business category and country code
- Contact information (phone, website, email)
- Complete address (street, neighborhood, city, state, postal code)
- Pricing level ($ to $$$$)
- Review score and review count
- Individual reviews (author, rating, text, date, likes)
- Review star distribution (1-5 star breakdown)
- Business description/about text
- Opening hours (full weekly schedule)
- Coordinates (latitude/longitude)
- Open/closed status (permanent or temporary)
- Claimability status
- Plus code, menu link, reservation links
- Amenities/attributes
- Image count
- Timestamp of extraction

💾 **Export Formats**
- JSON - Structured data for APIs and applications
- CSV - Compatible with Excel and spreadsheet tools
- Excel (XLSX) - Formatted spreadsheets with styling + separate Reviews sheet
- HTML - Beautiful interactive tables with search filtering
- Map - Interactive Leaflet map with all results plotted

🛠️ **Advanced Features**
- CLI interface with flexible options
- Programmatic API for integration
- Batch processing of multiple search terms
- Headless and headed browser modes
- Multi-language support (--language flag)
- Customizable timeouts and scroll behavior
- Lazy-loaded dependencies for fast CLI startup
- Comprehensive error handling and logging

## Installation

### Prerequisites
- Node.js 16+ (recommended: 18+)
- npm or yarn

### Setup

```bash
# Clone or download the repository
cd MapScraper

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env
```

## Configuration

Edit `.env` to customize:

```env
# Proxy settings (optional)
USE_PROXY=false
PROXY_LIST=http://proxy1.com:8080,http://proxy2.com:8080
PROXY_USERNAME=
PROXY_PASSWORD=

# Browser settings
HEADLESS=true
TIMEOUT=30000
WAIT_FOR_SELECTOR_TIMEOUT=10000
SCROLL_PAUSE_TIME=500

# Rate limiting
MAX_CONCURRENT_REQUESTS=3
REQUEST_DELAY_MS=1000

# Output
OUTPUT_DIR=./output
```

## Usage

### Command Line Interface

#### Basic Search
```bash
# Search for restaurants in New York
npm run scrape -- --search "restaurant" --location "New York, USA"

# Search for multiple categories
npm run scrape -- --search "coffee shop,bakery" --location "Paris, France" --max-results 50
```

#### Filter Results
```bash
# Only get highly-rated places (4.5+ stars)
npm run scrape -- --search "hotel" --location "London" --min-rating 4.5

# Only get open places
npm run scrape -- --search "cafe" --location "Tokyo" --status open

# Get permanently closed places
npm run scrape -- --search "restaurant" --location "Berlin" --status closed_permanent
```

#### Direct URL Scraping
```bash
# Scrape a Google Maps URL directly
npm run scrape -- --url "https://www.google.com/maps/search/pizza+new+york/"
```

#### Export Options
```bash
# Export to multiple formats
npm run scrape -- --search "museum" --location "Rome" --format json csv excel html

# Generate an interactive map of results
npm run scrape -- --search "restaurant" --location "Paris" --format json map

# Specify output directory
npm run scrape -- --search "gym" --location "Sydney" --output ./data/fitness
```

#### Advanced Options
```bash
# Use rotating proxies
npm run scrape -- --search "restaurant" --location "NYC" --use-proxy

# Custom timeout (in ms)
npm run scrape -- --search "hotel" --location "Bangkok" --timeout 45000

# Run with visible browser (debugging)
npm run scrape -- --search "cafe" --location "Berlin" --headless false

# Search in a different language
npm run scrape -- --search "restaurant" --location "Tokyo" --language ja

# Limit reviews per place
npm run scrape -- --search "hotel" --location "NYC" --reviews-limit 10

# Skip reviews for faster scraping
npm run scrape -- --search "cafe" --location "London" --no-reviews
```

### Programmatic API

```javascript
import GoogleMapsScraper from './src/index.js';
import { DataExporter } from './src/dataExporter.js';

// Initialize scraper
const scraper = new GoogleMapsScraper({
  headless: true,
  maxResults: 100,
  useProxy: true,
  proxyList: ['http://proxy1:8080', 'http://proxy2:8080'],
});

// Initialize browser
await scraper.initialize();

try {
  // Single search
  const results = await scraper.searchPlaces(
    'restaurant',
    'New York, USA',
    {
      maxResults: 50,
      minRating: 4.0,
      status: 'open'
    }
  );

  console.log(`Found ${results.length} places`);

  // Export to multiple formats
  const exportedFiles = await DataExporter.exportMultiple(
    results,
    './output',
    ['json', 'csv', 'excel', 'html']
  );

  console.log('Exported files:', exportedFiles);

} finally {
  await scraper.close();
}
```

### Batch Processing

```javascript
// Process multiple search terms
const searchTerms = ['pizzeria', 'trattoria', 'ristorante'];
const results = await scraper.batchSearch(
  searchTerms,
  'Rome, Italy',
  { maxResults: 50 }
);
```

### Direct URL Scraping

```javascript
const results = await scraper.scrapeUrl(
  'https://www.google.com/maps/search/pizza+brooklyn/',
  { maxResults: 100 }
);
```

## Data Extraction Example

Each place record contains:

```json
{
  "placeName": "Joe's Pizza",
  "url": "https://www.google.com/maps/place/...",
  "priceLevel": 2,
  "category": "Pizza Restaurant",
  "countryCode": "US",
  "phoneNumber": "+1 (212) 366-1182",
  "address": {
    "street": "124 Fulton St",
    "neighborhood": "Two Bridges",
    "city": "New York",
    "postalCode": "10038",
    "state": "NY",
    "fullAddress": "124 Fulton St, Two Bridges, New York, NY 10038, United States"
  },
  "website": "https://joespizzanyc.com",
  "canBeClaimed": false,
  "coordinates": {
    "latitude": 40.7074,
    "longitude": -74.0023
  },
  "permanentlyClosed": false,
  "temporarilyClosed": false,
  "totalReviewScore": 4.5,
  "reviewCount": 2840,
  "description": "Famous New York pizza shop serving classic slices since 1975.",
  "openingHours": {
    "Monday": "10 AM - 2 AM",
    "Tuesday": "10 AM - 2 AM",
    "Wednesday": "10 AM - 2 AM",
    "Thursday": "10 AM - 2 AM",
    "Friday": "10 AM - 4 AM",
    "Saturday": "10 AM - 4 AM",
    "Sunday": "10 AM - 2 AM"
  },
  "reviewDistribution": {
    "5_star": { "count": 1800, "percentage": 63 },
    "4_star": { "count": 600, "percentage": 21 },
    "3_star": { "count": 250, "percentage": 9 },
    "2_star": { "count": 120, "percentage": 4 },
    "1_star": { "count": 70, "percentage": 3 }
  },
  "reviews": [
    {
      "reviewId": "abc123",
      "author": "John D.",
      "authorLink": "/maps/contrib/12345",
      "rating": 5,
      "text": "Best pizza in NYC, hands down!",
      "publishedDate": "2 months ago",
      "likesCount": 12
    }
  ],
  "plusCode": "Q235+XR New York",
  "menuLink": "https://joespizzanyc.com/menu",
  "reservationLinks": [],
  "amenities": { "Dine-in": true, "Takeout": true, "Delivery": true },
  "imageCount": 2450,
  "placeId": "ChIJoQ2tL7ZawokRYnrwPJB7AW0",
  "scrapedAt": "2024-02-20T15:32:45.123Z"
}
```

## Using Proxies

### Setup Proxy Rotation

1. **Add proxies to `.env`:**
```env
USE_PROXY=true
PROXY_LIST=http://proxy1.com:8080,http://proxy2.com:8080,http://proxy3.com:8080
PROXY_USERNAME=myuser
PROXY_PASSWORD=mypass
```

2. **Use in CLI:**
```bash
npm run scrape -- --search "restaurant" --location "NYC" --use-proxy
```

3. **Use in code:**
```javascript
const scraper = new GoogleMapsScraper({
  useProxy: true,
  proxyList: [
    'http://proxy1.com:8080',
    'http://proxy2.com:8080',
    'http://proxy3.com:8080'
  ]
});
```

### Recommended Proxy Services
- ScraperAPI
- Bright Data (formerly Luminati)
- Oxylabs
- SmartProxy
- Residential proxies from various providers

## Performance & Anti-Detection

### Built-in Protections
- Randomized scroll delays
- Behavioral mimicry
- Proper browser viewport settings
- Request throttling
- Proxy rotation support

### Best Practices
1. **Rate limiting:** Add delays between searches
2. **Headless inspection:** Use `--headless false` to debug selectors
3. **Proxy rotation:** Use fresh proxies per request when possible
4. **Error handling:** Implement retry logic for failed requests
5. **User-Agent:** Playwright automatically uses realistic user agents

### Avoiding Blocks
```javascript
// Add delays between searches
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

for (const term of searchTerms) {
  const results = await scraper.searchPlaces(term, location);
  await delay(2000); // 2-second delay between searches
}
```

## Troubleshooting

### Browser Won't Launch
```bash
# Install Playwright browsers
npx playwright install

# Install system dependencies (Linux)
npx playwright install-deps
```

### Timeout Errors
```bash
# Increase timeout
npm run scrape -- --search "cafe" --location "NYC" --timeout 60000
```

### Element Not Found
```bash
# Debug with visible browser
npm run scrape -- --search "cafe" --location "NYC" --headless false
```

### Proxy Not Working
```bash
# Verify proxy format: protocol://user:pass@host:port
# Test without proxy first
npm run scrape -- --search "cafe" --location "NYC" --use-proxy false
```

### No Results Found
- Google Maps may be blocking requests (try proxy)
- Location format incorrect (use "City, Country" format)
- Search term too specific (try broader terms)
- Google Maps pagination limit (results capped at ~1000)

## Architecture

```
src/
├── index.js              # Main entry point
├── cli.js                # Command-line interface
├── scraper.js            # Core Playwright-based scraper
├── dataExtractor.js      # DOM parsing and data extraction
├── dataExporter.js       # Export to JSON/CSV/Excel/HTML
├── mapVisualizer.js      # Interactive Leaflet map generation
├── proxyManager.js       # Proxy rotation logic
└── utils.js              # Utility functions

output/                    # Generated results
└── google_maps_results_* # Timestamped exports
```

## API Reference

### GoogleMapsScraper

**Constructor Options:**
- `headless` (boolean): Run in headless mode (default: true)
- `maxResults` (number): Max results per search (default: 120)
- `timeout` (number): Page timeout in ms (default: 30000)
- `scrollPauseTime` (number): Delay between scrolls (default: 500)
- `useProxy` (boolean): Enable proxy rotation (default: false)
- `proxyList` (array): List of proxy URLs
- `language` (string): Language for results (default: 'en')
- `scrapeReviews` (boolean): Extract individual reviews (default: true)
- `reviewsLimit` (number): Max reviews per place (default: 5)
- `scrapeOpeningHours` (boolean): Extract opening hours (default: true)

**Methods:**
- `initialize()` - Start browser
- `searchPlaces(term, location, options)` - Search by term
- `scrapeUrl(url, options)` - Scrape direct URL
- `batchSearch(terms, location, options)` - Multiple searches
- `close()` - Shutdown browser

### DataExporter

**Export Methods:**
- `exportJSON(data, path)` - Export as JSON
- `exportCSV(data, path)` - Export as CSV
- `exportExcel(data, path)` - Export as XLSX (Places + Reviews sheets)
- `exportHTML(data, path)` - Export as HTML with search filtering
- `exportMultiple(data, dir, formats)` - Export all formats

### MapVisualizer

**Methods:**
- `generateMap(data, outputDir)` - Generate interactive Leaflet HTML map with category filters and search

## Limitations & Considerations

### Technical Limitations
- **Dynamic content**: Results load dynamically; page scrolling required
- **Rate limits**: Google has built-in protections against bulk scraping
- **Pagination**: ~1000 results max per search location
- **Accuracy**: Data depends on Google's current DOM structure

### Ethical & Legal
- **Terms of Service**: Review Google Maps ToS before use
- **Rate limiting**: Respect Google's servers with appropriate delays
- **Data usage**: Use scraped data responsibly and ethically
- **Robots.txt**: Follow website's scraping policies
- **GDPR/Local laws**: Ensure compliance with data protection laws

### Data Quality
- Review scores may update after scraping
- Some fields may be missing for new/obscure places
- Address format varies by country
- Coordinates may be approximate

## Performance Tips

```javascript
// Reduce overhead with minimal options
const scraper = new GoogleMapsScraper({
  headless: true,
  maxResults: 50, // Smaller limit = faster
  scrollPauseTime: 300, // Shorter pauses
});

// Use batch processing
// Better than multiple single searches

// Filter early
// Apply minRating/status filters during scraping

// Reuse browser
// Better than creating new scraper instances repeatedly
```

## Contributing

Contributions welcome! Areas for improvement:
- Additional data fields extraction
- Performance optimization
- Better error recovery
- Mobile UI detection
- Image/photo collection
- Reviews extraction

## License

MIT License - See LICENSE.md

## Support

For issues, questions, or suggestions:
1. Check the Troubleshooting section
2. Review error messages carefully
3. Test with `--headless false` for debugging
4. Check Google Maps still works manually

## Disclaimer

This tool is provided for educational and lawful purposes. Users are responsible for:
- Compliance with Google's Terms of Service
- Respect for website owners' policies
- Adherence to local laws and regulations
- Responsible use of extracted data

Excessive requests may result in IP blocking. Always use appropriate delays and consider proxy services for large-scale operations.

---

**Built with ❤️ using Playwright**
