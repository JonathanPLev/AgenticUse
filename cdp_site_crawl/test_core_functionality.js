#!/usr/bin/env node

/**
 * Simple test to verify core crawler functionality without extensions
 * This tests the URL bug fix and basic interaction capabilities
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

const { enhancedInputInteraction } = require('./enhanced_input_interaction');
const { applyBotMitigation } = require('./bot_mitigation');
const { instrumentPage } = require('./instrumentation');
const { performGenericDetection } = require('./generic_detection');

puppeteer.use(StealthPlugin());

// Simple test sites that should work reliably
const TEST_SITES = [
  {
    name: 'HTTPBin Forms',
    url: 'https://httpbin.org/forms/post',
    description: 'Simple form testing site'
  },
  {
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com',
    description: 'Search engine with search input'
  }
];

async function testCoreFunctionality() {
  console.log('🧪 CORE FUNCTIONALITY TEST');
  console.log('===========================');
  console.log('Testing URL bug fix and basic crawler functionality\n');
  
  const testDir = path.join(__dirname, 'core_test_results');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Launch browser in headless mode for reliability
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--no-first-run',
      '--disable-gpu'
    ],
    defaultViewport: { width: 1366, height: 768 }
  });

  const results = [];

  try {
    for (const [index, site] of TEST_SITES.entries()) {
      console.log(`\n🎯 Testing ${index + 1}: ${site.name}`);
      console.log(`📍 URL: ${site.url}`);
      console.log(`📝 ${site.description}`);
      
      const siteDir = path.join(testDir, `test_${index + 1}_${site.name.toLowerCase().replace(/\s+/g, '_')}`);
      if (!fs.existsSync(siteDir)) {
        fs.mkdirSync(siteDir, { recursive: true });
      }

      const page = await browser.newPage();
      const startTime = Date.now();
      
      try {
        // Set up logging queues
        const networkQueue = { items: [], enqueue: (item) => networkQueue.items.push(item) };
        const responseQueue = { items: [], enqueue: (item) => responseQueue.items.push(item) };
        const consoleQueue = { items: [], enqueue: (item) => consoleQueue.items.push(item) };
        const debugQueue = { items: [], enqueue: (item) => debugQueue.items.push(item) };
        const domQueue = { items: [], enqueue: (item) => domQueue.items.push(item) };
        const interactionQueue = { items: [], enqueue: (item) => interactionQueue.items.push(item) };

        const queues = { networkQueue, responseQueue, consoleQueue, debugQueue, domQueue, interactionQueue };

        // Set up instrumentation
        console.log('  📊 Setting up instrumentation...');
        await instrumentPage(page, queues);

        // Apply bot mitigation
        console.log('  🛡️  Applying bot mitigation...');
        await applyBotMitigation(page);

        // Navigate to site
        console.log('  🌐 Navigating to site...');
        await page.goto(site.url, { 
          waitUntil: 'networkidle0', 
          timeout: 30000 
        });

        // Wait for page to load
        console.log('  ⏳ Waiting for page to load...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Perform generic detection
        console.log('  🔍 Performing generic detection...');
        const genericDetectionResults = await performGenericDetection(page);
        
        console.log(`     - Search elements: ${genericDetectionResults.searchElements?.length || 0}`);
        console.log(`     - Chatbots: ${genericDetectionResults.chatbots?.length || 0}`);
        console.log(`     - Iframe chatbots: ${genericDetectionResults.iframeChatbots?.length || 0}`);

        // Test the fixed enhancedInputInteraction function
        console.log('  🎯 Testing enhanced input interaction (FIXED VERSION)...');
        const interactionResults = await enhancedInputInteraction(page, site.url, {
          instrumentPage,
          queues,
          logFile: path.join(siteDir, 'interaction_summary.log'),
          maxInteractionsPerPage: 3, // Limit for testing
          interactionTimeout: 15000,
          enableBotMitigation: true
        });

        const duration = Date.now() - startTime;

        // Save results
        const result = {
          testNumber: index + 1,
          name: site.name,
          url: site.url,
          success: true,
          duration: duration,
          inputElementsFound: interactionResults?.totalElementsFound || 0,
          interactionsPerformed: interactionResults?.totalInteractions || 0,
          networkRequests: networkQueue.items.length,
          searchElementsDetected: genericDetectionResults.searchElements?.length || 0,
          chatbotsDetected: genericDetectionResults.chatbots?.length || 0,
          iframeChatbotsDetected: genericDetectionResults.iframeChatbots?.length || 0
        };

        results.push(result);

        // Save detailed logs
        fs.writeFileSync(
          path.join(siteDir, 'network_requests.json'),
          JSON.stringify(networkQueue.items, null, 2)
        );

        fs.writeFileSync(
          path.join(siteDir, 'test_result.json'),
          JSON.stringify(result, null, 2)
        );

        console.log(`  ✅ Test completed successfully!`);
        console.log(`     - Duration: ${Math.round(duration/1000)}s`);
        console.log(`     - Elements found: ${result.inputElementsFound}`);
        console.log(`     - Interactions: ${result.interactionsPerformed}`);
        console.log(`     - Network requests: ${result.networkRequests}`);

      } catch (error) {
        console.error(`  ❌ Test failed: ${error.message}`);
        results.push({
          testNumber: index + 1,
          name: site.name,
          url: site.url,
          success: false,
          error: error.message,
          duration: Date.now() - startTime
        });
      } finally {
        await page.close();
      }
    }

    // Generate final report
    const report = {
      testType: 'Core Functionality Test',
      timestamp: new Date().toISOString(),
      totalSites: TEST_SITES.length,
      successfulTests: results.filter(r => r.success).length,
      failedTests: results.filter(r => !r.success).length,
      results: results,
      summary: {
        totalInteractions: results.reduce((sum, r) => sum + (r.interactionsPerformed || 0), 0),
        totalNetworkRequests: results.reduce((sum, r) => sum + (r.networkRequests || 0), 0),
        averageDuration: Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length / 1000)
      }
    };

    fs.writeFileSync(
      path.join(testDir, 'core_test_report.json'),
      JSON.stringify(report, null, 2)
    );

    // Print final summary
    console.log('\n🎉 CORE FUNCTIONALITY TEST COMPLETED');
    console.log('=====================================');
    console.log(`✅ Successful tests: ${report.successfulTests}/${report.totalSites}`);
    console.log(`🎯 Total interactions: ${report.summary.totalInteractions}`);
    console.log(`🌐 Total network requests: ${report.summary.totalNetworkRequests}`);
    console.log(`⏱️  Average duration: ${report.summary.averageDuration}s`);
    console.log(`📁 Results saved to: ${testDir}`);

    if (report.successfulTests === report.totalSites) {
      console.log('\n🎉 ALL CORE TESTS PASSED! URL bug fix is working correctly.');
      return true;
    } else {
      console.log(`\n⚠️  ${report.failedTests} tests failed. Check logs for details.`);
      return false;
    }

  } catch (error) {
    console.error('❌ Core test suite failed:', error);
    return false;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  testCoreFunctionality().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testCoreFunctionality };
