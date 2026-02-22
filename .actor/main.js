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

    // JSDOM no longer needed — extracting directly from live browser DOM

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
        // Use 15s timeout for the connectivity test
        await p.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
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

    // --- Import utility modules ---
    log('Importing utils...');
    const { filterByRating, filterByStatus } = await import('../src/utils.js');
    log('Utils imported');

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

        // Visit each place and extract ALL data via page.evaluate (no JSDOM)
        let results = [];
        const emailQueue = [];

        for (let j = 0; j < placeLinks.length; j++) {
            try {
                await page.goto(placeLinks[j], { waitUntil: 'commit' });
                // Wait for the place name heading to appear
                await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});

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
                    const phoneEl = document.querySelector('[data-item-id*="phone"] .Io6YTe, [data-item-id*="phone"] .rogA2c');
                    r.phoneNumber = phoneEl?.textContent?.trim() || '';
                    // Website
                    const webEl = document.querySelector('[data-item-id="authority"] a');
                    r.website = webEl?.getAttribute('href') || '';
                    // Address
                    const addrEl = document.querySelector('[data-item-id="address"] .Io6YTe, [data-item-id="address"] .rogA2c');
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
                        // Walk up to find aria-label with schedule
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
                            // Fallback: get current status text
                            const statusText = ohBtn.querySelector('.fontBodyMedium')?.textContent?.trim() || '';
                            if (statusText) r.openingHours = statusText;
                        }
                    }
                    // Plus code
                    const plusEl = document.querySelector('[data-item-id="oloc"] .Io6YTe, [data-item-id="oloc"] .rogA2c');
                    r.plusCode = plusEl?.textContent?.trim() || '';
                    // Service options (dine-in, takeout, delivery)
                    const serviceEls = document.querySelectorAll('div.LTs0Rc');
                    if (serviceEls.length > 0) {
                        r.serviceOptions = {};
                        serviceEls.forEach(el => {
                            const label = el.getAttribute('aria-label') || el.textContent?.trim() || '';
                            if (label) {
                                // Check for check/cross icon
                                const hasCheck = el.querySelector('[aria-label*="has" i], .google-symbols');
                                r.serviceOptions[label] = !!hasCheck;
                            }
                        });
                    }
                    // Status
                    const bodyText = document.body?.innerText || '';
                    r.permanentlyClosed = bodyText.includes('Permanently closed');
                    r.temporarilyClosed = bodyText.includes('Temporarily closed');
                    return r;
                });

                if (!data.placeName) continue;

                // Extract opening hours by clicking the hours section if we only got status text
                if (scrapeOpeningHours && data.openingHours && typeof data.openingHours === 'string') {
                    try {
                        // Click the hours button to expand the full schedule
                        await page.click('[data-item-id*="oh"]').catch(() => {});
                        await sleep(1000);
                        const fullHours = await page.evaluate(() => {
                            // After clicking, look for the expanded hours table
                            const rows = document.querySelectorAll('table.eK4R0e tr, table.WgFkxc tr, .lo7U087hsMA__row');
                            if (rows.length > 0) {
                                const schedule = {};
                                rows.forEach(row => {
                                    const cells = row.querySelectorAll('td, .lo7U087hsMA__cell');
                                    if (cells.length >= 2) {
                                        schedule[cells[0].textContent.trim()] = cells[1].textContent.trim();
                                    }
                                });
                                return Object.keys(schedule).length > 0 ? schedule : null;
                            }
                            // Try aria-label on any newly-expanded element
                            const expanded = document.querySelector('[data-item-id*="oh"] [aria-label*=","]');
                            return expanded?.getAttribute('aria-label') || null;
                        });
                        if (fullHours) data.openingHours = fullHours;
                    } catch {}
                }

                // Extract reviews if requested
                if (scrapeReviews && reviewsLimit > 0) {
                    try {
                        data.reviews = await extractReviews(page, reviewsLimit);
                    } catch (e) {
                        log(`  Review extraction failed for place ${j + 1}: ${e.message}`);
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
                const placeIdMatch = page.url().match(/place_id[=:]([A-Za-z0-9_-]+)/) ||
                                     page.url().match(/!1s(0x[0-9a-f]+:[0-9a-fx]+)/i) ||
                                     page.url().match(/!1s(ChIJ[A-Za-z0-9_-]+)/);
                if (placeIdMatch) {
                    data.placeId = placeIdMatch[1];
                }
                data.url = placeLinks[j];
                data.emails = data.email ? [data.email] : [];
                delete data.email;
                data.scrapedAt = new Date().toISOString();

                results.push(data);

                if (scrapeEmails && data.website && data.emails.length === 0) {
                    emailQueue.push({ index: results.length - 1, website: data.website });
                }

                if ((j + 1) % 10 === 0) {
                    log(`  Extracted ${j + 1}/${placeLinks.length} places`);
                }
            } catch (e) {
                log(`WARNING: Failed to extract place ${j + 1}: ${e.message}`);
            }
        }

        // --- Email enrichment (uses fetch, not browser — much faster) ---
        const withWebsite = results.filter(r => r.website).length;
        const withMapEmail = results.filter(r => r.emails?.length > 0).length;
        log(`Email enrichment: scrapeEmails=${scrapeEmails}, ${withWebsite} places have websites, ${withMapEmail} already have emails from Maps`);
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

    // First, identify the scrollable container
    const containerInfo = await page.evaluate(() => {
        const selectors = [
            '[role="feed"]',
            '.m6QErb.DxyBCb',
            '[role="main"] [tabindex="-1"]',
            '.m6QErb',
        ];
        for (const sel of selectors) {
            const c = document.querySelector(sel);
            if (c && c.scrollHeight > c.clientHeight) {
                return { selector: sel, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight };
            }
        }
        return null;
    });
    log(`Scroll container: ${containerInfo ? `${containerInfo.selector} (${containerInfo.scrollHeight}h / ${containerInfo.clientHeight}ch)` : 'not found — will try all'}`);

    while (placeLinks.size < maxResults && scrollAttempts < 80) {
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

        // Check for "end of results" indicator — must be in the results panel, not whole page
        const endReached = await page.evaluate(() => {
            // Look for the specific end-of-list element Google Maps uses
            const endEl = document.querySelector('.HlvSq, .PbZDve, .lXJj5c');
            if (endEl) {
                const text = endEl.textContent || '';
                if (text.includes("You've reached the end") || text.includes("end of list")) {
                    return 'end-element';
                }
            }
            // Also check the last child of the results feed
            const feed = document.querySelector('[role="feed"]');
            if (feed && feed.lastElementChild) {
                const text = feed.lastElementChild.textContent || '';
                if (text.includes("You've reached the end")) {
                    return 'feed-last-child';
                }
            }
            // Check if there's a "No results" type message
            const noResults = document.querySelector('.Q2vNVc, .section-no-result-title');
            if (noResults) return 'no-results';
            return '';
        });

        if (endReached) {
            log(`End of results reached (${endReached}) at ${placeLinks.size} links`);
            break;
        }

        // Give up after 8 rounds with no new links (was 5, more patient now)
        if (staleRounds >= 8) {
            log(`No new links after ${staleRounds} scroll attempts, stopping at ${placeLinks.size}`);
            // Take screenshot for debugging
            await saveScreenshot(page, `scroll-stale-${placeLinks.size}`).catch(() => {});
            break;
        }

        // Scroll the results panel
        await page.evaluate(() => {
            const selectors = [
                '[role="feed"]',
                '.m6QErb.DxyBCb',
                '[role="main"] [tabindex="-1"]',
                '.m6QErb',
                '[role="main"] div[aria-label]',
            ];
            let scrolled = false;
            for (const sel of selectors) {
                const c = document.querySelector(sel);
                if (c && c.scrollHeight > c.clientHeight) {
                    c.scrollBy(0, 2000);
                    scrolled = true;
                    break;
                }
            }
            if (!scrolled) {
                // Fallback: scroll the first scrollable div inside role="main"
                const main = document.querySelector('[role="main"]');
                if (main) {
                    const divs = main.querySelectorAll('div');
                    for (const d of divs) {
                        if (d.scrollHeight > d.clientHeight + 100) {
                            d.scrollBy(0, 2000);
                            break;
                        }
                    }
                }
            }
        });

        // Use keyboard End press more frequently as backup
        if (scrollAttempts % 2 === 0) {
            await page.keyboard.press('End').catch(() => {});
        }

        scrollAttempts++;
        // Wait for lazy-load (longer wait every few scrolls to let slow connections catch up)
        await sleep(scrollAttempts % 5 === 0 ? 2500 : 1500);

        if (scrollAttempts % 5 === 0) {
            log(`  Scroll progress: ${placeLinks.size} links after ${scrollAttempts} scrolls (stale=${staleRounds})`);
        }
    }

    log(`Scroll complete: ${placeLinks.size} links after ${scrollAttempts} scrolls`);
    return Array.from(placeLinks);
}

/**
 * Extract individual reviews from the place page.
 * Clicks the Reviews tab, scrolls to load, then extracts each review.
 */
async function extractReviews(page, limit) {
    // Click the Reviews tab
    const tabClicked = await page.evaluate(() => {
        const tabs = document.querySelectorAll('button[role="tab"]');
        for (const tab of tabs) {
            const label = (tab.getAttribute('aria-label') || tab.textContent || '').toLowerCase();
            if (label.includes('review')) {
                tab.click();
                return true;
            }
        }
        // Also try clicking the review count link
        const reviewLink = document.querySelector('[jsaction*="review"]');
        if (reviewLink) { reviewLink.click(); return true; }
        return false;
    });

    if (!tabClicked) return [];

    // Wait for reviews to load
    await sleep(2000);
    await page.waitForSelector('div[data-review-id], div.jftiEf', { timeout: 5000 }).catch(() => {});

    // Scroll the reviews panel to load more
    const scrollRounds = Math.min(Math.ceil(limit / 3), 15);
    for (let s = 0; s < scrollRounds; s++) {
        const count = await page.$$eval('div[data-review-id], div.jftiEf', els => els.length);
        if (count >= limit) break;

        await page.evaluate(() => {
            const containers = [
                document.querySelector('.m6QErb.DxyBCb.kA9KIf'),
                document.querySelector('.m6QErb.DxyBCb'),
                document.querySelector('[role="main"] [tabindex="-1"]'),
            ];
            for (const c of containers) {
                if (c && c.scrollHeight > c.clientHeight) {
                    c.scrollBy(0, 800);
                    return;
                }
            }
        });
        await sleep(1200);
    }

    // Click all "See more" / "More" buttons to expand truncated reviews
    await page.$$eval('button[aria-label="See more"], button.w8nwRe', btns => {
        btns.slice(0, 20).forEach(b => b.click());
    }).catch(() => {});
    await sleep(500);

    // Extract the reviews
    const reviews = await page.evaluate((lim) => {
        const reviewEls = document.querySelectorAll('div[data-review-id], div.jftiEf');
        const results = [];
        for (let i = 0; i < Math.min(reviewEls.length, lim); i++) {
            const el = reviewEls[i];
            const r = {};
            r.reviewId = el.getAttribute('data-review-id') || '';

            // Author
            const authorBtn = el.querySelector('button[data-href*="/maps/contrib/"]');
            r.author = authorBtn?.textContent?.trim() || el.querySelector('.d4r55')?.textContent?.trim() || '';

            // Rating
            const starEl = el.querySelector('[role="img"][aria-label*="star" i]');
            if (starEl) {
                const m = (starEl.getAttribute('aria-label') || '').match(/(\d+)/);
                if (m) r.rating = parseInt(m[1]);
            }

            // Review text
            const textEl = el.querySelector('.wiI7pd') || el.querySelector('div[tabindex="-1"][id][lang]') || el.querySelector('.MyEned span');
            r.text = textEl?.textContent?.trim() || '';

            // Date
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
