const fs = require('fs');
const path = require('path');
const { processSingleSite } = require('./cdp_site_crawler.cjs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { DataQueue } = require('./helpers');

// Test with a couple of reliable sites
const TEST_URLS = [
  'example.com',
  'example.org'
];

async function testLogging() {
  console.log('Starting logging test with sites:', TEST_URLS);
  
  // Clean up previous test data
  const testDir = path.join(__dirname, 'test_logs');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  
  // Set up test environment
  const OUTPUT_DIR = testDir;
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  try {
    for (const url of TEST_URLS) {
      console.log(`\n=== Testing: ${url} ===`);
      const siteQueues = [];
      
      try {
        await processSingleSite(browser, url, siteQueues);
        console.log(`✅ Successfully processed: ${url}`);
      } catch (error) {
        console.error(`❌ Error processing ${url}:`, error.message);
      }
      
      // Verify log files were created
      const slug = url.replace(/[^a-zA-Z0-9_-]/g, '_');
      const logDir = path.join(OUTPUT_DIR, slug);
      
      if (fs.existsSync(logDir)) {
        const files = fs.readdirSync(logDir);
        console.log(`📁 Log directory for ${url}:`);
        console.log(`   Path: ${logDir}`);
        console.log(`   Files: ${files.join(', ') || 'None'}`);
        
        // Check file contents
        for (const file of files) {
          const filePath = path.join(logDir, file);
          const stats = fs.statSync(filePath);
          console.log(`   - ${file}: ${stats.size} bytes`);
          
          // Show first few lines of each log file
          if (stats.size > 0) {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(Boolean);
            console.log(`     First entry: ${lines[0]?.substring(0, 100)}...`);
          }
        }
      } else {
        console.log(`❌ No log directory created for: ${url}`);
      }
    }
  } finally {
    await browser.close();
    console.log('\nTest completed. Logs available in:', testDir);
  }
}

// Run the test
testLogging().catch(console.error);
