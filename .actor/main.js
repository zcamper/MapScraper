/**
 * Apify Actor Entry Point
 *
 * Wraps the GoogleMapsScraper for the Apify platform with
 * pay-per-event billing (actor-start, place-scraped, review-scraped).
 */

import { Actor } from 'apify';
import GoogleMapsScraper from '../src/scraper.js';

await Actor.init();

try {
    const input = await Actor.getInput() ?? {};

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
    }

    const scraper = new GoogleMapsScraper({
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

    // Process results: push to dataset and charge per event
    const processResults = async (results) => {
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
        Actor.log.info(`Pushed ${results.length} places to dataset`);
    };

    // Process direct URLs
    for (const url of directUrls) {
        Actor.log.info(`Scraping URL: ${url}`);
        const results = await scraper.scrapeUrl(url, { maxResults, minRating, status });
        await processResults(results);
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
        await processResults(results);
    }

    await scraper.close();
    Actor.log.info('Scraping completed successfully');

} catch (error) {
    Actor.log.error(`Actor failed: ${error.message}`);
    throw error;
} finally {
    await Actor.exit();
}
