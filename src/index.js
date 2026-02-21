/**
 * Google Maps Scraper - Main Entry Point
 *
 * This module exports the main scraper class and related utilities
 */

import GoogleMapsScraper from './scraper.js';
import { DataExtractor } from './dataExtractor.js';
import { DataExporter } from './dataExporter.js';
import { MapVisualizer } from './mapVisualizer.js';
import { ProxyManager } from './proxyManager.js';
import * as utils from './utils.js';

export {
  GoogleMapsScraper,
  DataExtractor,
  DataExporter,
  MapVisualizer,
  ProxyManager,
  utils,
};

export default GoogleMapsScraper;
