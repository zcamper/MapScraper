import fs from 'fs/promises';
import path from 'path';
import { stringify } from 'csv-stringify';
import { sanitizeFilename } from './utils.js';

/**
 * Handles exporting scraped data to various formats
 */
export class DataExporter {
  /**
   * Export data to JSON format
   */
  static async exportJSON(data, outputPath) {
    try {
      const jsonData = JSON.stringify(data, null, 2);
      await fs.writeFile(outputPath, jsonData, 'utf-8');
      console.log(`JSON export successful: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error(`JSON export failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export data to CSV format
   */
  static async exportCSV(data, outputPath) {
    return new Promise((resolve, reject) => {
      try {
        const csvData = this.prepareCSVData(data);

        stringify(csvData, {
          header: true,
          columns: this.getCSVColumns(),
        }, async (err, output) => {
          if (err) {
            console.error(`CSV export failed: ${err.message}`);
            reject(err);
            return;
          }

          try {
            await fs.writeFile(outputPath, output, 'utf-8');
            console.log(`CSV export successful: ${outputPath}`);
            resolve(outputPath);
          } catch (writeErr) {
            console.error(`CSV file write failed: ${writeErr.message}`);
            reject(writeErr);
          }
        });
      } catch (error) {
        console.error(`CSV export failed: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Export data to Excel format
   */
  static async exportExcel(data, outputPath) {
    try {
      const { createRequire } = await import('module');
      const _require = createRequire(import.meta.url);
      const ExcelJS = _require('exceljs');
      const workbook = new ExcelJS.Workbook();

      // Main results sheet
      const worksheet = workbook.addWorksheet('Places');
      const headers = this.getExcelColumns();
      worksheet.columns = headers.map(col => ({
        header: col.display,
        key: col.key,
        width: col.width || 20,
      }));

      const flatData = this.prepareFlatData(data);
      worksheet.addRows(flatData);

      // Style header row
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      worksheet.columns.forEach(column => {
        column.alignment = { wrapText: true, vertical: 'top' };
      });

      // Reviews sheet (if any places have reviews)
      const placesWithReviews = data.filter(d => d.reviews && d.reviews.length > 0);
      if (placesWithReviews.length > 0) {
        const reviewSheet = workbook.addWorksheet('Reviews');
        reviewSheet.columns = [
          { header: 'Place Name', key: 'placeName', width: 25 },
          { header: 'Author', key: 'author', width: 20 },
          { header: 'Rating', key: 'rating', width: 10 },
          { header: 'Review Text', key: 'text', width: 60 },
          { header: 'Date', key: 'publishedDate', width: 18 },
          { header: 'Likes', key: 'likesCount', width: 10 },
        ];

        for (const place of placesWithReviews) {
          for (const review of place.reviews) {
            reviewSheet.addRow({
              placeName: place.placeName,
              author: review.author,
              rating: review.rating,
              text: review.text,
              publishedDate: review.publishedDate,
              likesCount: review.likesCount,
            });
          }
        }

        reviewSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        reviewSheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' },
        };
      }

      await workbook.xlsx.writeFile(outputPath);
      console.log(`Excel export successful: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error(`Excel export failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export data to HTML format
   */
  static async exportHTML(data, outputPath, title = 'Google Maps Extraction Results') {
    try {
      const html = this.generateHTML(data, title);
      await fs.writeFile(outputPath, html, 'utf-8');
      console.log(`HTML export successful: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error(`HTML export failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export to multiple formats at once
   */
  static async exportMultiple(data, outputDir, formats = ['json', 'csv', 'excel'], baseFilename = 'google_maps_results') {
    const results = {};
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${sanitizeFilename(baseFilename)}_${timestamp}`;

    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create output directory: ${error.message}`);
    }

    for (const format of formats) {
      const formatLower = format.toLowerCase();
      try {
        switch (formatLower) {
          case 'json':
            results.json = await this.exportJSON(
              data,
              path.join(outputDir, `${filename}.json`)
            );
            break;
          case 'csv':
            results.csv = await this.exportCSV(
              data,
              path.join(outputDir, `${filename}.csv`)
            );
            break;
          case 'excel':
          case 'xlsx':
            results.excel = await this.exportExcel(
              data,
              path.join(outputDir, `${filename}.xlsx`)
            );
            break;
          case 'html':
            results.html = await this.exportHTML(
              data,
              path.join(outputDir, `${filename}.html`)
            );
            break;
          default:
            console.warn(`Unknown export format: ${format}`);
        }
      } catch (error) {
        console.error(`Failed to export as ${formatLower}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Get CSV column definitions
   */
  static getCSVColumns() {
    return [
      'placeName',
      'category',
      'description',
      'totalReviewScore',
      'reviewCount',
      'reviewDistribution',
      'priceLevel',
      'phoneNumber',
      'address',
      'website',
      'coordinates',
      'openingHours',
      'permanentlyClosed',
      'temporarilyClosed',
      'canBeClaimed',
      'countryCode',
      'placeId',
      'plusCode',
      'menuLink',
      'imageCount',
      'amenities',
      'url',
      'scrapedAt',
    ];
  }

  /**
   * Get Excel column definitions
   */
  static getExcelColumns() {
    return [
      { key: 'placeName', display: 'Place Name', width: 30 },
      { key: 'category', display: 'Category', width: 20 },
      { key: 'description', display: 'Description', width: 40 },
      { key: 'totalReviewScore', display: 'Rating', width: 10 },
      { key: 'reviewCount', display: 'Reviews', width: 10 },
      { key: 'reviewDistribution', display: 'Star Distribution', width: 30 },
      { key: 'priceLevel', display: 'Price Level', width: 12 },
      { key: 'phoneNumber', display: 'Phone', width: 20 },
      { key: 'address', display: 'Address', width: 40 },
      { key: 'website', display: 'Website', width: 30 },
      { key: 'coordinates', display: 'Coordinates', width: 22 },
      { key: 'openingHours', display: 'Opening Hours', width: 40 },
      { key: 'permanentlyClosed', display: 'Perm. Closed', width: 12 },
      { key: 'temporarilyClosed', display: 'Temp. Closed', width: 12 },
      { key: 'canBeClaimed', display: 'Can Claim', width: 10 },
      { key: 'countryCode', display: 'Country', width: 10 },
      { key: 'placeId', display: 'Place ID', width: 22 },
      { key: 'plusCode', display: 'Plus Code', width: 18 },
      { key: 'menuLink', display: 'Menu Link', width: 25 },
      { key: 'imageCount', display: 'Images', width: 10 },
      { key: 'amenities', display: 'Amenities', width: 40 },
      { key: 'scrapedAt', display: 'Scraped At', width: 20 },
    ];
  }

  /**
   * Format opening hours for flat export
   */
  static formatOpeningHours(hours) {
    if (!hours || typeof hours !== 'object') return '';
    return Object.entries(hours).map(([day, time]) => `${day}: ${time}`).join('; ');
  }

  /**
   * Format review distribution for flat export
   */
  static formatReviewDistribution(dist) {
    if (!dist || typeof dist !== 'object') return '';
    return Object.entries(dist)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([star, data]) => `${star}: ${data.count || 0}`)
      .join(', ');
  }

  /**
   * Format amenities for flat export
   */
  static formatAmenities(amenities) {
    if (!amenities || typeof amenities !== 'object') return '';
    return Object.entries(amenities)
      .filter(([, value]) => value)
      .map(([key]) => key)
      .join(', ');
  }

  /**
   * Prepare data for CSV export
   */
  static prepareCSVData(data) {
    return data.map(item => ({
      placeName: item.placeName || '',
      category: item.category || '',
      description: item.description || '',
      totalReviewScore: item.totalReviewScore || '',
      reviewCount: item.reviewCount || '',
      reviewDistribution: this.formatReviewDistribution(item.reviewDistribution),
      priceLevel: item.priceLevel ? '$'.repeat(item.priceLevel) : '',
      phoneNumber: item.phoneNumber || '',
      address: this.formatAddressForExport(item.address),
      website: item.website || '',
      coordinates: item.coordinates ? `${item.coordinates.latitude}, ${item.coordinates.longitude}` : '',
      openingHours: this.formatOpeningHours(item.openingHours),
      permanentlyClosed: item.permanentlyClosed ? 'Yes' : 'No',
      temporarilyClosed: item.temporarilyClosed ? 'Yes' : 'No',
      canBeClaimed: item.canBeClaimed ? 'Yes' : 'No',
      countryCode: item.countryCode || '',
      placeId: item.placeId || '',
      plusCode: item.plusCode || '',
      menuLink: item.menuLink || '',
      imageCount: item.imageCount || 0,
      amenities: this.formatAmenities(item.amenities),
      url: item.url || '',
      scrapedAt: item.scrapedAt || '',
    }));
  }

  /**
   * Prepare flat data structure for Excel
   */
  static prepareFlatData(data) {
    return data.map(item => ({
      placeName: item.placeName || '',
      category: item.category || '',
      description: item.description || '',
      totalReviewScore: item.totalReviewScore || '',
      reviewCount: item.reviewCount || '',
      reviewDistribution: this.formatReviewDistribution(item.reviewDistribution),
      priceLevel: item.priceLevel ? '$'.repeat(item.priceLevel) : '',
      phoneNumber: item.phoneNumber || '',
      address: this.formatAddressForExport(item.address),
      website: item.website || '',
      coordinates: item.coordinates ? `${item.coordinates.latitude}, ${item.coordinates.longitude}` : '',
      openingHours: this.formatOpeningHours(item.openingHours),
      permanentlyClosed: item.permanentlyClosed ? 'Yes' : 'No',
      temporarilyClosed: item.temporarilyClosed ? 'Yes' : 'No',
      canBeClaimed: item.canBeClaimed ? 'Yes' : 'No',
      countryCode: item.countryCode || '',
      placeId: item.placeId || '',
      plusCode: item.plusCode || '',
      menuLink: item.menuLink || '',
      imageCount: item.imageCount || 0,
      amenities: this.formatAmenities(item.amenities),
      scrapedAt: item.scrapedAt || '',
    }));
  }

  /**
   * Format address for export
   */
  static formatAddressForExport(address) {
    if (!address) return '';
    const parts = [
      address.street,
      address.neighborhood,
      address.city,
      address.state,
      address.postalCode,
    ].filter(p => p && p.trim());
    return parts.join(', ');
  }

  /**
   * Generate HTML output
   */
  static generateHTML(data, title) {
    const timestamp = new Date().toISOString();

    // Calculate stats
    const ratedPlaces = data.filter(d => d.totalReviewScore);
    const avgRating = ratedPlaces.length > 0
      ? (ratedPlaces.reduce((sum, d) => sum + d.totalReviewScore, 0) / ratedPlaces.length).toFixed(1)
      : 'N/A';
    const openCount = data.filter(d => !d.permanentlyClosed && !d.temporarilyClosed).length;
    const withReviews = data.filter(d => d.reviews && d.reviews.length > 0).length;
    const withHours = data.filter(d => d.openingHours).length;

    const rows = data.map((item, index) => {
      const hoursHtml = item.openingHours
        ? Object.entries(item.openingHours).map(([day, time]) =>
            `<div><strong>${this.escapeHtml(day)}</strong>: ${this.escapeHtml(time)}</div>`
          ).join('')
        : '-';

      const reviewsHtml = item.reviews && item.reviews.length > 0
        ? item.reviews.map(r =>
            `<div class="review-item"><span class="review-rating">${'★'.repeat(r.rating || 0)}</span> <strong>${this.escapeHtml(r.author)}</strong><br/>${this.escapeHtml(r.text?.substring(0, 120) || '')}${r.text?.length > 120 ? '...' : ''}</div>`
          ).join('')
        : '';

      const distHtml = item.reviewDistribution
        ? Object.entries(item.reviewDistribution)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([star, data]) => {
              const pct = data.percentage || 0;
              return `<div class="dist-row"><span>${star.replace('_', ' ')}</span><div class="dist-bar"><div class="dist-fill" style="width:${pct}%"></div></div><span>${data.count || 0}</span></div>`;
            }).join('')
        : '';

      return `
      <tr>
        <td>${index + 1}</td>
        <td>
          <strong>${this.escapeHtml(item.placeName)}</strong>
          ${item.description ? `<div class="desc">${this.escapeHtml(item.description.substring(0, 100))}${item.description.length > 100 ? '...' : ''}</div>` : ''}
        </td>
        <td>${this.escapeHtml(item.category)}</td>
        <td>
          ${item.totalReviewScore ? `<span class="rating">★ ${item.totalReviewScore}</span>` : '-'}
          <div class="review-count">${item.reviewCount ? `(${item.reviewCount.toLocaleString()})` : ''}</div>
          ${distHtml ? `<div class="dist-container">${distHtml}</div>` : ''}
        </td>
        <td>${item.priceLevel ? '$'.repeat(item.priceLevel) : '-'}</td>
        <td>${this.escapeHtml(item.phoneNumber)}</td>
        <td>${this.escapeHtml(this.formatAddressForExport(item.address))}</td>
        <td>${item.website ? `<a href="${this.escapeHtml(item.website)}" target="_blank">Link</a>` : '-'}</td>
        <td>${item.coordinates ? `${item.coordinates.latitude.toFixed(4)}, ${item.coordinates.longitude.toFixed(4)}` : '-'}</td>
        <td class="hours-cell">${hoursHtml}</td>
        <td>${item.permanentlyClosed ? '<span class="closed">Yes</span>' : 'No'}</td>
        <td>${item.imageCount || 0}</td>
        <td>${item.url ? `<a href="${this.escapeHtml(item.url)}" target="_blank">Maps</a>` : '-'}</td>
      </tr>
      ${reviewsHtml ? `<tr class="review-row"><td></td><td colspan="12"><div class="reviews-container">${reviewsHtml}</div></td></tr>` : ''}
    `;
    }).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 10px; font-size: 28px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 30px; }
    .stat-box { background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); color: white; padding: 18px; border-radius: 6px; text-align: center; }
    .stat-box .number { font-size: 26px; font-weight: bold; }
    .stat-box .label { font-size: 11px; text-transform: uppercase; margin-top: 4px; opacity: 0.9; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
    th { background: #1a73e8; color: white; padding: 10px 8px; text-align: left; font-weight: 600; font-size: 12px; position: sticky; top: 0; }
    td { padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    tbody tr:hover { background: #f0f6ff; }
    a { color: #1a73e8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .rating { color: #f4b400; font-weight: 600; }
    .review-count { color: #888; font-size: 11px; }
    .desc { color: #666; font-size: 11px; margin-top: 4px; }
    .closed { color: #d93025; font-weight: 500; }
    .hours-cell { font-size: 11px; }
    .hours-cell div { margin: 1px 0; }
    .review-row td { padding: 4px 8px 12px; background: #fafafa; }
    .reviews-container { display: flex; flex-wrap: wrap; gap: 8px; }
    .review-item { background: white; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; font-size: 12px; max-width: 300px; }
    .review-rating { color: #f4b400; }
    .dist-container { margin-top: 4px; }
    .dist-row { display: flex; align-items: center; gap: 4px; font-size: 10px; margin: 1px 0; }
    .dist-row span { min-width: 36px; text-align: right; }
    .dist-bar { flex: 1; height: 6px; background: #e0e0e0; border-radius: 3px; overflow: hidden; }
    .dist-fill { height: 100%; background: #f4b400; border-radius: 3px; }
    #searchInput { padding: 8px 14px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; width: 300px; margin-bottom: 16px; }
    #searchInput:focus { border-color: #1a73e8; outline: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${this.escapeHtml(title)}</h1>
    <p class="meta">Generated on ${timestamp}</p>

    <div class="stats">
      <div class="stat-box">
        <div class="number">${data.length}</div>
        <div class="label">Total Results</div>
      </div>
      <div class="stat-box">
        <div class="number">${avgRating}</div>
        <div class="label">Avg Rating</div>
      </div>
      <div class="stat-box">
        <div class="number">${openCount}</div>
        <div class="label">Open</div>
      </div>
      <div class="stat-box">
        <div class="number">${withHours}</div>
        <div class="label">With Hours</div>
      </div>
      <div class="stat-box">
        <div class="number">${withReviews}</div>
        <div class="label">With Reviews</div>
      </div>
    </div>

    <input type="text" id="searchInput" placeholder="Filter by name or category..." oninput="filterTable()" />

    <table id="resultsTable">
      <thead>
        <tr>
          <th>#</th>
          <th>Place Name</th>
          <th>Category</th>
          <th>Rating</th>
          <th>Price</th>
          <th>Phone</th>
          <th>Address</th>
          <th>Website</th>
          <th>Coordinates</th>
          <th>Hours</th>
          <th>Closed</th>
          <th>Images</th>
          <th>Maps</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>

  <script>
    function filterTable() {
      const filter = document.getElementById('searchInput').value.toLowerCase();
      const rows = document.querySelectorAll('#resultsTable tbody tr');
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(filter) ? '' : 'none';
      });
    }
  </script>
</body>
</html>
    `;
  }

  /**
   * Escape HTML special characters
   */
  static escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }
}

export default DataExporter;
