import fs from 'fs/promises';
import path from 'path';
import { sanitizeFilename } from './utils.js';

/**
 * Generates interactive HTML maps using Leaflet (no API key required)
 */
export class MapVisualizer {
  /**
   * Generate an interactive map HTML file from scraped place data
   */
  static async generateMap(data, outputDir, baseFilename = 'results_map') {
    try {
      const placesWithCoords = data.filter(
        p => p.coordinates && p.coordinates.latitude && p.coordinates.longitude
      );

      if (placesWithCoords.length === 0) {
        console.warn('No places with coordinates found, skipping map generation');
        return null;
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `${sanitizeFilename(baseFilename)}_${timestamp}.html`;
      const outputPath = path.join(outputDir, filename);

      await fs.mkdir(outputDir, { recursive: true });

      const html = this.buildMapHTML(placesWithCoords, data.length);
      await fs.writeFile(outputPath, html, 'utf-8');

      console.log(`Map generated: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error(`Map generation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Build the full map HTML with Leaflet
   */
  static buildMapHTML(places, totalResults) {
    // Calculate map center from all coordinates
    const avgLat = places.reduce((sum, p) => sum + p.coordinates.latitude, 0) / places.length;
    const avgLng = places.reduce((sum, p) => sum + p.coordinates.longitude, 0) / places.length;

    // Build marker data as JSON
    const markers = places.map(p => ({
      lat: p.coordinates.latitude,
      lng: p.coordinates.longitude,
      name: this.escapeJs(p.placeName || 'Unknown'),
      category: this.escapeJs(p.category || ''),
      rating: p.totalReviewScore || 0,
      reviews: p.reviewCount || 0,
      price: p.priceLevel ? '$'.repeat(p.priceLevel) : '',
      phone: this.escapeJs(p.phoneNumber || ''),
      address: this.escapeJs(
        p.address?.fullAddress || [p.address?.street, p.address?.city].filter(Boolean).join(', ') || ''
      ),
      website: this.escapeJs(p.website || ''),
      closed: p.permanentlyClosed || p.temporarilyClosed,
      url: this.escapeJs(p.url || ''),
    }));

    const markersJson = JSON.stringify(markers);

    // Calculate stats
    const avgRating = places.filter(p => p.totalReviewScore).length > 0
      ? (places.reduce((sum, p) => sum + (p.totalReviewScore || 0), 0) /
         places.filter(p => p.totalReviewScore).length).toFixed(1)
      : 'N/A';

    const categories = [...new Set(places.map(p => p.category).filter(Boolean))];
    const openCount = places.filter(p => !p.permanentlyClosed && !p.temporarilyClosed).length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Maps Scraper - Results Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #header {
      background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%);
      color: white; padding: 16px 24px;
      display: flex; justify-content: space-between; align-items: center;
    }
    #header h1 { font-size: 20px; font-weight: 600; }
    .stats-bar {
      display: flex; gap: 20px; font-size: 13px; opacity: 0.9;
    }
    .stats-bar .stat { display: flex; align-items: center; gap: 4px; }
    .stats-bar .stat strong { font-size: 16px; }
    #map { height: calc(100vh - 60px); width: 100%; }
    .leaflet-popup-content { max-width: 280px; }
    .popup-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; color: #1a73e8; }
    .popup-category { font-size: 12px; color: #666; margin-bottom: 8px; }
    .popup-row { font-size: 13px; margin: 3px 0; display: flex; gap: 6px; }
    .popup-row .label { color: #888; min-width: 60px; }
    .popup-row a { color: #1a73e8; text-decoration: none; }
    .popup-row a:hover { text-decoration: underline; }
    .popup-rating { color: #f4b400; }
    .popup-closed { color: #d93025; font-weight: 500; font-size: 12px; }
    #controls {
      position: absolute; top: 76px; right: 16px; z-index: 1000;
      background: white; border-radius: 8px; padding: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2); font-size: 13px;
      max-height: 300px; overflow-y: auto;
    }
    #controls h3 { font-size: 13px; margin-bottom: 8px; color: #333; }
    #controls label { display: block; margin: 4px 0; cursor: pointer; }
    #controls input[type="checkbox"] { margin-right: 6px; }
    #search-box {
      position: absolute; top: 76px; left: 16px; z-index: 1000;
    }
    #search-box input {
      padding: 8px 12px; border: none; border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2); font-size: 14px;
      width: 250px; outline: none;
    }
    #search-box input:focus { box-shadow: 0 2px 12px rgba(26,115,232,0.4); }
  </style>
</head>
<body>
  <div id="header">
    <h1>Google Maps Results</h1>
    <div class="stats-bar">
      <div class="stat"><strong>${places.length}</strong> mapped / ${totalResults} total</div>
      <div class="stat">Avg rating: <strong>${avgRating}</strong></div>
      <div class="stat"><strong>${openCount}</strong> open</div>
      <div class="stat"><strong>${categories.length}</strong> categories</div>
    </div>
  </div>

  <div id="search-box">
    <input type="text" id="searchInput" placeholder="Filter places by name..." />
  </div>

  <div id="controls">
    <h3>Categories</h3>
    <div id="categoryFilters"></div>
  </div>

  <div id="map"></div>

  <script>
    const markers = ${markersJson};

    const map = L.map('map').setView([${avgLat}, ${avgLng}], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const markerLayer = L.layerGroup().addTo(map);
    let allMarkerObjects = [];

    function getMarkerColor(rating) {
      if (!rating || rating === 0) return '#999';
      if (rating >= 4.5) return '#0d8043';
      if (rating >= 4.0) return '#34a853';
      if (rating >= 3.5) return '#f4b400';
      if (rating >= 3.0) return '#e37400';
      return '#d93025';
    }

    function createIcon(color) {
      return L.divIcon({
        className: '',
        html: '<div style="background:' + color + '; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10],
      });
    }

    function buildPopup(m) {
      let html = '<div class="popup-title">' + m.name + '</div>';
      if (m.category) html += '<div class="popup-category">' + m.category + '</div>';
      if (m.closed) html += '<div class="popup-closed">Permanently/Temporarily Closed</div>';
      if (m.rating) html += '<div class="popup-row"><span class="label">Rating</span> <span class="popup-rating">' + '★'.repeat(Math.round(m.rating)) + '</span> ' + m.rating + ' (' + m.reviews + ' reviews)</div>';
      if (m.price) html += '<div class="popup-row"><span class="label">Price</span> ' + m.price + '</div>';
      if (m.phone) html += '<div class="popup-row"><span class="label">Phone</span> ' + m.phone + '</div>';
      if (m.address) html += '<div class="popup-row"><span class="label">Address</span> ' + m.address + '</div>';
      if (m.website) html += '<div class="popup-row"><span class="label">Website</span> <a href="' + m.website + '" target="_blank">Visit</a></div>';
      if (m.url) html += '<div class="popup-row"><a href="' + m.url + '" target="_blank">View on Google Maps</a></div>';
      return html;
    }

    // Collect unique categories
    const categories = [...new Set(markers.map(m => m.category).filter(Boolean))].sort();
    const categoryState = {};

    const filtersDiv = document.getElementById('categoryFilters');
    categories.forEach(cat => {
      categoryState[cat] = true;
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.addEventListener('change', () => {
        categoryState[cat] = cb.checked;
        renderMarkers();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(cat));
      filtersDiv.appendChild(label);
    });

    function renderMarkers() {
      markerLayer.clearLayers();
      allMarkerObjects = [];
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();

      markers.forEach(m => {
        // Apply category filter
        if (m.category && !categoryState[m.category]) return;
        // Apply search filter
        if (searchTerm && !m.name.toLowerCase().includes(searchTerm)) return;

        const icon = createIcon(getMarkerColor(m.rating));
        const marker = L.marker([m.lat, m.lng], { icon }).bindPopup(buildPopup(m));
        markerLayer.addLayer(marker);
        allMarkerObjects.push(marker);
      });
    }

    document.getElementById('searchInput').addEventListener('input', renderMarkers);

    renderMarkers();

    // Fit map bounds to markers
    if (allMarkerObjects.length > 0) {
      const group = L.featureGroup(allMarkerObjects);
      map.fitBounds(group.getBounds().pad(0.1));
    }
  </script>
</body>
</html>`;
  }

  /**
   * Escape string for safe JS embedding
   */
  static escapeJs(str) {
    if (!str) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e');
  }
}

export default MapVisualizer;
