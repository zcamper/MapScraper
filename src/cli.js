#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import { fileURLToPath } from 'url';
import GoogleMapsScraper from './scraper.js';
import { DataExporter } from './dataExporter.js';
import { MapVisualizer } from './mapVisualizer.js';
import { ensureOutputDirectory, isValidGoogleMapsUrl } from './utils.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main CLI interface
 */
const argv = yargs(hideBin(process.argv))
  .option('search', {
    alias: 's',
    type: 'string',
    description: 'Search term or comma-separated terms (e.g., "restaurant,coffee shop")',
  })
  .option('url', {
    alias: 'u',
    type: 'string',
    description: 'Direct Google Maps URL to scrape',
  })
  .option('location', {
    alias: 'l',
    type: 'string',
    description: 'Location (city, country, or zip code)',
  })
  .option('max-results', {
    alias: 'm',
    type: 'number',
    default: 120,
    description: 'Maximum number of results per search term (default: 120)',
  })
  .option('min-rating', {
    alias: 'r',
    type: 'number',
    description: 'Filter results by minimum rating (e.g., 4.0)',
  })
  .option('status', {
    type: 'string',
    choices: ['open', 'closed_permanent', 'closed_temporary'],
    description: 'Filter by open/closed status',
  })
  .option('format', {
    alias: 'f',
    type: 'array',
    default: ['json'],
    description: 'Export formats: json, csv, excel, html, map (default: json)',
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Output directory (default: ./output)',
  })
  .option('headless', {
    type: 'boolean',
    default: true,
    description: 'Run browser in headless mode (default: true)',
  })
  .option('use-proxy', {
    type: 'boolean',
    default: process.env.USE_PROXY === 'true',
    description: 'Use proxy rotation (requires PROXY_LIST in .env)',
  })
  .option('timeout', {
    type: 'number',
    default: parseInt(process.env.TIMEOUT) || 30000,
    description: 'Browser timeout in milliseconds',
  })
  .option('language', {
    alias: 'lang',
    type: 'string',
    default: process.env.LANGUAGE || 'en',
    description: 'Language for Google Maps results (e.g., en, es, fr, de)',
  })
  .option('reviews', {
    type: 'boolean',
    default: true,
    description: 'Scrape individual reviews (default: true)',
  })
  .option('reviews-limit', {
    type: 'number',
    default: 5,
    description: 'Maximum number of reviews per place (default: 5)',
  })
  .option('opening-hours', {
    type: 'boolean',
    default: true,
    description: 'Scrape opening hours (default: true)',
  })
  .option('debug', {
    type: 'boolean',
    default: false,
    description: 'Save screenshots and HTML for debugging selectors',
  })
  .check((argv) => {
    if (!argv.search && !argv.url) {
      throw new Error('Please provide either --search or --url');
    }
    if (argv.search && !argv.location && !argv.url) {
      throw new Error('--location is required when using --search');
    }
    return true;
  })
  .help()
  .argv;

/**
 * Main execution
 */
async function main() {
  let scraper = null;

  try {
    // Setup output directory
    const outputDir = argv.output || './output';
    await ensureOutputDirectory(outputDir);

    // Parse proxy list
    const proxyList = (process.env.PROXY_LIST || '')
      .split(',')
      .map(p => p.trim())
      .filter(p => p);

    // Initialize scraper
    console.log('\nGoogle Maps Scraper\n');
    scraper = new GoogleMapsScraper({
      headless: argv.headless,
      maxResults: argv.maxResults,
      useProxy: argv.useProxy,
      proxyList,
      timeout: argv.timeout,
      language: argv.language,
      scrapeReviews: argv.reviews,
      reviewsLimit: argv.reviewsLimit,
      scrapeOpeningHours: argv.openingHours,
      debug: argv.debug,
    });

    await scraper.initialize();

    let results = [];

    // Execute search
    if (argv.url) {
      // Direct URL scraping
      if (!isValidGoogleMapsUrl(argv.url)) {
        console.error('Invalid Google Maps URL');
        process.exit(1);
      }
      results = await scraper.scrapeUrl(argv.url, {
        maxResults: argv.maxResults,
        minRating: argv.minRating,
        status: argv.status,
      });
    } else {
      // Search term(s)
      const searchTerms = argv.search
        .split(',')
        .map(t => t.trim())
        .filter(t => t);

      if (searchTerms.length === 1) {
        results = await scraper.searchPlaces(
          searchTerms[0],
          argv.location,
          {
            maxResults: argv.maxResults,
            minRating: argv.minRating,
            status: argv.status,
          }
        );
      } else {
        results = await scraper.batchSearch(searchTerms, argv.location, {
          maxResults: argv.maxResults,
          minRating: argv.minRating,
          status: argv.status,
        });
      }
    }

    // Export results
    if (results.length > 0) {
      console.log('\nExporting results...\n');
      const exportFormats = Array.isArray(argv.format) ? argv.format : [argv.format];

      // Separate map format from regular formats
      const regularFormats = exportFormats.filter(f => f !== 'map');
      const generateMap = exportFormats.includes('map');

      if (regularFormats.length > 0) {
        const exportedFiles = await DataExporter.exportMultiple(
          results,
          outputDir,
          regularFormats
        );

        console.log('\nExported files:');
        Object.values(exportedFiles).forEach(file => {
          if (file) console.log(`   -> ${file}`);
        });
      }

      // Generate interactive map
      if (generateMap) {
        const mapFile = await MapVisualizer.generateMap(results, outputDir);
        if (mapFile) {
          console.log(`   -> ${mapFile} (interactive map)`);
        }
      }

      console.log(`\nScraping completed! ${results.length} results saved to: ${outputDir}\n`);
    } else {
      console.log('\nNo results found');
    }

    process.exit(0);
  } catch (error) {
    console.error('\nFatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (scraper) {
      await scraper.close();
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main };
