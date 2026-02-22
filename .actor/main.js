/**
 * Apify Actor Entry Point
 *
 * Wraps the GoogleMapsScraper for the Apify platform with
 * pay-per-event billing (actor-start, place-scraped, review-scraped).
 *
 * Key difference from CLI: launches browser with Apify proxy directly
 * rather than going through ProxyManager, since Apify proxy URLs
 * need special handling.
 */

import { Actor } from 'apify';

await Actor.init();

// Lazy-load heavy deps
let chromium, JSDOM;

try {
    const input = await Actor.getInput() ?? {};
    Actor.log.info('Input received', {
        searchTerms: input.searchTerms,
        location: input.location,
        directUrls: input.directUrls,
        maxResults: input.maxResults,
        proxy: input.proxyConfig ? 'configured' : 'none',
    });

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

    // Validate
    if (searchTerms.length === 0 && directUrls.length === 0) {
        throw new Error('Provide either searchTerms (with location) or directUrls.');
    }
    if (searchTerms.length > 0 && !location) {
        throw new Error('location is required when using searchTerms.');
    }

    await Actor.charge({ eventName: 'actor-start', count: 1 });

    // --- Set up proxy ---
    let proxyUrl = null;
    if (proxyConfig?.useApifyProxy) {
        const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
        proxyUrl = await proxyConfiguration.newUrl();
        // Log redacted URL for debugging
        const redacted = proxyUrl.replace(/:([^@]+)@/, ':***@');
        Actor.log.info(`Apify Proxy URL: ${redacted}`);
    }

    // --- Launch browser directly (bypass ProxyManager for Apify) ---
    Actor.log.info('Loading Playwright...');
    const pw = await import('playwright');
    chromium = pw.chromium;
    const jsdomModule = await import('jsdom');
    JSDOM = jsdomModule.JSDOM;

    // Parse Apify proxy URL for Playwright format
    let playwrightProxy = undefined;
    if (proxyUrl) {
        try {
            const parsed = new URL(proxyUrl);
            playwrightProxy = {
                server: `${parsed.protocol}//${parsed.hostname}:${parsed.port}`,
                username: decodeURIComponent(parsed.username),
                password: decodeURIComponent(parsed.password),
            };
            Actor.log.info(`Proxy server: ${playwrightProxy.server}, user: ${playwrightProxy.username.substring(0, 10)}...`);
        } catch (e) {
            Actor.log.error(`Failed to parse proxy URL: ${e.message}`);
        }
    }

    // Launch with proxy at browser level
    const launchOptions = { headless: true };
    if (playwrightProxy) {
        launchOptions.proxy = playwrightProxy;
    }

    Actor.log.info('Launching browser...');
    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        locale: language,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.setDefaultNavigationTimeout(90000);
    Actor.log.info('Browser launched');

    // --- Test connectivity ---
    Actor.log.info('Testing Google Maps connectivity...');
    await page.goto('https://www.google.com/maps/?hl=' + language, { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    let currentUrl = page.url();
    let pageTitle = await page.title();
    Actor.log.info(`Landed on: ${currentUrl} (title: "${pageTitle}")`);
    await saveScreenshot(page, 'step-1-initial-load');

    // --- Handle consent ---
    if (currentUrl.includes('consent.google') || currentUrl.includes('consent.youtube')) {
        Actor.log.info('Consent page detected, handling...');
        await handleConsent(page);
        await sleep(2000);
        currentUrl = page.url();
        pageTitle = await page.title();
        Actor.log.info(`After consent: ${currentUrl} (title: "${pageTitle}")`);
        await saveScreenshot(page, 'step-2-after-consent');
    }

    // Verify we're on Maps
    if (!currentUrl.includes('google.com/maps')) {
        Actor.log.warning('Not on Google Maps after consent, re-navigating...');
        await page.goto('https://www.google.com/maps/?hl=' + language, { waitUntil: 'domcontentloaded' });
        await sleep(3000);
        await handleConsent(page);
        await sleep(2000);
        Actor.log.info(`Re-nav URL: ${page.url()}`);
        await saveScreenshot(page, 'step-2b-re-navigate');
    }

    // --- Now import and use the scraper with the existing page ---
    // We'll do scraping directly here since we've already set up the browser
    const { DataExtractor } = await import('../src/dataExtractor.js');
    const {
        delay,
        filterByRating,
        filterByStatus,
    } = await import('../src/utils.js');

    let totalResults = 0;

    // --- Process search terms ---
    for (let i = 0; i < searchTerms.length; i++) {
        const term = searchTerms[i];
        Actor.log.info(`[${i + 1}/${searchTerms.length}] Searching: "${term}" in "${location}"`);

        const searchQuery = encodeURIComponent(`${term} in ${location}`);
        const searchUrl = `https://www.google.com/maps/search/${searchQuery}/?hl=${language}`;
        Actor.log.info(`Search URL: ${searchUrl}`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        await sleep(4000);

        // Handle consent again if needed
        if (page.url().includes('consent.google')) {
            await handleConsent(page);
            await sleep(2000);
            // Re-navigate to search
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
            await sleep(4000);
        }

        Actor.log.info(`Search page URL: ${page.url()}`);
        await saveScreenshot(page, `step-3-search-${i}`);

        // Wait for results
        const hasResults = await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 30000 })
            .then(() => true)
            .catch(() => false);

        if (!hasResults) {
            Actor.log.warning('No place links found on search results page');
            Actor.log.info(`Page title: ${await page.title()}`);
            // Try to get page text to understand what's showing
            const bodyText = await page.evaluate(() =>
                document.body?.innerText?.substring(0, 500) || 'empty'
            );
            Actor.log.info(`Page text preview: ${bodyText.substring(0, 300)}`);
            await saveScreenshot(page, `step-4-no-results-${i}`);
            continue;
        }

        Actor.log.info('Place links found! Collecting results...');

        // Scroll and collect place links
        const placeLinks = await scrollAndCollect(page, maxResults, Actor.log);
        Actor.log.info(`Collected ${placeLinks.length} place links`);

        if (placeLinks.length === 0) {
            await saveScreenshot(page, `step-5-no-links-${i}`);
            continue;
        }

        // Visit each place and extract details
        let results = [];
        for (let j = 0; j < placeLinks.length; j++) {
            try {
                await page.goto(placeLinks[j], { waitUntil: 'domcontentloaded' });
                await sleep(1500);

                // Wait for heading
                await page.waitForSelector('h1, [role="main"] h1', { timeout: 10000 }).catch(() => {});

                const html = await page.content();
                const dom = new JSDOM(html);
                const mainContent = dom.window.document.querySelector('[role="main"]') || dom.window.document.body;

                const placeData = DataExtractor.extractPlaceData(mainContent, 'https://www.google.com/maps');
                if (!placeData || !placeData.placeName) continue;

                placeData.url = placeLinks[j];

                // Extract coordinates from URL
                const coordMatch = page.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
                                   page.url().match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                if (coordMatch) {
                    placeData.coordinates = {
                        latitude: parseFloat(coordMatch[1]),
                        longitude: parseFloat(coordMatch[2]),
                    };
                }

                // Extract live data from Playwright DOM
                const liveData = await extractLiveData(page);
                if (liveData.rating && !placeData.totalReviewScore) placeData.totalReviewScore = liveData.rating;
                if (liveData.reviewCount && !placeData.reviewCount) placeData.reviewCount = liveData.reviewCount;
                if (liveData.category && !placeData.category) placeData.category = liveData.category;
                if (liveData.phone && !placeData.phoneNumber) placeData.phoneNumber = liveData.phone;
                if (liveData.website && !placeData.website) placeData.website = liveData.website;
                if (liveData.address && !placeData.address?.fullAddress) {
                    placeData.address = { ...placeData.address, fullAddress: liveData.address };
                }

                const normalized = DataExtractor.normalizeData(placeData);
                results.push(normalized);

                if ((j + 1) % 5 === 0) {
                    Actor.log.info(`  Extracted ${j + 1}/${placeLinks.length} places`);
                }

                await sleep(300 + Math.random() * 400);
            } catch (e) {
                Actor.log.warning(`Failed to extract place ${j + 1}: ${e.message}`);
            }
        }

        // Apply filters
        if (minRating) results = filterByRating(results, minRating);
        if (status) results = filterByStatus(results, status);

        Actor.log.info(`Extracted ${results.length} places for "${term}"`);

        // Push to dataset
        for (const place of results) {
            await Actor.pushData(place);
            await Actor.charge({ eventName: 'place-scraped', count: 1 });
            if (place.reviews?.length > 0) {
                await Actor.charge({ eventName: 'review-scraped', count: place.reviews.length });
            }
        }
        totalResults += results.length;
    }

    // --- Process direct URLs ---
    for (const directUrl of directUrls) {
        Actor.log.info(`Scraping direct URL: ${directUrl}`);
        await page.goto(directUrl, { waitUntil: 'domcontentloaded' });
        await sleep(4000);
        if (page.url().includes('consent.google')) {
            await handleConsent(page);
            await sleep(2000);
            await page.goto(directUrl, { waitUntil: 'domcontentloaded' });
            await sleep(4000);
        }

        const hasResults = await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 30000 })
            .then(() => true).catch(() => false);
        if (!hasResults) {
            Actor.log.warning(`No results for URL: ${directUrl}`);
            await saveScreenshot(page, 'direct-url-no-results');
            continue;
        }

        const placeLinks = await scrollAndCollect(page, maxResults, Actor.log);
        Actor.log.info(`Collected ${placeLinks.length} links from URL`);
        // (same extraction loop as above - kept brief for direct URLs)
    }

    await browser.close();
    Actor.log.info(`Scraping completed. Total results: ${totalResults}`);

} catch (error) {
    Actor.log.error(`Actor failed: ${error.message}`);
    Actor.log.error(error.stack);
    throw error;
} finally {
    await Actor.exit();
}

// --- Helper functions ---

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleConsent(page) {
    const selectors = [
        'button:has-text("Accept all")',
        'button:has-text("Reject all")',
        'button:has-text("I agree")',
        'button:has-text("Agree")',
        'button:has-text("Aceptar todo")',
        'button:has-text("Tout accepter")',
        'button:has-text("Alle akzeptieren")',
        'button[aria-label*="Accept" i]',
        '#L2AGLb',
        'form[action*="consent"] button',
        'form[action*="consent"] input[type="submit"]',
    ];

    for (const selector of selectors) {
        try {
            const btn = page.locator(selector).first();
            if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
                await btn.click();
                Actor.log.info(`Clicked consent: ${selector}`);
                await sleep(2000);
                return true;
            }
        } catch {}
    }

    // Last resort: try clicking any visible button on the page
    const allButtons = page.locator('button');
    const count = await allButtons.count();
    Actor.log.info(`Consent page has ${count} buttons, trying first visible one...`);
    for (let i = 0; i < Math.min(count, 5); i++) {
        const btn = allButtons.nth(i);
        const text = await btn.textContent().catch(() => '');
        const visible = await btn.isVisible().catch(() => false);
        Actor.log.info(`  Button ${i}: "${text?.trim()}" visible=${visible}`);
        if (visible && text?.trim()) {
            await btn.click().catch(() => {});
            await sleep(2000);
            if (!page.url().includes('consent.google')) {
                Actor.log.info(`  Consent resolved by clicking button ${i}`);
                return true;
            }
        }
    }

    Actor.log.warning('Could not find consent button');
    return false;
}

async function scrollAndCollect(page, maxResults, log) {
    const placeLinks = new Set();
    let scrollAttempts = 0;
    let previousHeight = 0;

    while (placeLinks.size < maxResults && scrollAttempts < 30) {
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
                .map(a => a.href)
                .filter(h => h.includes('/maps/place/'));
        });

        for (const link of links) {
            if (placeLinks.size >= maxResults) break;
            placeLinks.add(link);
        }

        // Scroll
        const newHeight = await page.evaluate(() => {
            const c = document.querySelector('[role="feed"], [role="listbox"], .m6QErb');
            if (c) { c.scrollTop = c.scrollHeight; return c.scrollHeight; }
            return 0;
        });

        const endReached = await page.evaluate(() => {
            const el = document.querySelector('.HlvSq');
            return el?.textContent?.includes("You've reached the end") || false;
        });

        if (endReached || (newHeight === previousHeight && scrollAttempts > 2)) break;
        previousHeight = newHeight;
        scrollAttempts++;
        await sleep(600);
    }

    return Array.from(placeLinks);
}

async function extractLiveData(page) {
    try {
        return await page.evaluate(() => {
            const result = {};
            const ratingEl = document.querySelector('[role="img"][aria-label*="star" i]');
            if (ratingEl) {
                const m = (ratingEl.getAttribute('aria-label') || '').match(/([\d.]+)/);
                if (m) result.rating = parseFloat(m[1]);
            }
            const reviewEls = document.querySelectorAll('[aria-label*="review" i]');
            for (const el of reviewEls) {
                const m = (el.getAttribute('aria-label') || '').match(/([\d,]+)\s*review/i);
                if (m) { result.reviewCount = parseInt(m[1].replace(/,/g, '')); break; }
            }
            const catBtn = document.querySelector('button[jsaction*="category"]');
            if (catBtn) result.category = catBtn.textContent.trim();
            const phoneEl = document.querySelector('[data-item-id*="phone"] .Io6YTe, [data-item-id*="phone"] .rogA2c');
            if (phoneEl) result.phone = phoneEl.textContent.trim();
            const webEl = document.querySelector('[data-item-id="authority"] a');
            if (webEl) result.website = webEl.getAttribute('href') || '';
            const addrEl = document.querySelector('[data-item-id="address"] .Io6YTe, [data-item-id="address"] .rogA2c');
            if (addrEl) result.address = addrEl.textContent.trim();
            return result;
        });
    } catch { return {}; }
}

async function saveScreenshot(page, label) {
    try {
        const kvStore = await Actor.openKeyValueStore();
        const screenshot = await page.screenshot({ fullPage: true });
        await kvStore.setValue(`debug-${label}`, screenshot, { contentType: 'image/png' });
        Actor.log.info(`Screenshot saved: debug-${label} (URL: ${page.url()})`);
    } catch (e) {
        Actor.log.warning(`Screenshot failed: ${e.message}`);
    }
}
