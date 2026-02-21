import fs from 'fs/promises';
import path from 'path';

/**
 * Helper utilities for scraping and data processing
 */

/**
 * Delay execution for specified milliseconds
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extract text content from HTML element safely
 */
export const safeTextContent = (element) => {
  try {
    return element?.textContent?.trim() || '';
  } catch {
    return '';
  }
};

/**
 * Extract attribute value safely
 */
export const safeAttribute = (element, attribute) => {
  try {
    return element?.getAttribute(attribute) || '';
  } catch {
    return '';
  }
};

/**
 * Parse coordinate from string (e.g., "40.7128, -74.0060")
 */
export const parseCoordinates = (coordString) => {
  if (!coordString) return null;
  
  const parts = coordString.split(',').map(p => parseFloat(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { latitude: parts[0], longitude: parts[1] };
  }
  return null;
};

/**
 * Extract number from string (e.g., "4.5" from "★4.5 (1,234 reviews)")
 */
export const extractNumber = (str) => {
  const match = str?.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
};

/**
 * Clean phone number
 */
export const cleanPhoneNumber = (phone) => {
  if (!phone) return '';
  return phone.replace(/[^\d+\-\s()]/g, '').trim();
};

/**
 * Clean website URL
 */
export const cleanWebsite = (url) => {
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
};

/**
 * Extract place ID from Google Maps URL
 */
export const extractPlaceIdFromUrl = (url) => {
  const match = url?.match(/\/maps\/place\/[^/]+\/\@[^/]+\/data=(!1m\d+!4m\d+!3m\d+)?!(\d+[a-z0-9]+)/i);
  return match ? match[2] : null;
};

/**
 * Format address object
 */
export const formatAddress = (addressData) => {
  const {
    street = '',
    neighborhood = '',
    city = '',
    state = '',
    postalCode = '',
    country = '',
  } = addressData || {};

  const parts = [street, neighborhood, city, state, postalCode, country]
    .filter(p => p && p.trim())
    .map(p => p.trim());
  
  return parts.join(', ');
};

/**
 * Validate and normalize search input
 */
export const validateSearchInput = (input) => {
  if (!input || typeof input !== 'string') {
    throw new Error('Search input must be a non-empty string');
  }
  return input.trim();
};

/**
 * Check if string is valid Google Maps URL
 */
export const isValidGoogleMapsUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('google') && urlObj.pathname.includes('/maps');
  } catch {
    return false;
  }
};

/**
 * Create output directory if it doesn't exist
 */
export const ensureOutputDirectory = async (outputDir) => {
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    console.error(`Failed to create output directory: ${error.message}`);
  }
};

/**
 * Get unique filename to avoid overwrites
 */
export const getUniqueFilename = async (baseDir, filename) => {
  let finalPath = path.join(baseDir, filename);
  let counter = 1;
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  while (true) {
    try {
      await fs.access(finalPath);
      // File exists, try next counter
      const newFilename = `${name}_${counter}${ext}`;
      finalPath = path.join(baseDir, newFilename);
      counter++;
    } catch {
      // File doesn't exist, this path is available
      break;
    }
  }

  return finalPath;
};

/**
 * Sanitize filename
 */
export const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-z0-9_\-]/gi, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
};

/**
 * Get current timestamp in ISO format
 */
export const getCurrentTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Group results by category
 */
export const groupByCategory = (results) => {
  return results.reduce((acc, item) => {
    const category = item.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {});
};

/**
 * Filter results by rating
 */
export const filterByRating = (results, minRating) => {
  if (!minRating) return results;
  return results.filter(item => item.totalReviewScore >= minRating);
};

/**
 * Filter results by open/closed status
 */
export const filterByStatus = (results, status) => {
  if (!status) return results;
  
  return results.filter(item => {
    if (status === 'open') {
      return !item.permanentlyClosed && !item.temporarilyClosed;
    } else if (status === 'closed_permanent') {
      return item.permanentlyClosed;
    } else if (status === 'closed_temporary') {
      return item.temporarilyClosed;
    }
    return true;
  });
};

/**
 * Parse location input (city, country, zip)
 */
export const parseLocation = (locationString) => {
  if (!locationString) return {};
  
  const parts = locationString.split(',').map(p => p.trim());
  return {
    city: parts[0] || '',
    country: parts[1] || '',
    zipCode: parts[2] || '',
  };
};

export default {
  delay,
  safeTextContent,
  safeAttribute,
  parseCoordinates,
  extractNumber,
  cleanPhoneNumber,
  cleanWebsite,
  extractPlaceIdFromUrl,
  formatAddress,
  validateSearchInput,
  isValidGoogleMapsUrl,
  ensureOutputDirectory,
  sanitizeFilename,
  getCurrentTimestamp,
  groupByCategory,
  filterByRating,
  filterByStatus,
  parseLocation,
};
