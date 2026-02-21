import { ProxyManager } from './proxyManager.js';
import { DataExtractor } from './dataExtractor.js';
import {
  delay,
  isValidGoogleMapsUrl,
  validateSearchInput,
  filterByRating,
  filterByStatus,
} from './utils.js';

// Lazy-loaded heavy dependencies (Playwright ~60s, JSDOM ~5s on Windows)
let chromium;
let JSDOM;

/**
 * Main Google Maps scraper using Playwright
 */
export class GoogleMapsScraper {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false,
      timeout: options.timeout || 60000,
      waitForSelectorTimeout: options.waitForSelectorTimeout || 10000,
      scrollPauseTime: options.scrollPauseTime || 500,
      maxResults: options.maxResults || 120,
      useProxy: options.useProxy || false,
      proxyList: options.proxyList || [],
      language: options.language || 'en',
      reviewsLimit: options.reviewsLimit || 5,
      scrapeReviews: options.scrapeReviews !== false,
      scrapeOpeningHours: options.scrapeOpeningHours !== false,
      debug: options.debug || false,
      ...options,
    };

    this.proxyManager = new ProxyManager(this.options.proxyList);
    this.browser = null;
    this.page = null;
    this.results = [];
  }

  /**
   * Initialize browser and page
   */
  async initialize() {
    try {
      // Lazy-load heavy dependencies on first use
      if (!chromium) {
        console.log('Loading browser engine...');
        const pw = await import('playwright');
        chromium = pw.chromium;
      }
      if (!JSDOM) {
        const jsdomModule = await import('jsdom');
        JSDOM = jsdomModule.JSDOM;
      }

      const browserOptions = {
        headless: this.options.headless,
      };

      this.browser = await chromium.launch(browserOptions);

      let contextOptions = {
        viewport: { width: 1280, height: 720 },
        locale: this.options.language,
      };

      // Add proxy if enabled
      if (this.options.useProxy && this.proxyManager.enabled) {
        const proxyUrl = this.proxyManager.getNextProxy();
        const proxy = this.proxyManager.getPlaywrightProxy(proxyUrl);
        if (proxy) {
          contextOptions.proxy = proxy;
        }
      }

      const context = await this.browser.newContext(contextOptions);
      this.page = await context.newPage();

      // Set reasonable timeouts
      this.page.setDefaultTimeout(this.options.timeout);
      this.page.setDefaultNavigationTimeout(this.options.timeout);

      console.log('Browser initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize browser:', error.message);
      throw error;
    }
  }

  /**
   * Search for places and scrape results
   */
  async searchPlaces(searchTerm, location, options = {}) {
    try {
      validateSearchInput(searchTerm);

      const url = this.buildSearchUrl(searchTerm, location);
      console.log(`\nSearching for: "${searchTerm}" in "${location}"`);
      console.log(`  URL: ${url}\n`);

      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await delay(3000);

      // Accept cookies/consent if prompted (may redirect)
      await this.dismissConsentDialog();

      // After consent, we may need to navigate to the search URL again
      const postConsentUrl = this.page.url();
      console.log(`  Post-consent URL: ${postConsentUrl}`);
      if (!postConsentUrl.includes('/maps/search/') && !postConsentUrl.includes('/maps/place/')) {
        console.log('  Re-navigating to search URL after consent...');
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        await delay(3000);
        await this.dismissConsentDialog();
      }

      // Wait for results to appear
      console.log('  Waiting for place links...');
      await this.page.waitForSelector('a[href*="/maps/place/"]', {
        timeout: this.options.timeout,
      }).catch(() => {
        console.warn('  No place links found on page, results may be empty');
        console.warn(`  Current URL: ${this.page.url()}`);
      });

      // Scroll and collect result links
      const resultLinks = await this.scrollAndCollectResults(
        options.maxResults || this.options.maxResults
      );

      // Extract detailed data by visiting each place
      const places = await this.extractAllPlaceDetails(resultLinks);

      // Apply filters
      let filtered = places;
      if (options.minRating) {
        filtered = filterByRating(filtered, options.minRating);
      }
      if (options.status) {
        filtered = filterByStatus(filtered, options.status);
      }

      console.log(`\nScraped ${filtered.length} places successfully\n`);
      return filtered;
    } catch (error) {
      console.error('Search failed:', error.message);
      throw error;
    }
  }

  /**
   * Scrape a direct Google Maps URL
   */
  async scrapeUrl(mapUrl, options = {}) {
    try {
      if (!isValidGoogleMapsUrl(mapUrl)) {
        throw new Error('Invalid Google Maps URL');
      }

      console.log(`\nScraping: ${mapUrl}\n`);

      await this.page.goto(mapUrl, { waitUntil: 'domcontentloaded' });
      await delay(3000);

      await this.dismissConsentDialog();

      // After consent, re-navigate if needed
      const postConsentUrl = this.page.url();
      if (!postConsentUrl.includes('/maps/search/') && !postConsentUrl.includes('/maps/place/')) {
        console.log('  Re-navigating after consent...');
        await this.page.goto(mapUrl, { waitUntil: 'domcontentloaded' });
        await delay(3000);
        await this.dismissConsentDialog();
      }

      // Wait for results to appear
      console.log('  Waiting for place links...');
      await this.page.waitForSelector('a[href*="/maps/place/"]', {
        timeout: this.options.timeout,
      }).catch(() => {
        console.warn('  No place links found on page, results may be empty');
        console.warn(`  Current URL: ${this.page.url()}`);
      });

      const resultLinks = await this.scrollAndCollectResults(
        options.maxResults || this.options.maxResults
      );

      const places = await this.extractAllPlaceDetails(resultLinks);

      let filtered = places;
      if (options.minRating) {
        filtered = filterByRating(filtered, options.minRating);
      }
      if (options.status) {
        filtered = filterByStatus(filtered, options.status);
      }

      console.log(`\nScraped ${filtered.length} places from URL\n`);
      return filtered;
    } catch (error) {
      console.error('URL scraping failed:', error.message);
      throw error;
    }
  }

  /**
   * Build Google Maps search URL
   */
  buildSearchUrl(searchTerm, location) {
    const query = encodeURIComponent(`${searchTerm} in ${location}`);
    return `https://www.google.com/maps/search/${query}/?hl=${this.options.language}`;
  }

  /**
   * Dismiss Google consent dialog if present.
   * Handles both the overlay popup and the full-page consent.google.com redirect
   * that appears in EU regions (including Apify's datacenters).
   */
  async dismissConsentDialog() {
    try {
      const currentUrl = this.page.url();

      // Case 1: Full-page redirect to consent.google.com
      if (currentUrl.includes('consent.google.com') || currentUrl.includes('consent.youtube.com')) {
        console.log('  Consent redirect detected, accepting...');
        // Try multiple button selectors used by Google's consent page
        const selectors = [
          'button[aria-label*="Accept" i]',
          'button:has-text("Accept all")',
          'button:has-text("Reject all")',
          'button:has-text("I agree")',
          'button:has-text("Agree")',
          'button:has-text("Aceptar todo")',
          'button:has-text("Tout accepter")',
          'button:has-text("Alle akzeptieren")',
          'form[action*="consent"] button:first-of-type',
          'form[action*="consent"] input[type="submit"]',
          '#L2AGLb',           // Common consent button ID
          '[data-id="EGeslb"]', // Another consent variant
        ];

        for (const selector of selectors) {
          const btn = this.page.locator(selector).first();
          if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await btn.click();
            console.log(`  Clicked consent button: ${selector}`);
            await delay(2000);
            break;
          }
        }

        // Wait for redirect back to maps
        await this.page.waitForURL('**/google.com/maps/**', { timeout: 10000 }).catch(() => {
          console.warn('  Did not redirect back to Maps after consent');
        });
        await delay(1000);
        return;
      }

      // Case 2: Overlay consent dialog on top of Maps
      const overlaySelectors = [
        'button[aria-label*="Accept" i]',
        'button:has-text("Accept all")',
        'button:has-text("Reject all")',
        '[role="dialog"] button:first-of-type',
        '.VfPpkd-LgbsSe[data-mdc-dialog-action="accept"]',
      ];

      for (const selector of overlaySelectors) {
        const btn = this.page.locator(selector).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          await btn.click();
          console.log(`  Dismissed consent overlay: ${selector}`);
          await delay(500);
          return;
        }
      }
    } catch (e) {
      console.warn(`  Consent dialog handling error: ${e.message}`);
    }
  }

  /**
   * Scroll page to load more results and collect place links
   */
  async scrollAndCollectResults(maxResults = 120) {
    const placeLinks = new Set();
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 30;

    try {
      // Wait for results container
      await this.page.waitForSelector('[role="feed"], [role="listbox"], .m6QErb', {
        timeout: this.options.waitForSelectorTimeout,
      }).catch(() => {
        console.warn('Results container not found, attempting to collect visible results');
      });

      while (placeLinks.size < maxResults && scrollAttempts < maxScrollAttempts) {
        // Collect all place links from current view
        const links = await this.page.evaluate(() => {
          const anchors = document.querySelectorAll('a[href*="/maps/place/"]');
          return Array.from(anchors).map(a => a.href).filter(href => href.includes('/maps/place/'));
        });

        for (const link of links) {
          if (placeLinks.size >= maxResults) break;
          placeLinks.add(link);
        }

        if (placeLinks.size % 20 === 0 && placeLinks.size > 0) {
          console.log(`  Loading results... ${placeLinks.size}/${maxResults}`);
        }

        // Scroll to load more
        const newHeight = await this.page.evaluate(() => {
          const container = document.querySelector('[role="feed"], [role="listbox"], .m6QErb');
          if (container) {
            container.scrollTop = container.scrollHeight;
            return container.scrollHeight;
          }
          document.documentElement.scrollTop = document.documentElement.scrollHeight;
          return document.documentElement.scrollHeight;
        });

        // Check for "end of results" indicator
        const endReached = await this.page.evaluate(() => {
          const endEl = document.querySelector('.HlvSq, .m6QErb ~ div');
          return endEl?.textContent?.includes("You've reached the end") || false;
        });

        if (endReached || newHeight === previousHeight) {
          console.log('  Reached end of results');
          break;
        }

        previousHeight = newHeight;
        scrollAttempts++;
        await delay(this.options.scrollPauseTime);
      }

      console.log(`  Collected ${placeLinks.size} place links`);
      return Array.from(placeLinks);
    } catch (error) {
      console.error('Error during scrolling:', error.message);
      return Array.from(placeLinks);
    }
  }

  /**
   * Extract detailed information for all places by visiting each one
   */
  async extractAllPlaceDetails(placeLinks) {
    const places = [];

    for (let i = 0; i < placeLinks.length; i++) {
      try {
        const placeData = await this.extractSinglePlaceDetails(placeLinks[i]);
        if (placeData && placeData.placeName) {
          places.push(placeData);
        }

        if ((i + 1) % 5 === 0) {
          console.log(`  Extracted ${i + 1}/${placeLinks.length} details`);
        }

        // Small delay between detail loads
        await delay(300 + Math.random() * 400);
      } catch (error) {
        console.warn(`Failed to extract details for result ${i + 1}: ${error.message}`);
        continue;
      }
    }

    return places;
  }

  /**
   * Extract details for a single place by navigating to its page
   */
  async extractSinglePlaceDetails(placeUrl) {
    try {
      await this.page.goto(placeUrl, { waitUntil: 'domcontentloaded' });
      await delay(800);

      // Wait for the place name heading to load
      await this.page.waitForSelector('h1, [role="main"] h1', {
        timeout: this.options.waitForSelectorTimeout,
      }).catch(() => {});

      // Get the full page HTML and parse it with JSDOM
      const html = await this.page.content();
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Find the main content area
      const mainContent = document.querySelector('[role="main"]') || document.body;

      // Extract basic place data
      const placeData = DataExtractor.extractPlaceData(mainContent, 'https://www.google.com/maps');

      // Override URL with the one we navigated to (more reliable)
      if (placeData) {
        placeData.url = placeUrl;

        // Extract coordinates - try URL first, then page
        const coordMatch = placeUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
                          placeUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (coordMatch) {
          placeData.coordinates = {
            latitude: parseFloat(coordMatch[1]),
            longitude: parseFloat(coordMatch[2]),
          };
        }

        // Try getting coordinates from the current page URL (may have redirected)
        if (!placeData.coordinates) {
          const currentUrl = this.page.url();
          const pageCoordMatch = currentUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
                                currentUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
          if (pageCoordMatch) {
            placeData.coordinates = {
              latitude: parseFloat(pageCoordMatch[1]),
              longitude: parseFloat(pageCoordMatch[2]),
            };
          }
        }

        // Extract Place ID from URL data parameter
        const placeIdMatch = placeUrl.match(/!1s(0x[a-f0-9]+:[a-f0-9]+)/i) ||
                             placeUrl.match(/place_id[=:]([A-Za-z0-9_-]+)/);
        if (placeIdMatch) {
          placeData.placeId = placeIdMatch[1];
        }

        // Extract key fields directly from Playwright DOM (more reliable than JSDOM)
        const liveData = await this.extractLivePageData();
        if (liveData.rating && !placeData.totalReviewScore) placeData.totalReviewScore = liveData.rating;
        if (liveData.reviewCount && !placeData.reviewCount) placeData.reviewCount = liveData.reviewCount;
        if (liveData.category && !placeData.category) placeData.category = liveData.category;
        if (liveData.priceLevel && !placeData.priceLevel) placeData.priceLevel = liveData.priceLevel;
        if (liveData.phone && !placeData.phoneNumber) placeData.phoneNumber = liveData.phone;
        if (liveData.website && !placeData.website) placeData.website = liveData.website;
        if (liveData.address && !placeData.address?.fullAddress) {
          placeData.address = { ...placeData.address, fullAddress: liveData.address };
        }
      }

      // Extract opening hours via Playwright (needs interactive DOM)
      if (this.options.scrapeOpeningHours && placeData) {
        placeData.openingHours = await this.extractOpeningHours();
      }

      // Extract business description
      if (placeData) {
        placeData.description = await this.extractDescription();
      }

      // Extract review distribution
      if (placeData) {
        placeData.reviewDistribution = await this.extractReviewDistribution();
      }

      // Extract reviews
      if (this.options.scrapeReviews && placeData) {
        placeData.reviews = await this.extractReviews(this.options.reviewsLimit);
      }

      // Extract additional fields
      if (placeData) {
        const extras = await this.extractAdditionalFields();
        placeData.plusCode = extras.plusCode;
        placeData.menuLink = extras.menuLink;
        placeData.reservationLinks = extras.reservationLinks;
        placeData.amenities = extras.amenities;
        placeData.imageCount = extras.imageCount;
      }

      // Debug mode: save screenshot and HTML for selector development
      if (this.options.debug && placeData) {
        const fs = await import('fs/promises');
        const safeName = (placeData.placeName || 'unknown').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        await this.page.screenshot({ path: `output/debug_${safeName}.png`, fullPage: true }).catch(() => {});
        const pageHtml = await this.page.content();
        await fs.writeFile(`output/debug_${safeName}.html`, pageHtml, 'utf-8').catch(() => {});
        console.log(`  DEBUG: Saved screenshot and HTML for "${placeData.placeName}"`);
      }

      return placeData ? DataExtractor.normalizeData(placeData) : null;
    } catch (error) {
      console.warn(`Error extracting place details: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract key data directly from Playwright's live DOM
   */
  async extractLivePageData() {
    try {
      return await this.page.evaluate(() => {
        const result = {};

        // Rating
        const ratingEl = document.querySelector('[role="img"][aria-label*="star" i]');
        if (ratingEl) {
          const label = ratingEl.getAttribute('aria-label') || '';
          const m = label.match(/([\d.]+)/);
          if (m) result.rating = parseFloat(m[1]);
        }

        // Review count
        const reviewEls = document.querySelectorAll('[aria-label*="review" i]');
        for (const el of reviewEls) {
          const label = el.getAttribute('aria-label') || '';
          const m = label.match(/([\d,]+)\s*review/i);
          if (m) {
            result.reviewCount = parseInt(m[1].replace(/,/g, ''));
            break;
          }
        }
        // Fallback: look for review count in text near rating
        if (!result.reviewCount) {
          const buttons = document.querySelectorAll('button[aria-label]');
          for (const btn of buttons) {
            const label = btn.getAttribute('aria-label') || '';
            const m = label.match(/([\d,]+)\s*review/i);
            if (m) {
              result.reviewCount = parseInt(m[1].replace(/,/g, ''));
              break;
            }
          }
        }
        // Second fallback: parenthesized number near the rating
        if (!result.reviewCount) {
          const spans = document.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent || '';
            const m = text.match(/\(([\d,]+)\)/);
            if (m && span.closest('[role="main"]')) {
              result.reviewCount = parseInt(m[1].replace(/,/g, ''));
              break;
            }
          }
        }

        // Category - look for the category button near the title
        const categoryButton = document.querySelector('button[jsaction*="category"]');
        if (categoryButton) {
          result.category = categoryButton.textContent.trim();
        }

        // Price level
        const allText = document.body.textContent || '';
        const priceMatch = allText.match(/·\s*(\${1,4})\s*·/);
        if (priceMatch) {
          result.priceLevel = priceMatch[1].length;
        }

        // Phone from data-item-id
        const phoneEl = document.querySelector('[data-item-id*="phone"]');
        if (phoneEl) {
          const textEl = phoneEl.querySelector('.Io6YTe, .rogA2c');
          result.phone = textEl?.textContent?.trim() || '';
        }

        // Website from data-item-id
        const websiteEl = document.querySelector('[data-item-id="authority"]');
        if (websiteEl) {
          const link = websiteEl.querySelector('a');
          result.website = link?.getAttribute('href') || '';
        }

        // Address from data-item-id
        const addrEl = document.querySelector('[data-item-id="address"]');
        if (addrEl) {
          const textEl = addrEl.querySelector('.Io6YTe, .rogA2c');
          result.address = textEl?.textContent?.trim() || '';
        }

        return result;
      });
    } catch {
      return {};
    }
  }

  /**
   * Extract opening hours from the place detail page
   */
  async extractOpeningHours() {
    try {
      // Try clicking on the hours row to expand the full schedule
      const hoursRow = this.page.locator('[data-item-id="oh"], [aria-label*="hours" i]').first();
      if (await hoursRow.isVisible({ timeout: 1500 }).catch(() => false)) {
        // The hours row itself might need a click to expand the table
        const expandImg = hoursRow.locator('img[aria-label], svg, [data-icon]').first();
        if (await expandImg.isVisible({ timeout: 500 }).catch(() => false)) {
          await expandImg.click();
        } else {
          await hoursRow.click();
        }
        await delay(800);
      }

      const hours = await this.page.evaluate(() => {
        const result = {};

        // Method 1: Look for the expanded hours table
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td, th');
            if (cells.length >= 2) {
              const day = cells[0].textContent.trim();
              const time = cells[cells.length - 1].textContent.trim();
              const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
              if (dayNames.some(d => day.includes(d)) && time) {
                result[day] = time;
              }
            }
          }
        }

        // Method 2: Look for aria-label patterns on the hours element
        if (Object.keys(result).length === 0) {
          const hoursEl = document.querySelector('[data-item-id="oh"]');
          if (hoursEl) {
            const ariaLabel = hoursEl.getAttribute('aria-label') || '';
            // Parse "Monday, 10 AM to 10 PM; Tuesday, 10 AM to 10 PM; ..."
            const parts = ariaLabel.split(/[;.]/);
            for (const part of parts) {
              const m = part.trim().match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,:]?\s*(.+)/i);
              if (m) {
                result[m[1]] = m[2].trim().replace(/\.\s*$/, '');
              }
            }
          }
        }

        // Method 3: aria-label on individual elements
        if (Object.keys(result).length === 0) {
          const allElements = document.querySelectorAll('[aria-label]');
          for (const el of allElements) {
            const label = el.getAttribute('aria-label') || '';
            const dayMatch = label.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,;]\s*(.+)/i);
            if (dayMatch) {
              result[dayMatch[1]] = dayMatch[2].trim();
            }
          }
        }

        return Object.keys(result).length > 0 ? result : null;
      });

      // Close the popup if we opened one
      await this.page.keyboard.press('Escape').catch(() => {});
      await delay(200);

      return hours;
    } catch {
      return null;
    }
  }

  /**
   * Extract business description/about text
   */
  async extractDescription() {
    try {
      const description = await this.page.evaluate(() => {
        // Look for the "About" or description section
        const aboutSection = document.querySelector('[aria-label*="About" i]');
        if (aboutSection) {
          return aboutSection.textContent.trim();
        }

        // Try editorial summary
        const editorial = document.querySelector('.PYvSYb, .WeS02d');
        if (editorial) {
          return editorial.textContent.trim();
        }

        // Try the overview/description div
        const descEl = document.querySelector('[data-attrid="description"], .HlvSq');
        if (descEl) {
          return descEl.textContent.trim();
        }

        return '';
      });

      return description || '';
    } catch {
      return '';
    }
  }

  /**
   * Extract review star distribution (e.g., 5 stars: 60%, 4 stars: 20%, etc.)
   */
  async extractReviewDistribution() {
    try {
      const distribution = await this.page.evaluate(() => {
        const result = {};

        // Look for review distribution bars
        const rows = document.querySelectorAll('tr.BHOKXe, .ExlQGd');
        rows.forEach(row => {
          const starsEl = row.querySelector('td.yxmtmf, .RfDO5c');
          const countEl = row.querySelector('td:last-child, .NkEv2e');
          const barEl = row.querySelector('[style*="width"], .CIQp2');

          const stars = starsEl?.textContent?.trim();
          const count = countEl?.textContent?.trim();

          if (stars) {
            const starNum = parseInt(stars);
            if (starNum >= 1 && starNum <= 5) {
              result[`${starNum}_star`] = {
                count: count ? parseInt(count.replace(/[,.\s]/g, '')) || 0 : 0,
              };

              // Try to get percentage from bar width
              if (barEl) {
                const style = barEl.getAttribute('style') || '';
                const widthMatch = style.match(/width:\s*(\d+)/);
                if (widthMatch) {
                  result[`${starNum}_star`].percentage = parseInt(widthMatch[1]);
                }
              }
            }
          }
        });

        // Fallback: aria-label pattern
        if (Object.keys(result).length === 0) {
          const allElements = document.querySelectorAll('[aria-label]');
          for (const el of allElements) {
            const label = el.getAttribute('aria-label') || '';
            const match = label.match(/(\d)\s*stars?,?\s*(\d+(?:,\d+)*)\s*review/i);
            if (match) {
              result[`${match[1]}_star`] = {
                count: parseInt(match[2].replace(/,/g, '')),
              };
            }
          }
        }

        return Object.keys(result).length > 0 ? result : null;
      });

      return distribution;
    } catch {
      return null;
    }
  }

  /**
   * Extract individual reviews from the place page
   */
  async extractReviews(limit = 5) {
    try {
      // Try clicking on the reviews tab/button
      const reviewsTab = this.page.locator('button[aria-label*="review" i], [data-tab-index="1"]');
      if (await reviewsTab.first().isVisible({ timeout: 1500 }).catch(() => false)) {
        await reviewsTab.first().click();
        await delay(1000);

        // Scroll the reviews pane to load more
        await this.page.evaluate(() => {
          const reviewPane = document.querySelector('.m6QErb.DxyBCb, .DUwDvf');
          if (reviewPane) {
            reviewPane.scrollTop = reviewPane.scrollHeight;
          }
        });
        await delay(500);
      }

      const reviews = await this.page.evaluate((maxReviews) => {
        const reviewElements = document.querySelectorAll('[data-review-id], .jftiEf');
        const results = [];

        for (let i = 0; i < Math.min(reviewElements.length, maxReviews); i++) {
          const el = reviewElements[i];

          // Author name
          const authorEl = el.querySelector('.d4r55, .WNxzHc a, [class*="author"]');
          const author = authorEl?.textContent?.trim() || 'Anonymous';

          // Author profile link
          const authorLink = el.querySelector('a[href*="/contrib/"]')?.getAttribute('href') || '';

          // Rating
          const ratingEl = el.querySelector('[role="img"][aria-label*="star" i], .kvMYJc');
          const ratingLabel = ratingEl?.getAttribute('aria-label') || '';
          const ratingMatch = ratingLabel.match(/(\d)/);
          const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;

          // Review text
          const textEl = el.querySelector('.wiI7pd, .MyEned, [class*="review-text"]');
          const text = textEl?.textContent?.trim() || '';

          // Date/time
          const dateEl = el.querySelector('.rsqaWe, .DU9Pgb, [class*="publish-date"]');
          const publishedDate = dateEl?.textContent?.trim() || '';

          // Like count
          const likeEl = el.querySelector('[aria-label*="helpful" i], .pkWtMe');
          const likes = likeEl?.textContent?.trim() || '0';

          // Review ID
          const reviewId = el.getAttribute('data-review-id') || '';

          if (author || text) {
            results.push({
              reviewId,
              author,
              authorLink,
              rating,
              text,
              publishedDate,
              likesCount: parseInt(likes) || 0,
            });
          }
        }

        return results;
      }, limit);

      // Navigate back to the overview tab
      const overviewTab = this.page.locator('button[aria-label*="Overview" i], [data-tab-index="0"]');
      if (await overviewTab.first().isVisible({ timeout: 500 }).catch(() => false)) {
        await overviewTab.first().click();
        await delay(300);
      }

      return reviews.length > 0 ? reviews : [];
    } catch {
      return [];
    }
  }

  /**
   * Extract additional fields (plus code, menu, reservations, amenities, images)
   */
  async extractAdditionalFields() {
    try {
      return await this.page.evaluate(() => {
        const result = {
          plusCode: '',
          menuLink: '',
          reservationLinks: [],
          amenities: {},
          imageCount: 0,
        };

        // Plus code
        const allButtons = document.querySelectorAll('[data-item-id]');
        for (const btn of allButtons) {
          const itemId = btn.getAttribute('data-item-id') || '';
          const text = btn.textContent.trim();

          if (itemId === 'oloc') {
            result.plusCode = text;
          }
        }

        // Menu link
        const menuLink = document.querySelector('a[href*="menu"], a[aria-label*="menu" i]');
        if (menuLink) {
          result.menuLink = menuLink.getAttribute('href') || '';
        }

        // Reservation links
        const reservationLinks = document.querySelectorAll('a[href*="reserv"], a[href*="book"], a[aria-label*="reserv" i]');
        reservationLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (href) {
            result.reservationLinks.push({
              url: href,
              provider: link.textContent.trim(),
            });
          }
        });

        // Amenities/attributes
        const amenityElements = document.querySelectorAll('.LTs0Rc, [data-item-id*="attr"]');
        amenityElements.forEach(el => {
          const label = el.getAttribute('aria-label') || el.textContent.trim();
          if (label) {
            // Check for checkmark (has amenity) vs X (doesn't have)
            const hasIt = !el.querySelector('[aria-label*="No" i], .WJx5i') &&
                          !label.toLowerCase().startsWith('no ');
            result.amenities[label] = hasIt;
          }
        });

        // Image count
        const imageButton = document.querySelector('button[aria-label*="photo" i]');
        if (imageButton) {
          const label = imageButton.getAttribute('aria-label') || '';
          const countMatch = label.match(/(\d+(?:,\d+)*)/);
          if (countMatch) {
            result.imageCount = parseInt(countMatch[1].replace(/,/g, ''));
          }
        }

        return result;
      });
    } catch {
      return {
        plusCode: '',
        menuLink: '',
        reservationLinks: [],
        amenities: {},
        imageCount: 0,
      };
    }
  }

  /**
   * Batch search multiple terms
   */
  async batchSearch(searchTerms, location, options = {}) {
    const allResults = [];

    for (let i = 0; i < searchTerms.length; i++) {
      const term = searchTerms[i];
      try {
        console.log(`\n[${i + 1}/${searchTerms.length}] Processing: "${term}"`);
        const results = await this.searchPlaces(term, location, options);
        allResults.push(...results);

        // Add delay between searches to avoid rate limiting
        if (i < searchTerms.length - 1) {
          await delay(2000 + Math.random() * 1000);
        }
      } catch (error) {
        console.error(`Error searching for "${term}":`, error.message);
      }
    }

    return allResults;
  }

  /**
   * Close browser
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log('Browser closed');
      }
    } catch (error) {
      console.error('Error closing browser:', error.message);
    }
  }

  /**
   * Get results
   */
  getResults() {
    return this.results;
  }

  /**
   * Clear results
   */
  clearResults() {
    this.results = [];
  }
}

export default GoogleMapsScraper;
