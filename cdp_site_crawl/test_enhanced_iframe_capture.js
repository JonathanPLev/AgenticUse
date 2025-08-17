#!/usr/bin/env node

/**
 * Test script to verify enhanced dynamic iframe capture works correctly
 * Tests immediate DOM capture for dynamically loaded iframes
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Import our enhanced modules
const { performGenericDetection } = require('./generic_detection');
const { DataQueue } = require('./helpers');

puppeteer.use(StealthPlugin());

// Test sites with known dynamic iframes
const DYNAMIC_IFRAME_TEST_SITES = [
  {
    name: 'HubSpot',
    url: 'https://www.hubspot.com',
    description: 'HubSpot - loads chat widgets dynamically',
    expectedDynamicElements: ['chat widget', 'forms', 'tracking pixels']
  },
  {
    name: 'Intercom',
    url: 'https://www.intercom.com',
    description: 'Intercom - known for dynamic chat widget loading',
    expectedDynamicElements: ['messenger widget', 'chat launcher']
  },
  {
    name: 'OpenAI',
    url: 'https://openai.com',
    description: 'OpenAI - dynamic content and potential chat interfaces',
    expectedDynamicElements: ['chat interface', 'dynamic content']
  }
];

async function testEnhancedIframeCapture() {
  console.log('🧪 ENHANCED DYNAMIC IFRAME CAPTURE TEST');
  console.log('=====================================');
  console.log('Testing:');
  console.log('  ✅ Immediate DOM capture for new iframes');
  console.log('  ✅ Frame navigation DOM capture');
  console.log('  ✅ Comprehensive logging of all iframe activity');
  console.log('  ✅ Network request monitoring\n');
  
  const testDir = path.join(__dirname, 'enhanced_iframe_test_results');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Launch browser with Consent-O-Matic extension
  const extensionPath = path.join(__dirname, 'Consent_O_Matic', 'build');
  console.log(`🔌 Loading Consent-O-Matic extension from: ${extensionPath}`);
  
  const browser = await puppeteer.launch({
    headless: false, // Must be false for extensions
    timeout: 60000,
    ignoreDefaultArgs: [
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-blink-features=AutomationControlled,MojoJS'
    ],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--no-first-run',
      '--disable-gpu'
    ],
    defaultViewport: null,
    userDataDir: path.join(__dirname, `user_data_iframe_test_${Date.now()}`)
  });

  console.log('✅ Browser launched successfully with enhanced iframe capture\n');

  const testResults = [];

  for (const site of DYNAMIC_IFRAME_TEST_SITES) {
    console.log(`🌐 Testing ${site.name}: ${site.url}`);
    console.log(`   Description: ${site.description}`);
    
    const page = await browser.newPage();
    const siteDir = path.join(testDir, `test_${site.name.toLowerCase()}`);
    if (!fs.existsSync(siteDir)) {
      fs.mkdirSync(siteDir, { recursive: true });
    }

    // Create enhanced logging queues
    const domQueue = new DataQueue(path.join(siteDir, 'enhanced_dom.log'));
    const networkQueue = new DataQueue(path.join(siteDir, 'network_requests.log'));
    const iframeActivityQueue = new DataQueue(path.join(siteDir, 'iframe_activity.log'));

    try {
      // Enhanced network monitoring
      page.on('request', request => {
        networkQueue.enqueue({
          timestamp: Date.now(),
          type: 'request',
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          headers: request.headers(),
          isIframe: request.frame() !== page.mainFrame()
        });
      });

      page.on('response', response => {
        networkQueue.enqueue({
          timestamp: Date.now(),
          type: 'response',
          url: response.url(),
          status: response.status(),
          headers: response.headers(),
          isIframe: response.frame() !== page.mainFrame()
        });
      });

      // Enhanced iframe activity monitoring
      page.on('frameattached', frame => {
        console.log(`  🆕 IFRAME ATTACHED: ${frame.url()}`);
        iframeActivityQueue.enqueue({
          timestamp: Date.now(),
          event: 'frameattached',
          frameId: frame._id,
          url: frame.url(),
          parentFrame: frame.parentFrame() ? frame.parentFrame().url() : 'main'
        });
      });

      page.on('framenavigated', frame => {
        console.log(`  🔄 IFRAME NAVIGATED: ${frame.url()}`);
        iframeActivityQueue.enqueue({
          timestamp: Date.now(),
          event: 'framenavigated',
          frameId: frame._id,
          url: frame.url(),
          parentFrame: frame.parentFrame() ? frame.parentFrame().url() : 'main'
        });
      });

      page.on('framedetached', frame => {
        console.log(`  🗑️  IFRAME DETACHED: ${frame.url()}`);
        iframeActivityQueue.enqueue({
          timestamp: Date.now(),
          event: 'framedetached',
          frameId: frame._id,
          url: frame.url()
        });
      });

      // Navigate to the site
      console.log(`  📡 Navigating to ${site.url}...`);
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Wait for initial content to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Run enhanced generic detection with DOM capture
      console.log(`  🔍 Running enhanced generic detection with DOM capture...`);
      const detectionResults = await performGenericDetection(page, domQueue);
      
      // Wait for dynamic content to load
      console.log(`  ⏳ Waiting for dynamic iframes to load...`);
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Scroll to trigger lazy-loaded content
      console.log(`  📜 Scrolling to trigger lazy-loaded content...`);
      await page.evaluate(() => {
        return new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if(totalHeight >= scrollHeight){
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      // Wait for any additional dynamic content
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Final DOM capture of all frames
      console.log(`  💾 Final capture of all frames...`);
      for (const frame of page.frames()) {
        try {
          const html = await frame.content();
          domQueue.enqueue({
            frameId: frame._id,
            url: frame.url(),
            html,
            timestamp: Date.now(),
            captureType: 'final_capture',
            loadTime: new Date().toISOString()
          });
        } catch (e) {
          console.warn(`    ⚠️  Could not capture frame ${frame.url()}: ${e.message}`);
        }
      }

      // Flush all queues
      await domQueue.flush();
      await networkQueue.flush();
      await iframeActivityQueue.flush();

      // Generate summary
      const summary = {
        site: site.name,
        url: site.url,
        timestamp: new Date().toISOString(),
        success: true,
        totalFrames: page.frames().length,
        detectionResults: {
          searchElements: detectionResults.searchElements.length,
          chatbots: detectionResults.chatbots.length,
          iframeChatbots: detectionResults.iframeChatbots.length
        },
        domEntries: domQueue.items.length,
        networkRequests: networkQueue.items.length,
        iframeEvents: iframeActivityQueue.items.length
      };

      fs.writeFileSync(
        path.join(siteDir, 'test_summary.json'),
        JSON.stringify(summary, null, 2)
      );

      testResults.push(summary);

      console.log(`  ✅ ${site.name} test completed successfully`);
      console.log(`     - Total frames detected: ${summary.totalFrames}`);
      console.log(`     - DOM entries captured: ${summary.domEntries}`);
      console.log(`     - Network requests: ${summary.networkRequests}`);
      console.log(`     - Iframe events: ${summary.iframeEvents}`);
      console.log(`     - Search elements: ${summary.detectionResults.searchElements}`);
      console.log(`     - Chatbots detected: ${summary.detectionResults.chatbots}`);
      console.log(`     - Iframe chatbots: ${summary.detectionResults.iframeChatbots}`);

    } catch (error) {
      console.error(`  ❌ Error testing ${site.name}:`, error.message);
      testResults.push({
        site: site.name,
        url: site.url,
        timestamp: new Date().toISOString(),
        error: error.message,
        success: false
      });
    } finally {
      await page.close();
    }
    
    console.log(); // Empty line for readability
  }

  // Generate comprehensive report
  const report = {
    testType: 'Enhanced Dynamic Iframe Capture',
    timestamp: new Date().toISOString(),
    totalSites: DYNAMIC_IFRAME_TEST_SITES.length,
    successfulTests: testResults.filter(r => r.success).length,
    failedTests: testResults.filter(r => !r.success).length,
    results: testResults,
    summary: {
      totalFramesDetected: testResults.reduce((sum, r) => sum + (r.totalFrames || 0), 0),
      totalDOMEntries: testResults.reduce((sum, r) => sum + (r.domEntries || 0), 0),
      totalNetworkRequests: testResults.reduce((sum, r) => sum + (r.networkRequests || 0), 0),
      totalIframeEvents: testResults.reduce((sum, r) => sum + (r.iframeEvents || 0), 0),
      averageFramesPerSite: Math.round(testResults.reduce((sum, r) => sum + (r.totalFrames || 0), 0) / testResults.length)
    }
  };

  fs.writeFileSync(
    path.join(testDir, 'enhanced_iframe_capture_report.json'),
    JSON.stringify(report, null, 2)
  );

  // Print final summary
  console.log('🎉 ENHANCED IFRAME CAPTURE TEST COMPLETED');
  console.log('========================================');
  console.log(`✅ Successful tests: ${report.successfulTests}/${report.totalSites}`);
  console.log(`🖼️  Total frames detected: ${report.summary.totalFramesDetected}`);
  console.log(`💾 Total DOM entries captured: ${report.summary.totalDOMEntries}`);
  console.log(`🌐 Total network requests: ${report.summary.totalNetworkRequests}`);
  console.log(`📊 Total iframe events: ${report.summary.totalIframeEvents}`);
  console.log(`📈 Average frames per site: ${report.summary.averageFramesPerSite}`);
  console.log(`\n📁 Detailed results saved to: ${testDir}`);

  if (report.failedTests > 0) {
    console.log(`\n⚠️  ${report.failedTests} tests failed. Check individual logs for details.`);
  }

  console.log('\n🔍 WHAT TO LOOK FOR IN RESULTS:');
  console.log('- enhanced_dom.log: Should contain entries with captureType "dynamic_iframe_attached" and "dynamic_iframe_navigated"');
  console.log('- iframe_activity.log: Should show frameattached, framenavigated, and framedetached events');
  console.log('- network_requests.log: Should show requests from both main frame and iframes');
  console.log('- Each dynamically loaded iframe should have its complete HTML captured immediately');

  await browser.close();
}

// Run the test if called directly
if (require.main === module) {
  testEnhancedIframeCapture().catch(console.error);
}

module.exports = { testEnhancedIframeCapture };
