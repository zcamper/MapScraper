/**
 * Apify Actor Entry Point
 *
 * Wraps the GoogleMapsScraper for the Apify platform with
 * pay-per-event billing (actor-start, place-scraped, review-scraped).
 */

import { Actor } from 'apify';
import GoogleMapsScraper from '../src/scraper.js';

await Actor.init();

let scraper = null;

try {
    const input = await Actor.getInput() ?? {};
    Actor.log.info('Input received', { input: { ...input, proxyConfig: input.proxyConfig ? '(set)' : '(not set)' } });

    const {
        searchTerms = [],
        location = '',
        directUrls = [],
        maxResults = 120,
        scrapeReviews = true,
        reviewsLimit = 5,
        scrapeOpeningHours = true,
        minRating,
        status,
        language = 'en',
        proxyConfig,
    } = input;

    // Validate input
    if (searchTerms.length === 0 && directUrls.length === 0) {
        throw new Error('Provide either searchTerms (with location) or directUrls.');
    }
    if (searchTerms.length > 0 && !location) {
        throw new Error('location is required when using searchTerms.');
    }

    // Charge for actor start
    await Actor.charge({ eventName: 'actor-start', count: 1 });

    // Build proxy configuration for Playwright
    let proxyList = [];
    if (proxyConfig?.useApifyProxy) {
        const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
        const proxyUrl = await proxyConfiguration.newUrl();
        proxyList = [proxyUrl];
        Actor.log.info('Using Apify Proxy');
    } else {
        Actor.log.info('No proxy configured - running without proxy');
    }

    scraper = new GoogleMapsScraper({
        headless: true,
        maxResults,
        useProxy: proxyList.length > 0,
        proxyList,
        language,
        scrapeReviews,
        reviewsLimit,
        scrapeOpeningHours,
        timeout: 90000,
    });

    await scraper.initialize();

    let totalResults = 0;

    // Helper: process and push results to dataset
    const processResults = async (results, label) => {
        if (results.length === 0) {
            Actor.log.warning(`No results returned for: ${label}`);
            // Save debug screenshot to key-value store
            await saveDebugScreenshot(scraper, `no-results-${label.replace(/[^a-z0-9]/gi, '_')}`);
            return;
        }

        for (const place of results) {
            await Actor.pushData(place);
            await Actor.charge({ eventName: 'place-scraped', count: 1 });

            if (place.reviews && place.reviews.length > 0) {
                await Actor.charge({
                    eventName: 'review-scraped',
                    count: place.reviews.length,
                });
            }
        }
        totalResults += results.length;
        Actor.log.info(`Pushed ${results.length} places to dataset (total: ${totalResults})`);
    };

    // Process direct URLs
    for (const url of directUrls) {
        Actor.log.info(`Scraping URL: ${url}`);
        const results = await scraper.scrapeUrl(url, { maxResults, minRating, status });
        await processResults(results, url);
    }

    // Process search terms
    for (let i = 0; i < searchTerms.length; i++) {
        const term = searchTerms[i];
        Actor.log.info(`[${i + 1}/${searchTerms.length}] Searching: "${term}" in "${location}"`);
        const results = await scraper.searchPlaces(term, location, {
            maxResults,
            minRating,
            status,
        });
        await processResults(results, `${term} in ${location}`);
    }

    Actor.log.info(`Scraping completed. Total results: ${totalResults}`);

} catch (error) {
    Actor.log.error(`Actor failed: ${error.message}`);
    // Try to save a screenshot for debugging
    if (scraper?.page) {
        await saveDebugScreenshot(scraper, 'error');
    }
    throw error;
} finally {
    if (scraper) await scraper.close();
    await Actor.exit();
}

/**
 * Save a screenshot and page URL to the Apify key-value store for debugging.
 */
async function saveDebugScreenshot(scraper, label) {
    try {
        if (!scraper.page) return;
        const kvStore = await Actor.openKeyValueStore();
        const screenshot = await scraper.page.screenshot({ fullPage: true });
        await kvStore.setValue(`debug-screenshot-${label}`, screenshot, { contentType: 'image/png' });
        const currentUrl = scraper.page.url();
        const pageTitle = await scraper.page.title().catch(() => 'unknown');
        Actor.log.info(`Debug screenshot saved as "debug-screenshot-${label}"`, { currentUrl, pageTitle });
    } catch (e) {
        Actor.log.warning(`Could not save debug screenshot: ${e.message}`);
    }
}
