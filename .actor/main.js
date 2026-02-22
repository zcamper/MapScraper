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

// Synchronous flush helper - ensures log output is visible before process dies
function log(msg) {
    const line = `[ACTOR] ${msg}\n`;
    process.stdout.write(line);
}
function logErr(msg) {
    const line = `[ACTOR ERROR] ${msg}\n`;
    process.stderr.write(line);
}

log('Script starting...');

// Catch any unhandled errors at process level
process.on('unhandledRejection', (reason) => {
    logErr(`Unhandled rejection: ${reason}`);
    if (reason?.stack) logErr(reason.stack);
});
process.on('uncaughtException', (err) => {
    logErr(`Uncaught exception: ${err.message}`);
    logErr(err.stack);
    process.exit(1);
});

import { Actor } from 'apify';

log('Calling Actor.init()...');
await Actor.init();
log('Actor.init() completed');

// Track whether we succeeded to control exit code
let actorFailed = false;
let chromium, JSDOM;

try {
    log('Calling Actor.getInput()...');
    const input = await Actor.getInput() ?? {};
    log(`Got input. Keys: ${Object.keys(input).join(', ')}`);
    log(`searchTerms: ${JSON.stringify(input.searchTerms)}, location: ${input.location}, maxResults: ${input.maxResults}`);

    const {
        searchTerms = [],
        location = '',
        directUrls = [],
        maxResults = 120,
        scrapeReviews = true,
        reviewsLimit = 5,
        scrapeOpeningHours = true,
        scrapeEmails = true,
        minRating,
        status,
        language = 'en',
        proxyConfig,
    } = input;

    log(`Destructured OK. searchTerms=${searchTerms.length}, location="${location}", directUrls=${directUrls.length}`);

    // Validate
    if (searchTerms.length === 0 && directUrls.length === 0) {
        throw new Error('Provide either searchTerms (with location) or directUrls.');
    }
    if (searchTerms.length > 0 && !location) {
        throw new Error('location is required when using searchTerms.');
    }
    log('Validation passed');

    // Charge for actor start (non-fatal if not configured)
    log('Charging actor-start event...');
    try {
        await Actor.charge({ eventName: 'actor-start', count: 1 });
        log('actor-start charge succeeded');
    } catch (e) {
        log(`actor-start charge skipped (expected if not configured): ${e.message}`);
    }

    // --- Set up proxy ---
    log('Setting up proxy...');
    let proxyUrl = null;
    if (proxyConfig?.useApifyProxy) {
        log('Creating Apify proxy configuration...');
        const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
        proxyUrl = await proxyConfiguration.newUrl();
        const redacted = proxyUrl.replace(/:([^@]+)@/, ':***@');
        log(`Proxy URL: ${redacted}`);
    } else {
        log('No proxy configured');
    }

    // --- Launch browser ---
    log('Importing Playwright...');
    const pw = await import('playwright');
    chromium = pw.chromium;
    log('Playwright imported');

    log('Importing JSDOM...');
    const jsdomModule = await import('jsdom');
    JSDOM = jsdomModule.JSDOM;
    log('JSDOM imported');

    // Parse Apify proxy URL for Playwright format
    function parseProxyUrl(url) {
        const parsed = new URL(url);
        return {
            server: `${parsed.protocol}//${parsed.hostname}:${parsed.port}`,
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
        };
    }

    // Try launching browser and navigating — with proxy fallback
    let browser, context, page;
    const mapsUrl = 'https://www.google.com/maps/?hl=' + language;

    async function launchAndTest(proxyOpts, label) {
        const opts = { headless: true };
        if (proxyOpts) opts.proxy = proxyOpts;
        log(`[${label}] Launching browser...`);
        const b = await chromium.launch(opts);
        const ctx = await b.newContext({
            viewport: { width: 1280, height: 720 },
            locale: language,
        });
        const p = await ctx.newPage();
        p.setDefaultTimeout(90000);
        p.setDefaultNavigationTimeout(90000);
        log(`[${label}] Browser ready, navigating to Google Maps...`);
        // Use 30s timeout for the connectivity test (not full 90s)
        await p.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(3000);
        log(`[${label}] Landed on: ${p.url()} (title: "${await p.title()}")`);
        return { browser: b, context: ctx, page: p };
    }

    if (proxyUrl) {
        // Try with proxy first, fall back to direct if it times out
        let playwrightProxy;
        try {
            playwrightProxy = parseProxyUrl(proxyUrl);
            log(`Proxy parsed: server=${playwrightProxy.server}, user=${playwrightProxy.username.substring(0, 10)}...`);
        } catch (e) {
            logErr(`Failed to parse proxy URL: ${e.message}`);
        }

        if (playwrightProxy) {
            try {
                const result = await launchAndTest(playwrightProxy, 'PROXY');
                browser = result.browser;
                context = result.context;
                page = result.page;
                log('Proxy connection successful!');
            } catch (e) {
                log(`Proxy failed (${e.message}), falling back to direct connection...`);
                // Try without proxy
                const result = await launchAndTest(null, 'DIRECT');
                browser = result.browser;
                context = result.context;
                page = result.page;
                log('Direct connection successful (no proxy)');
            }
        } else {
            const result = await launchAndTest(null, 'DIRECT');
            browser = result.browser;
            context = result.context;
            page = result.page;
        }
    } else {
        const result = await launchAndTest(null, 'DIRECT');
        browser = result.browser;
        context = result.context;
        page = result.page;
    }

    let currentUrl = page.url();
    let pageTitle = await page.title();
    await saveScreenshot(page, 'step-1-initial-load');

    // --- Handle consent ---
    if (currentUrl.includes('consent.google') || currentUrl.includes('consent.youtube')) {
        log('Consent page detected, handling...');
        await handleConsent(page);
        await sleep(2000);
        currentUrl = page.url();
        pageTitle = await page.title();
        log(`After consent: ${currentUrl} (title: "${pageTitle}")`);
        await saveScreenshot(page, 'step-2-after-consent');
    }

    // Verify we're on Maps
    if (!currentUrl.includes('google.com/maps')) {
        log('Not on Google Maps after consent, re-navigating...');
        await page.goto('https://www.google.com/maps/?hl=' + language, { waitUntil: 'domcontentloaded' });
        await sleep(3000);
        await handleConsent(page);
        await sleep(2000);
        log(`Re-nav URL: ${page.url()}`);
        await saveScreenshot(page, 'step-2b-re-navigate');
    }

    // --- Import data extraction modules ---
    log('Importing DataExtractor...');
    const { DataExtractor } = await import('../src/dataExtractor.js');
    log('Importing utils...');
    const { filterByRating, filterByStatus } = await import('../src/utils.js');
    log('All modules imported');

    let totalResults = 0;

    // --- Process search terms ---
    for (let i = 0; i < searchTerms.length; i++) {
        const term = searchTerms[i];
        log(`[${i + 1}/${searchTerms.length}] Searching: "${term}" in "${location}"`);

        const searchQuery = encodeURIComponent(`${term} in ${location}`);
        const searchUrl = `https://www.google.com/maps/search/${searchQuery}/?hl=${language}`;
        log(`Search URL: ${searchUrl}`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        await sleep(4000);

        // Handle consent again if needed
        if (page.url().includes('consent.google')) {
            log('Consent page hit during search, handling...');
            await handleConsent(page);
            await sleep(2000);
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
            await sleep(4000);
        }

        log(`Search page URL: ${page.url()}`);
        await saveScreenshot(page, `step-3-search-${i}`);

        // Wait for results
        log('Waiting for place links...');
        const hasResults = await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 30000 })
            .then(() => true)
            .catch(() => false);

        if (!hasResults) {
            log('WARNING: No place links found on search results page');
            const title = await page.title();
            log(`Page title: ${title}`);
            const bodyText = await page.evaluate(() =>
                document.body?.innerText?.substring(0, 500) || 'empty'
            );
            log(`Page text preview: ${bodyText.substring(0, 300)}`);
            await saveScreenshot(page, `step-4-no-results-${i}`);
            continue;
        }

        log('Place links found! Collecting results...');

        // Scroll and collect place links
        const placeLinks = await scrollAndCollect(page, maxResults);
        log(`Collected ${placeLinks.length} place links`);

        if (placeLinks.length === 0) {
            await saveScreenshot(page, `step-5-no-links-${i}`);
            continue;
        }

        // Visit each place and extract details
        let results = [];
        // Collect websites for batch email enrichment after extraction
        const emailQueue = []; // { index, website }

        for (let j = 0; j < placeLinks.length; j++) {
            try {
                await page.goto(placeLinks[j], { waitUntil: 'domcontentloaded' });

                // Wait for heading (reduced timeout)
                await page.waitForSelector('h1, [role="main"] h1', { timeout: 5000 }).catch(() => {});

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
                // Grab email from Maps page if available
                if (liveData.email) {
                    placeData.emails = [liveData.email];
                }
                if (!placeData.emails) placeData.emails = [];

                const normalized = DataExtractor.normalizeData(placeData);
                results.push(normalized);

                // Queue website for email enrichment (done after all places)
                if (scrapeEmails && normalized.website && normalized.emails.length === 0) {
                    emailQueue.push({ index: results.length - 1, website: normalized.website });
                }

                if ((j + 1) % 10 === 0) {
                    log(`  Extracted ${j + 1}/${placeLinks.length} places`);
                }
            } catch (e) {
                log(`WARNING: Failed to extract place ${j + 1}: ${e.message}`);
            }
        }

        // --- Email enrichment (uses fetch, not browser — much faster) ---
        if (emailQueue.length > 0) {
            log(`Enriching emails for ${emailQueue.length} places with websites...`);
            // Process in parallel batches of 5
            for (let b = 0; b < emailQueue.length; b += 5) {
                const batch = emailQueue.slice(b, b + 5);
                const emailResults = await Promise.allSettled(
                    batch.map(item => scrapeEmailsFromWebsite(item.website))
                );
                for (let k = 0; k < batch.length; k++) {
                    if (emailResults[k].status === 'fulfilled' && emailResults[k].value.length > 0) {
                        results[batch[k].index].emails = emailResults[k].value;
                    }
                }
                if (b + 5 < emailQueue.length) {
                    log(`  Email batch ${Math.floor(b / 5) + 1}: ${Math.min(b + 5, emailQueue.length)}/${emailQueue.length} done`);
                }
            }
            const withEmails = results.filter(r => r.emails.length > 0).length;
            log(`Email enrichment complete: found emails for ${withEmails}/${results.length} places`);
        }

        // Apply filters
        if (minRating) results = filterByRating(results, minRating);
        if (status) results = filterByStatus(results, status);

        log(`Extracted ${results.length} places for "${term}"`);

        // Push to dataset
        for (const place of results) {
            await Actor.pushData(place);
            try {
                await Actor.charge({ eventName: 'place-scraped', count: 1 });
            } catch {}
            if (place.reviews?.length > 0) {
                try {
                    await Actor.charge({ eventName: 'review-scraped', count: place.reviews.length });
                } catch {}
            }
        }
        totalResults += results.length;
    }

    // --- Process direct URLs ---
    for (const directUrl of directUrls) {
        log(`Scraping direct URL: ${directUrl}`);
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
            log(`WARNING: No results for direct URL: ${directUrl}`);
            await saveScreenshot(page, 'direct-url-no-results');
            continue;
        }

        const placeLinks = await scrollAndCollect(page, maxResults);
        log(`Collected ${placeLinks.length} links from direct URL`);
    }

    await browser.close();
    log(`Scraping completed successfully. Total results: ${totalResults}`);

} catch (error) {
    actorFailed = true;
    logErr(`CAUGHT ERROR: ${error.message}`);
    logErr(`Stack: ${error.stack}`);
    try { Actor.log.error(`Actor failed: ${error.message}`); } catch {}
} finally {
    log(`In finally block. actorFailed=${actorFailed}`);
    if (actorFailed) {
        log('Calling Actor.fail()...');
        await Actor.fail('Actor encountered an error — check logs above');
    } else {
        log('Calling Actor.exit()...');
        await Actor.exit();
    }
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
                log(`Clicked consent: ${selector}`);
                await sleep(2000);
                return true;
            }
        } catch {}
    }

    // Last resort: try clicking any visible button on the page
    const allButtons = page.locator('button');
    const count = await allButtons.count();
    log(`Consent page has ${count} buttons, trying first visible one...`);
    for (let i = 0; i < Math.min(count, 5); i++) {
        const btn = allButtons.nth(i);
        const text = await btn.textContent().catch(() => '');
        const visible = await btn.isVisible().catch(() => false);
        log(`  Button ${i}: "${text?.trim()}" visible=${visible}`);
        if (visible && text?.trim()) {
            await btn.click().catch(() => {});
            await sleep(2000);
            if (!page.url().includes('consent.google')) {
                log(`  Consent resolved by clicking button ${i}`);
                return true;
            }
        }
    }

    log('WARNING: Could not find consent button');
    return false;
}

async function scrollAndCollect(page, maxResults) {
    const placeLinks = new Set();
    let scrollAttempts = 0;
    let previousCount = 0;
    let staleRounds = 0;

    log(`Scrolling to collect up to ${maxResults} place links...`);

    while (placeLinks.size < maxResults && scrollAttempts < 60) {
        // Collect all visible place links
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
                .map(a => a.href)
                .filter(h => h.includes('/maps/place/'));
        });

        for (const link of links) {
            if (placeLinks.size >= maxResults) break;
            placeLinks.add(link);
        }

        // Check if we found new links this round
        if (placeLinks.size === previousCount) {
            staleRounds++;
        } else {
            staleRounds = 0;
        }
        previousCount = placeLinks.size;

        // Check for "end of results" indicator
        const endReached = await page.evaluate(() => {
            const body = document.body?.innerText || '';
            return body.includes("You've reached the end") ||
                   body.includes("No more results");
        });

        if (endReached) {
            log(`End of results reached at ${placeLinks.size} links`);
            break;
        }

        // Give up after 5 rounds with no new links
        if (staleRounds >= 5) {
            log(`No new links after ${staleRounds} scroll attempts, stopping at ${placeLinks.size}`);
            break;
        }

        // Scroll the results panel — try multiple container selectors
        await page.evaluate(() => {
            // Try several known container selectors
            const selectors = [
                '[role="feed"]',
                '[role="main"] [tabindex="-1"]',
                '.m6QErb.DxyBCb',
                '.m6QErb',
                '[role="main"] div[aria-label]',
            ];
            for (const sel of selectors) {
                const c = document.querySelector(sel);
                if (c && c.scrollHeight > c.clientHeight) {
                    c.scrollBy(0, 1000);
                    return;
                }
            }
            // Fallback: scroll the first scrollable div inside role="main"
            const main = document.querySelector('[role="main"]');
            if (main) {
                const divs = main.querySelectorAll('div');
                for (const d of divs) {
                    if (d.scrollHeight > d.clientHeight + 100) {
                        d.scrollBy(0, 1000);
                        return;
                    }
                }
            }
        });

        // Also try keyboard scroll as backup
        if (scrollAttempts % 3 === 0) {
            await page.keyboard.press('End').catch(() => {});
        }

        scrollAttempts++;
        // Wait longer for content to lazy-load
        await sleep(1500);

        if (scrollAttempts % 10 === 0) {
            log(`  Scroll progress: ${placeLinks.size} links after ${scrollAttempts} scrolls`);
        }
    }

    log(`Scroll complete: ${placeLinks.size} links after ${scrollAttempts} scrolls`);
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
            // Check for email on the Maps page (rare but some businesses list it)
            const emailEl = document.querySelector('[data-item-id*="email"] .Io6YTe, [data-item-id*="email"] .rogA2c');
            if (emailEl) result.email = emailEl.textContent.trim();
            // Also scan all text for mailto: links
            const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
            if (mailtoLinks.length > 0) {
                result.email = result.email || mailtoLinks[0].href.replace('mailto:', '').split('?')[0];
            }
            return result;
        });
    } catch { return {}; }
}

/**
 * Crawl a business website to find contact email addresses.
 * Uses HTTP fetch (not browser) for speed. Checks homepage + contact pages.
 */
async function scrapeEmailsFromWebsite(websiteUrl) {
    const emails = new Set();
    const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

    let baseUrl;
    try {
        baseUrl = new URL(websiteUrl);
    } catch {
        return [];
    }

    const pagesToCheck = [baseUrl.href];
    for (const path of ['/contact', '/contact-us']) {
        pagesToCheck.push(new URL(path, baseUrl).href);
    }

    for (const url of pagesToCheck) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const resp = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MapScraper/2.0)' },
                redirect: 'follow',
            });
            clearTimeout(timeout);
            if (!resp.ok) continue;

            const html = await resp.text();

            // Extract mailto: links
            const mailtoMatches = html.match(/mailto:([^"'\s?]+)/gi) || [];
            for (const m of mailtoMatches) {
                const email = m.replace(/^mailto:/i, '').split('?')[0].trim();
                if (email) emails.add(email.toLowerCase());
            }

            // Extract emails from page text
            const textMatches = html.match(EMAIL_REGEX) || [];
            for (const email of textMatches) {
                emails.add(email.toLowerCase());
            }

            // Filter out false positives
            for (const email of emails) {
                if (email.includes('@example') ||
                    email.includes('@test') ||
                    email.includes('@sentry') ||
                    email.includes('@wix') ||
                    email.includes('.png') ||
                    email.includes('.jpg') ||
                    email.includes('@2x') ||
                    email.endsWith('.js') ||
                    email.endsWith('.css') ||
                    email.length > 80) {
                    emails.delete(email);
                }
            }

            if (emails.size > 0) break;
        } catch {
            // Timeout or fetch error, skip
        }
    }

    return Array.from(emails);
}

async function saveScreenshot(page, label) {
    try {
        const kvStore = await Actor.openKeyValueStore();
        const screenshot = await page.screenshot({ fullPage: true });
        await kvStore.setValue(`debug-${label}`, screenshot, { contentType: 'image/png' });
        log(`Screenshot saved: debug-${label}`);
    } catch (e) {
        log(`Screenshot failed: ${e.message}`);
    }
}
