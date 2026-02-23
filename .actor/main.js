/**
 * Apify Actor Entry Point — Google Maps Scraper
 *
 * Key optimizations:
 * - Skips proxy (always fails on Apify for Google Maps, wastes 15s)
 * - Concurrent email enrichment: HTTP fetches run in background during extraction
 * - Dedup across search terms: skips places already extracted
 * - Time-budget aware: reserves time for remaining search terms, skips reviews if tight
 * - Fast extraction: waitUntil 'commit', 2s h1 timeout, single page.evaluate
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

// Time budget tracking — Apify default timeout is 300s
const START_TIME = Date.now();
const TIMEOUT_MS = 270_000; // 270s — leave 30s buffer for cleanup
function elapsed() { return Date.now() - START_TIME; }
function remaining() { return TIMEOUT_MS - elapsed(); }
function timeOk(neededMs = 0) { return remaining() > neededMs; }

let actorFailed = false;
let chromium;

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
    try {
        await Actor.charge({ eventName: 'actor-start', count: 1 });
    } catch {}

    // --- Launch browser directly (no proxy — it always times out on Google Maps) ---
    log('Importing Playwright...');
    const pw = await import('playwright');
    chromium = pw.chromium;
    log('Playwright imported');

    const mapsUrl = 'https://www.google.com/maps/?hl=' + language;
    log('Launching browser (direct connection)...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        locale: language,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    log('Navigating to Google Maps...');
    await page.goto(mapsUrl, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    log(`Landed on: ${page.url()} (title: "${await page.title()}")`);
    log(`Startup took ${elapsed()}ms`);

    // --- Handle consent ---
    let currentUrl = page.url();
    if (currentUrl.includes('consent.google') || currentUrl.includes('consent.youtube')) {
        log('Consent page detected, handling...');
        await handleConsent(page);
        await sleep(2000);
        currentUrl = page.url();
        log(`After consent: ${currentUrl}`);
    }
    if (!currentUrl.includes('google.com/maps')) {
        log('Not on Google Maps, re-navigating...');
        await page.goto(mapsUrl, { waitUntil: 'domcontentloaded' });
        await sleep(2000);
        await handleConsent(page);
        await sleep(1000);
    }

    await saveScreenshot(page, 'step-1-initial-load');

    // --- Import utility modules ---
    const { filterByRating, filterByStatus } = await import('../src/utils.js');

    let totalResults = 0;
    const extractedUrls = new Set(); // Dedup across search terms

    // --- Process search terms ---
    for (let i = 0; i < searchTerms.length; i++) {
        if (!timeOk(30_000)) {
            log(`Time budget low (${remaining()}ms), skipping remaining search terms`);
            break;
        }

        const term = searchTerms[i];
        const fullQuery = `${term} in ${location}`;
        log(`[${i + 1}/${searchTerms.length}] Searching: "${fullQuery}"`);

        // Use the search box like a real user — direct URL navigation often
        // triggers Google's bot detection and returns very few results
        // Try multiple search box selectors
        let searchBoxUsed = false;
        for (const sel of ['#searchboxinput', 'input[name="q"]', 'input[aria-label*="Search" i]']) {
            try {
                const input = page.locator(sel).first();
                if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
                    log(`Using search box (${sel})...`);
                    await input.click();
                    await input.fill('');
                    await sleep(100);
                    // Type character by character for more human-like behavior
                    await input.fill(fullQuery);
                    await sleep(200);
                    await page.keyboard.press('Enter');
                    await sleep(4000);
                    searchBoxUsed = true;
                    break;
                }
            } catch {}
        }

        if (!searchBoxUsed) {
            log('Search box not found, using URL method...');
            const searchQuery = encodeURIComponent(fullQuery);
            const searchUrl = `https://www.google.com/maps/search/${searchQuery}/?hl=${language}`;
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
            await sleep(3000);
        }

        // Handle consent if needed
        if (page.url().includes('consent.google')) {
            await handleConsent(page);
            await sleep(1500);
            // Re-navigate to Maps and try again
            await page.goto(mapsUrl, { waitUntil: 'domcontentloaded' });
            await sleep(2000);
            const retryInput = page.locator('#searchboxinput');
            if (await retryInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await retryInput.fill(fullQuery);
                await page.keyboard.press('Enter');
                await sleep(4000);
            }
        }

        log(`Search page URL: ${page.url()}`);
        await saveScreenshot(page, `step-3-search-${i}`);

        // Detect brand-name searches that redirect straight to a single place page
        // (e.g. "Rehlko Generator" → google.com/maps/place/Rehlko+Power+Systems/...)
        let placeLinks;
        if (page.url().includes('/maps/place/') && !page.url().includes('/maps/search/')) {
            log('Search redirected to single place page — extracting directly');
            placeLinks = [page.url()];
        } else {
            // Normal search results flow
            log('Waiting for place links...');
            let hasResults = await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 15000 })
                .then(() => true)
                .catch(() => false);

            if (!hasResults) {
                log('WARNING: No place links found on search results page');
                const bodyText = await page.evaluate(() =>
                    document.body?.innerText?.substring(0, 500) || 'empty'
                );
                log(`Page text preview: ${bodyText.substring(0, 300)}`);
                await saveScreenshot(page, `step-4-no-results-${i}`);
                continue;
            }

            log('Place links found! Collecting results...');

            // Scroll and collect place links
            placeLinks = await scrollAndCollect(page, maxResults);
            log(`Collected ${placeLinks.length} place links`);

            // If we got very few results, retry with URL method as fallback
            if (placeLinks.length < 10 && timeOk(120_000)) {
                log(`Only ${placeLinks.length} results — retrying with URL-based search...`);
                const searchQuery = encodeURIComponent(fullQuery);
                const searchUrl = `https://www.google.com/maps/search/${searchQuery}/?hl=${language}`;
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
                await sleep(4000);
                await saveScreenshot(page, `step-3b-retry-${i}`);

                hasResults = await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 10000 })
                    .then(() => true).catch(() => false);
                if (hasResults) {
                    const retryLinks = await scrollAndCollect(page, maxResults);
                    log(`URL retry collected ${retryLinks.length} place links`);
                    if (retryLinks.length > placeLinks.length) {
                        placeLinks = retryLinks;
                        log(`Using URL method results (${placeLinks.length} > previous ${placeLinks.length})`);
                    }
                }
            }

            if (placeLinks.length === 0) {
                await saveScreenshot(page, `step-5-no-links-${i}`);
                continue;
            }
        }

        // Filter out places already extracted by previous search terms
        const newLinks = placeLinks.filter(url => !extractedUrls.has(url));
        const skipped = placeLinks.length - newLinks.length;
        if (skipped > 0) log(`Skipping ${skipped} already-extracted places, ${newLinks.length} new`);

        // Visit each place and extract data
        let results = [];
        const avgTimePerPlace = [];
        const emailJobs = []; // { idx, promise } — fire concurrently, resolve after loop

        // Dynamic time budget: reserve 25s per future term (realistic navigation + scroll
        // overhead per term; extraction shrinks over time due to dedup).
        // Always give the current term at least 25s so it can extract a few places.
        const remainingTerms = searchTerms.length - i - 1;
        const reserveForFuture = remainingTerms * 25_000;
        const termTimeLimit = remaining() - reserveForFuture - 5_000;
        const termDeadline = Date.now() + Math.max(termTimeLimit, 25_000);
        log(`Term budget: ${Math.round(Math.max(termTimeLimit, 25_000) / 1000)}s for extraction (${remainingTerms} terms after, ${Math.round(reserveForFuture / 1000)}s reserved)`);

        // Pre-trim to only attempt as many places as the budget can cover (~8s/place).
        // Avoids hitting the mid-loop early-exit and makes progress visible up front.
        const msForExtraction = termDeadline - Date.now();
        const maxExtractable = Math.max(Math.floor(msForExtraction / 8_000), 1);
        const newLinksTrimmed = newLinks.slice(0, maxExtractable);
        if (newLinksTrimmed.length < newLinks.length) {
            log(`Pre-trimming to ${newLinksTrimmed.length}/${newLinks.length} places (budget: ${Math.round(msForExtraction / 1000)}s)`);
        }

        for (let j = 0; j < newLinksTrimmed.length; j++) {
            if (Date.now() + 5_000 > termDeadline) {
                log(`Term time limit reached at ${j}/${newLinksTrimmed.length} (${remaining()}ms total left)`);
                break;
            }

            const placeStart = Date.now();
            try {
                await page.goto(newLinksTrimmed[j], { waitUntil: 'commit' });
                await page.waitForSelector('h1', { timeout: 3000 }).catch(() => {});

                // Extract everything from the live DOM in one evaluate call
                const data = await page.evaluate(() => {
                    const r = {};
                    // Name
                    const h1 = document.querySelector('h1');
                    r.placeName = h1?.textContent?.trim() || '';
                    // Rating
                    const ratingEl = document.querySelector('[role="img"][aria-label*="star" i]');
                    if (ratingEl) {
                        const m = (ratingEl.getAttribute('aria-label') || '').match(/([\d.]+)/);
                        if (m) r.totalReviewScore = parseFloat(m[1]);
                    }
                    // Review count
                    const reviewEls = document.querySelectorAll('[aria-label*="review" i]');
                    for (const el of reviewEls) {
                        const m = (el.getAttribute('aria-label') || '').match(/([\d,]+)\s*review/i);
                        if (m) { r.reviewCount = parseInt(m[1].replace(/,/g, '')); break; }
                    }
                    // Category
                    const catBtn = document.querySelector('button[jsaction*="category"]');
                    r.category = catBtn?.textContent?.trim() || '';
                    // Phone
                    const phoneEl = document.querySelector('[data-item-id*="phone"] .Io6YTe, [data-item-id*="phone"] .rogA2c, button[data-item-id*="phone:tel:"] .fontBodyMedium');
                    r.phoneNumber = phoneEl?.textContent?.trim() || '';
                    // Website
                    const webEl = document.querySelector('[data-item-id="authority"] a, a[data-item-id="authority"], a[aria-label*="Website" i], a[data-tooltip="Open website"]');
                    r.website = webEl?.getAttribute('href') || '';
                    if (!r.website) {
                        const allLinks = document.querySelectorAll('a[href]');
                        for (const a of allLinks) {
                            const href = a.getAttribute('href') || '';
                            if (href.startsWith('http') && !href.includes('google.') && !href.includes('gstatic.') &&
                                !href.includes('youtube.') && !href.includes('facebook.') && !href.includes('instagram.') &&
                                (a.getAttribute('data-item-id') === 'authority' || a.closest('[data-item-id="authority"]'))) {
                                r.website = href;
                                break;
                            }
                        }
                    }
                    // Address
                    const addrEl = document.querySelector('[data-item-id="address"] .Io6YTe, [data-item-id="address"] .rogA2c, button[data-item-id="address"] .fontBodyMedium');
                    r.address = { fullAddress: addrEl?.textContent?.trim() || '' };
                    // Email (rare on Maps)
                    const emailEl = document.querySelector('[data-item-id*="email"] .Io6YTe, [data-item-id*="email"] .rogA2c');
                    r.email = emailEl?.textContent?.trim() || '';
                    const mailto = document.querySelector('a[href^="mailto:"]');
                    if (mailto && !r.email) r.email = mailto.href.replace('mailto:', '').split('?')[0];
                    // Price level
                    const priceEl = document.querySelector('[aria-label*="Price" i]');
                    if (priceEl) {
                        const priceLabel = priceEl.getAttribute('aria-label') || '';
                        const priceText = priceEl.textContent?.trim() || '';
                        const dollarMatch = (priceLabel + ' ' + priceText).match(/(\${1,4})/);
                        r.priceLevel = dollarMatch ? dollarMatch[1] : priceText;
                    }
                    // Description
                    const descEl = document.querySelector('div.PYvSYb');
                    r.description = descEl?.textContent?.trim() || '';
                    // Opening hours from aria-label
                    const ohBtn = document.querySelector('[data-item-id*="oh"]');
                    if (ohBtn) {
                        let label = '';
                        let el = ohBtn;
                        for (let i = 0; i < 5 && el; i++) {
                            const al = el.getAttribute('aria-label');
                            if (al && al.includes(',') && (al.includes('AM') || al.includes('PM') || al.includes('am') || al.includes('pm') || al.includes('Open') || al.includes('Closed'))) {
                                label = al;
                                break;
                            }
                            el = el.parentElement;
                        }
                        if (label) {
                            const parts = label.split(';').map(s => s.trim()).filter(Boolean);
                            const schedule = {};
                            for (const part of parts) {
                                const commaIdx = part.indexOf(',');
                                if (commaIdx > 0) {
                                    const day = part.substring(0, commaIdx).trim();
                                    const time = part.substring(commaIdx + 1).trim();
                                    schedule[day] = time;
                                }
                            }
                            r.openingHours = Object.keys(schedule).length > 0 ? schedule : label;
                        } else {
                            const statusText = ohBtn.querySelector('.fontBodyMedium')?.textContent?.trim() || '';
                            if (statusText) r.openingHours = statusText;
                        }
                    }
                    // Plus code
                    const plusEl = document.querySelector('[data-item-id="oloc"] .Io6YTe, [data-item-id="oloc"] .rogA2c');
                    r.plusCode = plusEl?.textContent?.trim() || '';
                    // Status
                    const bodyText = document.body?.innerText || '';
                    r.permanentlyClosed = bodyText.includes('Permanently closed');
                    r.temporarilyClosed = bodyText.includes('Temporarily closed');
                    return r;
                });

                if (!data.placeName) continue;

                // Reviews — only if enough time within this term's budget
                const remainingPlaces = newLinksTrimmed.length - j - 1;
                const termTimeLeft = termDeadline - Date.now();
                const canDoReviews = scrapeReviews && reviewsLimit > 0 && termTimeLeft > (remainingPlaces * 3000 + 10_000);
                if (canDoReviews) {
                    try {
                        data.reviews = await extractReviews(page, reviewsLimit);
                    } catch (e) {
                        data.reviews = [];
                    }
                }

                // Coordinates from URL
                const coordMatch = page.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
                                   page.url().match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                if (coordMatch) {
                    data.coordinates = {
                        latitude: parseFloat(coordMatch[1]),
                        longitude: parseFloat(coordMatch[2]),
                    };
                }
                // Place ID from URL
                const placeIdMatch = page.url().match(/!1s(0x[0-9a-f]+:[0-9a-fx]+)/i) ||
                                     page.url().match(/!1s(ChIJ[A-Za-z0-9_-]+)/);
                if (placeIdMatch) {
                    data.placeId = placeIdMatch[1];
                }
                data.url = newLinksTrimmed[j];
                data.emails = data.email ? [data.email] : [];
                delete data.email;
                data.scrapedAt = new Date().toISOString();

                // Fire off email enrichment concurrently — don't await, resolve after loop
                // HTTP fetches run in background while we navigate to the next place
                if (scrapeEmails && data.website && data.emails.length === 0) {
                    emailJobs.push({
                        idx: results.length,
                        promise: scrapeEmailsFromWebsite(data.website).catch(() => [])
                    });
                }

                results.push(data);
                extractedUrls.add(newLinksTrimmed[j]);
                avgTimePerPlace.push(Date.now() - placeStart);

                if ((j + 1) % 5 === 0 || j === newLinksTrimmed.length - 1) {
                    const avgMs = Math.round(avgTimePerPlace.reduce((a, b) => a + b, 0) / avgTimePerPlace.length);
                    log(`  Extracted ${j + 1}/${newLinksTrimmed.length} places (avg ${avgMs}ms/place, ${remaining()}ms left)`);
                }
            } catch (e) {
                log(`WARNING: Failed to extract place ${j + 1}: ${e.message}`);
                avgTimePerPlace.push(Date.now() - placeStart);
            }
        }

        // Resolve concurrent email enrichment — most fetches already completed during extraction
        if (emailJobs.length > 0) {
            const emailTimeout = Math.max(Math.min(remaining() - 10_000, 15_000), 3_000);
            log(`Resolving ${emailJobs.length} email lookups (${emailTimeout}ms budget)...`);
            const settled = await Promise.race([
                Promise.allSettled(emailJobs.map(j => j.promise)),
                sleep(emailTimeout).then(() => null)
            ]);
            let emailsFound = 0;
            if (settled) {
                for (let k = 0; k < emailJobs.length; k++) {
                    if (settled[k]?.status === 'fulfilled' && settled[k].value.length > 0) {
                        results[emailJobs[k].idx].emails = settled[k].value;
                        emailsFound++;
                    }
                }
            }
            log(`  Emails: ${emailsFound}/${emailJobs.length} websites had emails`);
        }

        // Apply filters before pushing to dataset
        const preFilterCount = results.length;
        if (minRating) results = filterByRating(results, minRating);
        if (status) results = filterByStatus(results, status);
        if (results.length < preFilterCount) log(`Filters removed ${preFilterCount - results.length} places`);

        // Push filtered results to dataset (emails are now populated)
        for (const data of results) {
            await Actor.pushData(data);
            try { await Actor.charge({ eventName: 'place-scraped', count: 1 }); } catch {}
            if (data.reviews?.length > 0) {
                try { await Actor.charge({ eventName: 'review-scraped', count: data.reviews.length }); } catch {}
            }
        }

        const withWebsite = results.filter(r => r.website).length;
        const withEmails = results.filter(r => r.emails?.length > 0).length;
        log(`Search "${term}": ${results.length} places, ${withWebsite} websites, ${withEmails} emails (${elapsed()}ms total)`);
        totalResults += results.length;

        // Navigate back to Maps for the next search term
        if (i < searchTerms.length - 1 && timeOk(30_000)) {
            await page.goto(mapsUrl, { waitUntil: 'domcontentloaded' });
            await sleep(1500);
        }
    }

    // --- Process direct URLs ---
    for (const directUrl of directUrls) {
        if (!timeOk(30_000)) break;
        log(`Scraping direct URL: ${directUrl}`);
        await page.goto(directUrl, { waitUntil: 'domcontentloaded' });
        await sleep(3000);
        if (page.url().includes('consent.google')) {
            await handleConsent(page);
            await sleep(1500);
            await page.goto(directUrl, { waitUntil: 'domcontentloaded' });
            await sleep(3000);
        }
        const hasResults = await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 15000 })
            .then(() => true).catch(() => false);
        if (!hasResults) {
            log(`WARNING: No results for direct URL: ${directUrl}`);
            continue;
        }
        const placeLinks = await scrollAndCollect(page, maxResults);
        log(`Collected ${placeLinks.length} links from direct URL`);
    }

    await browser.close();
    log(`Scraping completed. Total results: ${totalResults}. Total time: ${elapsed()}ms`);

} catch (error) {
    actorFailed = true;
    logErr(`CAUGHT ERROR: ${error.message}`);
    logErr(`Stack: ${error.stack}`);
} finally {
    log(`In finally block. actorFailed=${actorFailed}`);
    if (actorFailed) {
        await Actor.fail('Actor encountered an error — check logs above');
    } else {
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
        'button[aria-label*="Accept" i]',
        '#L2AGLb',
        'form[action*="consent"] button',
    ];
    for (const selector of selectors) {
        try {
            const btn = page.locator(selector).first();
            if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
                await btn.click();
                log(`Clicked consent: ${selector}`);
                await sleep(1500);
                return true;
            }
        } catch {}
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

    // Identify the scrollable container
    const containerInfo = await page.evaluate(() => {
        const selectors = ['[role="feed"]', '.m6QErb.DxyBCb', '[role="main"] [tabindex="-1"]', '.m6QErb'];
        for (const sel of selectors) {
            const c = document.querySelector(sel);
            if (c && c.scrollHeight > c.clientHeight) {
                return { selector: sel, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight };
            }
        }
        return null;
    });
    log(`Scroll container: ${containerInfo ? `${containerInfo.selector} (${containerInfo.scrollHeight}h / ${containerInfo.clientHeight}ch)` : 'not found'}`);

    while (placeLinks.size < maxResults && scrollAttempts < 100 && timeOk(10_000)) {
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

        if (placeLinks.size === previousCount) {
            staleRounds++;
        } else {
            staleRounds = 0;
        }
        previousCount = placeLinks.size;

        // Check for end of results — but ONLY trust it after we've scrolled a few times
        // Google Maps sometimes shows end-of-list elements even with few results loaded
        if (scrollAttempts >= 3) {
            const endReached = await page.evaluate(() => {
                const endEl = document.querySelector('.HlvSq, .PbZDve, .lXJj5c');
                if (endEl) {
                    const text = endEl.textContent || '';
                    if (text.includes("You've reached the end") || text.includes("end of list")) {
                        return 'end-element: ' + text.substring(0, 100);
                    }
                }
                const feed = document.querySelector('[role="feed"]');
                if (feed && feed.lastElementChild) {
                    const text = feed.lastElementChild.textContent || '';
                    if (text.includes("You've reached the end")) return 'feed-last-child';
                }
                return '';
            });

            if (endReached) {
                log(`End of results reached (${endReached}) at ${placeLinks.size} links`);
                break;
            }
        }

        // When stale, check if the container is genuinely at its bottom
        if (staleRounds >= 2) {
            const atBottom = await page.evaluate(() => {
                const feed = document.querySelector('[role="feed"]');
                if (!feed) return false;
                // At bottom if scrollTop + clientHeight >= scrollHeight - 5 (small tolerance)
                return (feed.scrollTop + feed.clientHeight) >= (feed.scrollHeight - 5);
            });

            if (atBottom && staleRounds >= 3) {
                log(`Container at absolute bottom with ${placeLinks.size} links — no more results to load`);
                break;
            }

            if (staleRounds === 2) {
                log(`  Scroll stalling at ${placeLinks.size}, trying recovery...`);
                // Scroll last result into view
                await page.evaluate(() => {
                    const links = document.querySelectorAll('a[href*="/maps/place/"]');
                    if (links.length > 0) links[links.length - 1].scrollIntoView({ block: 'end' });
                });
                await sleep(2000);
            }

            if (staleRounds === 3) {
                // Focus feed + keyboard
                await page.evaluate(() => {
                    const feed = document.querySelector('[role="feed"]');
                    if (feed) feed.click();
                });
                for (let k = 0; k < 5; k++) {
                    await page.keyboard.press('ArrowDown').catch(() => {});
                }
                await page.keyboard.press('End').catch(() => {});
                await sleep(2000);
            }

            if (staleRounds === 4) {
                // Try "Show more" buttons
                const clicked = await page.evaluate(() => {
                    for (const btn of document.querySelectorAll('button, [role="button"]')) {
                        const text = (btn.textContent || '').toLowerCase();
                        if (text.includes('more results') || text.includes('show more')) {
                            btn.click();
                            return text.trim().substring(0, 50);
                        }
                    }
                    return '';
                });
                if (clicked) log(`  Clicked "${clicked}"`);
                await sleep(2500);
            }

            if (staleRounds >= 5) {
                log(`No new links after ${staleRounds} attempts, stopping at ${placeLinks.size}`);
                break;
            }
        } else {
            // Normal scroll
            await page.evaluate(() => {
                const selectors = ['[role="feed"]', '.m6QErb.DxyBCb', '[role="main"] [tabindex="-1"]', '.m6QErb'];
                for (const sel of selectors) {
                    const c = document.querySelector(sel);
                    if (c && c.scrollHeight > c.clientHeight) {
                        c.scrollBy(0, 2000);
                        return;
                    }
                }
                const main = document.querySelector('[role="main"]');
                if (main) {
                    for (const d of main.querySelectorAll('div')) {
                        if (d.scrollHeight > d.clientHeight + 100) { d.scrollBy(0, 2000); return; }
                    }
                }
            });

            if (scrollAttempts % 2 === 0) {
                await page.keyboard.press('End').catch(() => {});
            }
        }

        scrollAttempts++;
        // Wait longer during stale recovery
        const waitMs = staleRounds >= 3 ? 3000 : (scrollAttempts % 5 === 0 ? 2500 : 1500);
        await sleep(waitMs);

        if (scrollAttempts % 5 === 0) {
            // Log scroll container state for debugging
            const scrollState = await page.evaluate(() => {
                const feed = document.querySelector('[role="feed"]');
                if (feed) return { sh: feed.scrollHeight, st: feed.scrollTop, ch: feed.clientHeight };
                return null;
            });
            const stateStr = scrollState ? ` [feed: ${scrollState.sh}h ${scrollState.st}st ${scrollState.ch}ch]` : '';
            log(`  Scroll: ${placeLinks.size} links after ${scrollAttempts} scrolls (stale=${staleRounds})${stateStr}`);
        }
    }

    log(`Scroll complete: ${placeLinks.size} links after ${scrollAttempts} scrolls`);
    return Array.from(placeLinks);
}

/**
 * Extract individual reviews from the place page.
 * Clicks Reviews tab, scrolls briefly, extracts.
 */
async function extractReviews(page, limit) {
    // Click the Reviews tab
    const tabClicked = await page.evaluate(() => {
        const tabs = document.querySelectorAll('button[role="tab"]');
        for (const tab of tabs) {
            const label = (tab.getAttribute('aria-label') || tab.textContent || '').toLowerCase();
            if (label.includes('review')) { tab.click(); return true; }
        }
        return false;
    });
    if (!tabClicked) return [];

    // Wait just enough for reviews to load (most show 3 immediately)
    await page.waitForSelector('div[data-review-id], div.jftiEf', { timeout: 2500 }).catch(() => {});

    // One quick scroll if we need more than 3
    if (limit > 3) {
        await page.evaluate(() => {
            const c = document.querySelector('.m6QErb.DxyBCb.kA9KIf') || document.querySelector('.m6QErb.DxyBCb');
            if (c) c.scrollBy(0, 1500);
        });
        await sleep(600);
    }

    // Expand + extract in one call
    const reviews = await page.evaluate((lim) => {
        // Click "See more" buttons
        document.querySelectorAll('button[aria-label="See more"], button.w8nwRe').forEach(b => b.click());

        const reviewEls = document.querySelectorAll('div[data-review-id], div.jftiEf');
        const results = [];
        for (let i = 0; i < Math.min(reviewEls.length, lim); i++) {
            const el = reviewEls[i];
            const r = {};
            r.reviewId = el.getAttribute('data-review-id') || '';
            const authorBtn = el.querySelector('button[data-href*="/maps/contrib/"]');
            r.author = authorBtn?.textContent?.trim() || el.querySelector('.d4r55')?.textContent?.trim() || '';
            const starEl = el.querySelector('[role="img"][aria-label*="star" i]');
            if (starEl) {
                const m = (starEl.getAttribute('aria-label') || '').match(/(\d+)/);
                if (m) r.rating = parseInt(m[1]);
            }
            const textEl = el.querySelector('.wiI7pd') || el.querySelector('div[tabindex="-1"][id][lang]');
            r.text = textEl?.textContent?.trim() || '';
            const dateEl = el.querySelector('.rsqaWe');
            r.date = dateEl?.textContent?.trim() || '';
            if (r.author || r.text) results.push(r);
        }
        return results;
    }, limit);

    return reviews;
}

/**
 * Crawl a business website to find contact email addresses.
 * Uses HTTP fetch (not browser) for speed.
 */
async function scrapeEmailsFromWebsite(websiteUrl) {
    const emails = new Set();
    const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

    let baseUrl;
    try { baseUrl = new URL(websiteUrl); } catch { return []; }

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
            // Filter false positives
            for (const email of emails) {
                if (email.includes('@example') || email.includes('@test') || email.includes('@sentry') ||
                    email.includes('@wix') || email.includes('.png') || email.includes('.jpg') ||
                    email.includes('@2x') || email.endsWith('.js') || email.endsWith('.css') ||
                    email.length > 80) {
                    emails.delete(email);
                }
            }
            if (emails.size > 0) break;
        } catch {}
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
