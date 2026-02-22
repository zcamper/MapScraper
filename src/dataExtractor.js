import { getCurrentTimestamp, safeTextContent, extractNumber } from './utils.js';

/**
 * Extracts and formats data from Google Maps search results
 */
export class DataExtractor {
  /**
   * Extract place information from a place element (JSDOM document fragment)
   */
  static extractPlaceData(element, baseUrl = 'https://www.google.com/maps') {
    try {
      const name = this.extractPlaceName(element);
      const url = this.extractPlaceUrl(element, baseUrl);
      const address = this.extractAddress(element);
      const phone = this.extractPhoneNumber(element);
      const website = this.extractWebsite(element);
      const rating = this.extractRating(element);
      const reviewCount = this.extractReviewCount(element);
      const priceLevel = this.extractPriceLevel(element);
      const category = this.extractCategory(element);
      const coordinates = this.extractCoordinates(element);
      const permanentlyClosed = this.checkPermanentlyClosed(element);
      const temporarilyClosed = this.checkTemporarilyClosed(element);
      const canBeClaimed = this.checkCanBeClaimed(element);

      return {
        placeName: name,
        url,
        priceLevel,
        category,
        countryCode: this.extractCountryCode(address),
        phoneNumber: phone,
        address: {
          neighborhood: address.neighborhood || '',
          street: address.street || '',
          city: address.city || '',
          postalCode: address.postalCode || '',
          state: address.state || '',
          fullAddress: address.fullAddress || '',
        },
        website,
        canBeClaimed,
        coordinates,
        permanentlyClosed,
        temporarilyClosed,
        totalReviewScore: rating,
        reviewCount,
        placeId: this.extractPlaceId(url),
        scrapedAt: getCurrentTimestamp(),
        // New fields - populated by scraper after basic extraction
        description: '',
        openingHours: null,
        reviewDistribution: null,
        reviews: [],
        plusCode: '',
        menuLink: '',
        reservationLinks: [],
        amenities: {},
        imageCount: 0,
      };
    } catch (error) {
      console.error('Error extracting place data:', error.message);
      return null;
    }
  }

  /**
   * Extract place name
   */
  static extractPlaceName(element) {
    const nameElement = element.querySelector('h1') ||
                       element.querySelector('h2') ||
                       element.querySelector('[role="heading"]');
    return safeTextContent(nameElement);
  }

  /**
   * Extract place URL
   */
  static extractPlaceUrl(element, baseUrl) {
    const link = element.querySelector('a[href*="/maps/place/"]');
    if (link) {
      const href = link.getAttribute('href');
      if (href.startsWith('http')) return href;
      return baseUrl + href;
    }
    return '';
  }

  /**
   * Extract rating (star score)
   */
  static extractRating(element) {
    // Try aria-label patterns
    const ratingElement = element.querySelector('[role="img"][aria-label*="star" i]') ||
                         element.querySelector('[aria-label*="rating" i]');
    if (ratingElement) {
      const ariaLabel = ratingElement.getAttribute('aria-label');
      const match = ariaLabel?.match(/([\d.]+)\s*star/i) || ariaLabel?.match(/[\d.]+/);
      return match ? parseFloat(match[1] || match[0]) : null;
    }

    // Try text-based extraction
    const allText = element.textContent || '';
    const ratingMatch = allText.match(/([\d.]+)\s*(?:star|out of)/i);
    return ratingMatch ? parseFloat(ratingMatch[1]) : null;
  }

  /**
   * Extract review count
   */
  static extractReviewCount(element) {
    const reviewElement = element.querySelector('[aria-label*="review" i]');
    if (reviewElement) {
      const ariaLabel = reviewElement.getAttribute('aria-label') || '';
      const match = ariaLabel.match(/([\d,]+)\s*review/i);
      if (match) return parseInt(match[1].replace(/,/g, ''));

      const text = safeTextContent(reviewElement);
      const textMatch = text.match(/\d+(?:,\d+)*/);
      return textMatch ? parseInt(textMatch[0].replace(/,/g, '')) : null;
    }
    return null;
  }

  /**
   * Extract price level ($ to $$$$)
   */
  static extractPriceLevel(element) {
    // Look for price indicator in various selectors
    const allElements = element.querySelectorAll('[aria-label]');
    for (const el of allElements) {
      const label = el.getAttribute('aria-label') || '';
      const priceMatch = label.match(/price[:\s]*(\$+)/i) || label.match(/(\$+)/);
      if (priceMatch) {
        const count = (priceMatch[1].match(/\$/g) || []).length;
        if (count > 0 && count <= 4) return count;
      }
    }

    // Fallback: look for dollar signs in text
    const text = element.textContent || '';
    const dollarMatch = text.match(/·\s*(\$+)\s*·/);
    if (dollarMatch) {
      return (dollarMatch[1].match(/\$/g) || []).length;
    }

    return null;
  }

  /**
   * Extract category
   */
  static extractCategory(element) {
    // Try button with category info
    const categoryButton = element.querySelector('button[jsaction*="category"]');
    if (categoryButton) return safeTextContent(categoryButton);

    // Try aria-label pattern
    const catEl = element.querySelector('[aria-label*="category" i]');
    if (catEl) return safeTextContent(catEl);

    // Try common class patterns for category text
    const spans = element.querySelectorAll('span, button');
    for (const span of spans) {
      const text = safeTextContent(span);
      if (text && text.length < 40 && text.length > 2 && /^[A-Z]/.test(text) && !text.includes('http')) {
        const parent = span.parentElement;
        if (parent?.textContent?.includes('·')) {
          return text;
        }
      }
    }

    return '';
  }

  /**
   * Extract address details
   */
  static extractAddress(element) {
    const addressEl = element.querySelector('[data-item-id="address"] .Io6YTe') ||
                     element.querySelector('[aria-label*="address" i]') ||
                     element.querySelector('[aria-label*="Address" i]');

    if (!addressEl) {
      return { fullAddress: '' };
    }

    const fullAddress = safeTextContent(addressEl);
    const parts = fullAddress.split(',').map(p => p.trim());

    return {
      fullAddress,
      street: parts[0] || '',
      neighborhood: parts.length > 3 ? parts[1] : '',
      city: parts[parts.length - 3] || parts[1] || '',
      state: parts[parts.length - 2] || '',
      postalCode: parts[parts.length - 1] || '',
    };
  }

  /**
   * Extract phone number
   */
  static extractPhoneNumber(element) {
    const phoneEl = element.querySelector('[data-item-id*="phone"] .Io6YTe') ||
                   element.querySelector('[aria-label*="phone" i]') ||
                   element.querySelector('a[href^="tel:"]');

    if (phoneEl) {
      const href = phoneEl.getAttribute('href');
      if (href?.startsWith('tel:')) {
        return href.substring(4);
      }
      return safeTextContent(phoneEl);
    }
    return '';
  }

  /**
   * Extract website
   */
  static extractWebsite(element) {
    const websiteEl = element.querySelector('[data-item-id="authority"] a') ||
                     element.querySelector('[aria-label*="website" i]') ||
                     element.querySelector('[aria-label*="Website" i]');

    if (websiteEl) {
      const href = websiteEl.getAttribute('href');
      if (href?.startsWith('http')) {
        return href;
      }
      return safeTextContent(websiteEl);
    }
    return '';
  }

  /**
   * Extract coordinates from URL or element
   */
  static extractCoordinates(element) {
    const url = this.extractPlaceUrl(element);

    const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      return {
        latitude: parseFloat(coordMatch[1]),
        longitude: parseFloat(coordMatch[2]),
      };
    }

    return null;
  }

  /**
   * Extract Place ID from URL
   */
  static extractPlaceId(url) {
    if (!url) return '';

    // Try ChIJ format place ID
    const chijMatch = url.match(/(ChIJ[A-Za-z0-9_-]+)/);
    if (chijMatch) return chijMatch[1];

    // Try hex format
    const hexMatch = url.match(/!1s(0x[a-f0-9]+:[a-f0-9]+)/i);
    if (hexMatch) return hexMatch[1];

    // Try place_id parameter
    const paramMatch = url.match(/place_id[=:]([A-Za-z0-9_-]+)/);
    if (paramMatch) return paramMatch[1];

    return '';
  }

  /**
   * Extract country code from address
   */
  static extractCountryCode(address) {
    const countryMap = {
      'United States': 'US', 'USA': 'US', 'U.S.A.': 'US', 'U.S.': 'US',
      'Canada': 'CA',
      'United Kingdom': 'GB', 'UK': 'GB', 'England': 'GB', 'Scotland': 'GB', 'Wales': 'GB',
      'Australia': 'AU',
      'Germany': 'DE', 'Deutschland': 'DE',
      'France': 'FR',
      'Mexico': 'MX', 'México': 'MX',
      'Brazil': 'BR', 'Brasil': 'BR',
      'India': 'IN',
      'China': 'CN',
      'Japan': 'JP',
      'South Korea': 'KR', 'Korea': 'KR',
      'Italy': 'IT', 'Italia': 'IT',
      'Spain': 'ES', 'España': 'ES',
      'Netherlands': 'NL',
      'Russia': 'RU',
      'Turkey': 'TR', 'Türkiye': 'TR',
      'Thailand': 'TH',
      'Indonesia': 'ID',
      'Philippines': 'PH',
      'Vietnam': 'VN',
      'Poland': 'PL',
      'Sweden': 'SE',
      'Norway': 'NO',
      'Denmark': 'DK',
      'Finland': 'FI',
      'Switzerland': 'CH',
      'Austria': 'AT',
      'Belgium': 'BE',
      'Portugal': 'PT',
      'Ireland': 'IE',
      'New Zealand': 'NZ',
      'Singapore': 'SG',
      'Malaysia': 'MY',
      'Argentina': 'AR',
      'Colombia': 'CO',
      'Chile': 'CL',
      'Peru': 'PE',
      'Egypt': 'EG',
      'South Africa': 'ZA',
      'Nigeria': 'NG',
      'Israel': 'IL',
      'United Arab Emirates': 'AE', 'UAE': 'AE',
      'Saudi Arabia': 'SA',
      'Taiwan': 'TW',
      'Hong Kong': 'HK',
      'Czech Republic': 'CZ', 'Czechia': 'CZ',
      'Romania': 'RO',
      'Greece': 'GR',
      'Hungary': 'HU',
      'Ukraine': 'UA',
      'Pakistan': 'PK',
      'Bangladesh': 'BD',
    };

    const fullAddr = address.fullAddress || '';
    const lastPart = fullAddr.split(',').pop()?.trim() || '';

    if (countryMap[lastPart]) return countryMap[lastPart];

    for (const [country, code] of Object.entries(countryMap)) {
      if (lastPart.includes(country) || fullAddr.includes(country)) {
        return code;
      }
    }

    return '';
  }

  /**
   * Check if permanently closed
   */
  static checkPermanentlyClosed(element) {
    const text = (element.textContent || '').toLowerCase();
    return text.includes('permanently closed');
  }

  /**
   * Check if temporarily closed
   */
  static checkTemporarilyClosed(element) {
    const text = (element.textContent || '').toLowerCase();
    return text.includes('temporarily closed') || text.includes('closed temporarily');
  }

  /**
   * Check if can be claimed
   */
  static checkCanBeClaimed(element) {
    const text = (element.textContent || '').toLowerCase();
    return text.includes('claim this business') || text.includes('own this business');
  }

  /**
   * Validate and normalize extracted data
   */
  static normalizeData(data) {
    if (!data) return null;

    return {
      placeName: data.placeName || '',
      url: data.url || '',
      priceLevel: data.priceLevel || null,
      category: data.category || '',
      countryCode: data.countryCode || '',
      phoneNumber: data.phoneNumber || '',
      address: data.address || {},
      website: data.website || '',
      canBeClaimed: Boolean(data.canBeClaimed),
      coordinates: data.coordinates || null,
      permanentlyClosed: Boolean(data.permanentlyClosed),
      temporarilyClosed: Boolean(data.temporarilyClosed),
      totalReviewScore: typeof data.totalReviewScore === 'number' ? data.totalReviewScore : null,
      reviewCount: data.reviewCount || 0,
      placeId: data.placeId || '',
      scrapedAt: data.scrapedAt || getCurrentTimestamp(),
      // New fields
      description: data.description || '',
      openingHours: data.openingHours || null,
      reviewDistribution: data.reviewDistribution || null,
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
      plusCode: data.plusCode || '',
      menuLink: data.menuLink || '',
      reservationLinks: Array.isArray(data.reservationLinks) ? data.reservationLinks : [],
      amenities: data.amenities || {},
      imageCount: data.imageCount || 0,
      emails: Array.isArray(data.emails) ? data.emails : [],
    };
  }
}

export default DataExtractor;
