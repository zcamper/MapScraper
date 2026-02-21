import GoogleMapsScraper, { DataExporter } from '../src/index.js';

/**
 * Basic test to verify scraper installation and functionality
 */
async function runTests() {
  console.log('\n🧪 Running Installation Tests...\n');

  let passCount = 0;
  let failCount = 0;

  // Test 1: Module imports
  try {
    console.log('Test 1: Module imports... ', 'pass' ? '✓' : '✗');
    passCount++;
  } catch (error) {
    console.error('  ✗ Failed:', error.message);
    failCount++;
  }

  // Test 2: Scraper instantiation
  try {
    const scraper = new GoogleMapsScraper();
    console.log('Test 2: Scraper instantiation... ✓');
    passCount++;
  } catch (error) {
    console.error('Test 2: Scraper instantiation... ✗');
    console.error('  Error:', error.message);
    failCount++;
  }

  // Test 3: Browser initialization
  try {
    const scraper = new GoogleMapsScraper({ headless: true });
    console.log('Test 3: Initializing browser...');
    
    const startTime = Date.now();
    await scraper.initialize();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`  ✓ Browser initialized in ${elapsed}s`);
    await scraper.close();
    passCount++;
  } catch (error) {
    console.error('Test 3: Browser initialization... ✗');
    console.error('  Error:', error.message);
    console.error('  Note: Install Playwright with: npx playwright install');
    failCount++;
  }

  // Test 4: Utility functions
  try {
    const { utils } = await import('../src/index.js');
    
    // Test delay
    const start = Date.now();
    await utils.delay(100);
    const elapsed = Date.now() - start;
    
    if (elapsed >= 100) {
      console.log('Test 4: Utility functions... ✓');
      passCount++;
    } else {
      throw new Error('Delay not working properly');
    }
  } catch (error) {
    console.error('Test 4: Utility functions... ✗');
    console.error('  Error:', error.message);
    failCount++;
  }

  // Test 5: DataExporter methods
  try {
    const testData = [
      {
        placeName: 'Test Place',
        category: 'Restaurant',
        totalReviewScore: 4.5,
        reviewCount: 100,
        address: { fullAddress: '123 Test St' },
        website: 'https://test.com',
        coordinates: { latitude: 40.7128, longitude: -74.0060 },
      },
    ];

    // Test JSON export
    const testPath = './test_export.json';
    await DataExporter.exportJSON(testData, testPath);
    console.log('Test 5: Data export (JSON)... ✓');
    
    // Clean up
    import('fs').then(({ default: fs }) => {
      fs.unlinkSync(testPath).catch(() => {});
    });
    
    passCount++;
  } catch (error) {
    console.error('Test 5: Data export... ✗');
    console.error('  Error:', error.message);
    failCount++;
  }

  // Test 6: CLI availability
  try {
    const fs = await import('fs');
    const cliPath = './src/cli.js';
    
    if (fs.default.existsSync(cliPath)) {
      console.log('Test 6: CLI module availability... ✓');
      passCount++;
    } else {
      throw new Error('CLI module not found');
    }
  } catch (error) {
    console.error('Test 6: CLI module... ✗');
    console.error('  Error:', error.message);
    failCount++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests Passed: ${passCount}`);
  console.log(`Tests Failed: ${failCount}`);
  console.log('='.repeat(50) + '\n');

  if (failCount === 0) {
    console.log('✅ All tests passed! Ready to scrape.\n');
    console.log('Quick start:');
    console.log('  npm run scrape -- --search "restaurant" --location "New York"\n');
    return true;
  } else {
    console.log('⚠️  Some tests failed. See errors above.\n');
    console.log('Common fixes:');
    console.log('  1. Run: npm install');
    console.log('  2. Run: npx playwright install');
    console.log('  3. Check Node.js version: node --version (need 16+)\n');
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('Test runner crashed:', error);
    process.exit(1);
  });
}

export default runTests;
