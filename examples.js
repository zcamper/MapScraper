import GoogleMapsScraper, { DataExporter } from '../src/index.js';

/**
 * Example 1: Basic search and export
 */
async function exampleBasicSearch() {
  console.log('\n=== Example 1: Basic Search ===\n');

  const scraper = new GoogleMapsScraper({
    headless: true,
    maxResults: 50,
  });

  try {
    await scraper.initialize();

    const results = await scraper.searchPlaces(
      'Italian Restaurant',
      'Rome, Italy'
    );

    console.log(`Found ${results.length} restaurants\n`);

    // Export results
    await DataExporter.exportJSON(results, './output/restaurants.json');

  } finally {
    await scraper.close();
  }
}

/**
 * Example 2: Search with filters
 */
async function exampleFilteredSearch() {
  console.log('\n=== Example 2: Filtered Search ===\n');

  const scraper = new GoogleMapsScraper({
    headless: true,
    maxResults: 100,
  });

  try {
    await scraper.initialize();

    const results = await scraper.searchPlaces(
      'Cafe',
      'Sydney, Australia',
      {
        minRating: 4.5,
        status: 'open',
      }
    );

    console.log(`Found ${results.length} highly-rated open cafes\n`);

    // Show top results
    results.slice(0, 5).forEach((place, i) => {
      console.log(`${i + 1}. ${place.placeName}`);
      console.log(`   Rating: ★${place.totalReviewScore} (${place.reviewCount} reviews)`);
      console.log(`   Address: ${place.address.fullAddress}\n`);
    });

  } finally {
    await scraper.close();
  }
}

/**
 * Example 3: Batch processing multiple search terms
 */
async function exampleBatchSearch() {
  console.log('\n=== Example 3: Batch Search ===\n');

  const scraper = new GoogleMapsScraper({
    headless: true,
    maxResults: 30,
  });

  try {
    await scraper.initialize();

    const searchTerms = ['Pizza', 'Sushi', 'Burger'];
    const results = await scraper.batchSearch(
      searchTerms,
      'New York, USA'
    );

    console.log(`\nTotal results: ${results.length}\n`);

    // Group by category
    const byCategory = {};
    results.forEach(place => {
      if (!byCategory[place.category]) {
        byCategory[place.category] = [];
      }
      byCategory[place.category].push(place);
    });

    Object.entries(byCategory).forEach(([category, places]) => {
      console.log(`${category}: ${places.length} places`);
    });

    // Export to all formats
    await DataExporter.exportMultiple(
      results,
      './output',
      ['json', 'csv', 'excel', 'html']
    );

  } finally {
    await scraper.close();
  }
}

/**
 * Example 4: Direct URL scraping
 */
async function exampleUrlScraping() {
  console.log('\n=== Example 4: URL Scraping ===\n');

  const scraper = new GoogleMapsScraper({
    headless: true,
    maxResults: 50,
  });

  try {
    await scraper.initialize();

    // Scrape a Google Maps search URL
    const url = 'https://www.google.com/maps/search/coffee+london/';
    const results = await scraper.scrapeUrl(url);

    console.log(`Scraped ${results.length} places from URL\n`);

    // Export as HTML report
    await DataExporter.exportHTML(
      results,
      './output/coffee_london_report.html',
      'Coffee Shops in London'
    );

  } finally {
    await scraper.close();
  }
}

/**
 * Example 5: Using proxies
 */
async function exampleWithProxies() {
  console.log('\n=== Example 5: With Proxy Rotation ===\n');

  const proxyList = [
    'http://proxy1.example.com:8080',
    'http://proxy2.example.com:8080',
    'http://proxy3.example.com:8080',
  ];

  const scraper = new GoogleMapsScraper({
    headless: true,
    maxResults: 50,
    useProxy: true,
    proxyList,
  });

  try {
    await scraper.initialize();

    const results = await scraper.searchPlaces(
      'Hotel',
      'Bangkok, Thailand'
    );

    console.log(`Found ${results.length} hotels using proxies\n`);

    // Export to CSV
    const filePath = await DataExporter.exportCSV(
      results,
      './output/hotels_bangkok.csv'
    );
    console.log(`Exported to: ${filePath}`);

  } finally {
    await scraper.close();
  }
}

/**
 * Example 6: Data analysis after scraping
 */
async function exampleDataAnalysis() {
  console.log('\n=== Example 6: Data Analysis ===\n');

  const scraper = new GoogleMapsScraper({
    headless: true,
    maxResults: 100,
  });

  try {
    await scraper.initialize();

    const results = await scraper.searchPlaces(
      'Restaurant',
      'Tokyo, Japan'
    );

    // Calculate statistics
    const stats = {
      total: results.length,
      ratedPlaces: results.filter(p => p.totalReviewScore).length,
      averageRating: (
        results.filter(p => p.totalReviewScore).reduce((sum, p) => sum + p.totalReviewScore, 0) /
        results.filter(p => p.totalReviewScore).length
      ).toFixed(2),
      totalReviews: results.reduce((sum, p) => sum + (p.reviewCount || 0), 0),
      withWebsite: results.filter(p => p.website).length,
      withPhone: results.filter(p => p.phoneNumber).length,
      open: results.filter(p => !p.permanentlyClosed && !p.temporarilyClosed).length,
      closed: results.filter(p => p.permanentlyClosed || p.temporarilyClosed).length,
    };

    console.log('Statistics:');
    console.log(`  Total places: ${stats.total}`);
    console.log(`  With ratings: ${stats.ratedPlaces}`);
    console.log(`  Average rating: ${stats.averageRating}`);
    console.log(`  Total reviews: ${stats.totalReviews}`);
    console.log(`  With website: ${stats.withWebsite}`);
    console.log(`  With phone: ${stats.withPhone}`);
    console.log(`  Open: ${stats.open}`);
    console.log(`  Closed: ${stats.closed}\n`);

    // Find top-rated places
    const topRated = results
      .filter(p => p.totalReviewScore)
      .sort((a, b) => b.totalReviewScore - a.totalReviewScore)
      .slice(0, 5);

    console.log('Top 5 Rated Places:');
    topRated.forEach((place, i) => {
      console.log(
        `${i + 1}. ${place.placeName} - ★${place.totalReviewScore} (${place.reviewCount} reviews)`
      );
    });

  } finally {
    await scraper.close();
  }
}

/**
 * Example 7: Error handling
 */
async function exampleErrorHandling() {
  console.log('\n=== Example 7: Error Handling ===\n');

  const scraper = new GoogleMapsScraper({
    headless: true,
    maxResults: 50,
    timeout: 10000, // Short timeout for demo
  });

  try {
    await scraper.initialize();

    // Handle invalid search
    try {
      const results = await scraper.searchPlaces(
        'Restaurant',
        'InvalidCity123'
      );
      console.log(`Found ${results.length} results`);
    } catch (error) {
      console.error(`Search error: ${error.message}`);
    }

    // Handle invalid URL
    try {
      const results = await scraper.scrapeUrl('https://invalid-url.com');
      console.log(`Found ${results.length} results`);
    } catch (error) {
      console.error(`URL error: ${error.message}`);
    }

  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
  } finally {
    await scraper.close();
  }
}

/**
 * Run examples
 */
async function runExamples() {
  // Uncomment to run specific examples:

  // await exampleBasicSearch();
  // await exampleFilteredSearch();
  // await exampleBatchSearch();
  // await exampleUrlScraping();
  // await exampleWithProxies();
  // await exampleDataAnalysis();
  // await exampleErrorHandling();

  console.log('\n✓ Examples available in examples.js');
  console.log('Uncomment any example function to run it\n');
}

runExamples().catch(console.error);
