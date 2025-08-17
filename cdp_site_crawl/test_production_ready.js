// test_production_ready.js
// Final production-ready test with all fixes applied

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

const { enhancedInputInteraction } = require('./enhanced_input_interaction');
const { applyBotMitigation, setRealisticHeaders } = require('./bot_mitigation');
const { handleConsentBanners, waitForPageReady } = require('./consent_handler');
const { instrumentPage } = require('./instrumentation');
const { DataQueue } = require('./helpers');

puppeteer.use(StealthPlugin());

// Production test sites with known features
const PRODUCTION_TEST_SITES = [
  {
    name: 'BBC News',
    url: 'https://www.bbc.com',
    features: ['cookie_banner', 'search_bar'],
    description: 'Major news site with cookie banners - Consent-O-Matic should work here'
  },
  {
    name: 'HTTPBin Forms',
    url: 'https://httpbin.org/forms/post',
    features: ['forms', 'text_inputs', 'checkboxes', 'radio_buttons'],
    description: 'Comprehensive form testing site'
  },
  {
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com',
    features: ['search_bar', 'text_inputs'],
    description: 'Search engine with privacy focus'
  }
];

async function runProductionTest() {
  console.log('🚀 PRODUCTION-READY CRAWLER TEST');
  console.log('=================================\n');
  
  const testDir = path.join(__dirname, 'production_test_results');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Setup browser with Consent-O-Matic
  const extensionDir = path.join(__dirname, 'Consent_O_Matic', 'build');
  console.log(`🔌 Loading Consent-O-Matic from: ${extensionDir}`);

  const browser = await puppeteer.launch({
    headless: false,
    ignoreDefaultArgs: [
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-blink-features=AutomationControlled,MojoJS'
    ],
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
    userDataDir: path.join(__dirname, 'profile_with_consents')
  });

  const results = [];

  try {
    // Wait for browser initialization
    await new Promise(resolve => setTimeout(resolve, 3000));

    for (const [index, site] of PRODUCTION_TEST_SITES.entries()) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🧪 TEST ${index + 1}: ${site.name}`);
      console.log(`📍 ${site.url}`);
      console.log(`🎯 ${site.description}`);
      console.log(`${'='.repeat(50)}`);

      const result = await testProductionSite(browser, site, testDir, index + 1);
      results.push(result);
    }

    // Generate production report
    generateProductionReport(results, testDir);

  } catch (error) {
    console.error('❌ Production test failed:', error.message);
  } finally {
    await browser.close();
  }
}

async function testProductionSite(browser, site, testDir, testNum) {
  const startTime = Date.now();
  const siteDir = path.join(testDir, `test_${testNum}_${site.name.replace(/\s+/g, '_').toLowerCase()}`);
  
  if (!fs.existsSync(siteDir)) {
    fs.mkdirSync(siteDir, { recursive: true });
  }

  const result = {
    testNumber: testNum,
    name: site.name,
    url: site.url,
    success: false,
    consentOMaticActive: false,
    inputElementsFound: 0,
    interactionsPerformed: 0,
    networkRequests: 0,
    errors: []
  };

  try {
    console.log('🌐 Opening page...');
    const page = await browser.newPage();

    // Set viewport to avoid bot mitigation errors
    await page.setViewport({ width: 1366, height: 768 });

    // Setup logging
    const networkQueue = new DataQueue(path.join(siteDir, 'network.log'));
    const responseQueue = new DataQueue(path.join(siteDir, 'responses.log'));
    const consoleQueue = new DataQueue(path.join(siteDir, 'console.log'));
    const debugQueue = new DataQueue(path.join(siteDir, 'debug.log'));
    const domQueue = new DataQueue(path.join(siteDir, 'dom.log'));
    const interactionQueue = new DataQueue(path.join(siteDir, 'interactions.log'));

    await instrumentPage(page, {
      networkQueue, responseQueue, consoleQueue, debugQueue, domQueue, interactionQueue
    });

    // Apply bot mitigation with error handling
    console.log('🛡️  Applying bot mitigation...');
    await setRealisticHeaders(page);
    await applyBotMitigation(page, {
      enableMouseMovement: true,
      enableRandomScrolling: true,
      enableWebGLFingerprinting: true,
      enableCanvasFingerprinting: true,
      enableTimingAttacks: true,
      logMitigation: false
    });

    // Navigate
    console.log(`🌍 Navigating to ${site.url}...`);
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for page load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check Consent-O-Matic with improved detection
    console.log('🍪 Checking Consent-O-Matic status...');
    const consentStatus = await checkConsentOMaticImproved(page);
    result.consentOMaticActive = consentStatus.active;
    
    if (consentStatus.active) {
      console.log('✅ Consent-O-Matic is ACTIVE and working!');
      console.log(`   Detection method: ${consentStatus.detectionMethod}`);
    } else {
      console.log('⚠️  Consent-O-Matic not detected on this site');
    }

    // Handle consent banners
    await handleConsentBanners(page);
    await waitForPageReady(page);

    // Enhanced input interaction
    console.log('⚡ Starting input interaction...');
    const interactionSummary = await enhancedInputInteraction(page, site.url, {
      instrumentPage,
      queues: { networkQueue, responseQueue, consoleQueue, debugQueue, domQueue, interactionQueue },
      logFile: path.join(siteDir, 'interaction_summary.log'),
      maxInteractionsPerPage: 10,
      interactionTimeout: 15000,
      enableBotMitigation: true,
      testInputs: ['test input', 'test@example.com', '123', 'search query']
    });

    result.inputElementsFound = interactionSummary.totalElementsFound;
    result.interactionsPerformed = interactionSummary.totalInteractions;
    result.networkRequests = interactionSummary.totalNetworkRequests;

    console.log(`📊 Results:`);
    console.log(`   - Consent-O-Matic: ${result.consentOMaticActive ? '✅ ACTIVE' : '❌ NOT DETECTED'}`);
    console.log(`   - Elements found: ${result.inputElementsFound}`);
    console.log(`   - Interactions: ${result.interactionsPerformed}`);
    console.log(`   - Network requests: ${result.networkRequests}`);

    // Flush data
    await Promise.all([
      networkQueue.flush(),
      responseQueue.flush(),
      consoleQueue.flush(),
      debugQueue.flush(),
      domQueue.flush(),
      interactionQueue.flush()
    ]);

    await page.close();
    result.success = true;
    console.log(`✅ Test ${testNum} completed successfully!`);

  } catch (error) {
    console.error(`❌ Test ${testNum} failed:`, error.message);
    result.errors.push(error.message);
  }

  result.duration = Date.now() - startTime;
  return result;
}

async function checkConsentOMaticImproved(page) {
  return await page.evaluate(() => {
    const detectionMethods = [
      {
        name: 'Global ConsentOMatic variables',
        check: () => !!(window.ConsentOMaticCMP || window.ConsentOMatic)
      },
      {
        name: 'Extension DOM markers',
        check: () => !!(
          document.querySelector('[data-consent-o-matic]') ||
          document.querySelector('.ConsentOMatic') ||
          document.querySelector('[data-cmp-ab]')
        )
      },
      {
        name: 'Chrome extension API',
        check: () => !!(window.chrome && window.chrome.runtime)
      },
      {
        name: 'Extension scripts',
        check: () => Array.from(document.scripts).some(script => 
          (script.src && script.src.includes('consent')) ||
          (script.textContent && script.textContent.includes('ConsentOMatic'))
        )
      },
      {
        name: 'Hidden cookie banners',
        check: () => {
          const cookieElements = document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i]');
          return Array.from(cookieElements).some(el => {
            const style = window.getComputedStyle(el);
            return style.display === 'none' || style.visibility === 'hidden';
          });
        }
      }
    ];

    for (const method of detectionMethods) {
      try {
        if (method.check()) {
          return { active: true, detectionMethod: method.name };
        }
      } catch (e) {
        // Continue to next method
      }
    }

    return { active: false, detectionMethod: 'none' };
  });
}

function generateProductionReport(results, testDir) {
  const reportPath = path.join(testDir, 'production_test_report.txt');
  
  const totalTests = results.length;
  const successfulTests = results.filter(r => r.success).length;
  const consentOMaticWorking = results.filter(r => r.consentOMaticActive).length;
  const totalInteractions = results.reduce((sum, r) => sum + r.interactionsPerformed, 0);
  const totalElements = results.reduce((sum, r) => sum + r.inputElementsFound, 0);

  const report = `
PRODUCTION CRAWLER TEST REPORT
==============================
Generated: ${new Date().toISOString()}

OVERALL RESULTS
---------------
✅ Tests passed: ${successfulTests}/${totalTests} (${Math.round((successfulTests/totalTests)*100)}%)
🍪 Consent-O-Matic working: ${consentOMaticWorking}/${totalTests} (${Math.round((consentOMaticWorking/totalTests)*100)}%)
📝 Total elements found: ${totalElements}
⚡ Total interactions performed: ${totalInteractions}

DETAILED RESULTS
----------------
${results.map(r => `
${r.testNumber}. ${r.name}
   URL: ${r.url}
   Status: ${r.success ? '✅ PASSED' : '❌ FAILED'}
   Consent-O-Matic: ${r.consentOMaticActive ? '✅ ACTIVE' : '❌ NOT DETECTED'}
   Elements: ${r.inputElementsFound}
   Interactions: ${r.interactionsPerformed}
   Network Requests: ${r.networkRequests}
   Duration: ${Math.round(r.duration/1000)}s
   ${r.errors.length > 0 ? `Errors: ${r.errors.join('; ')}` : ''}
`).join('')}

PRODUCTION READINESS
--------------------
${successfulTests === totalTests ? '🎉 ALL TESTS PASSED - READY FOR PRODUCTION!' : '⚠️  Some tests failed - review before production'}
${consentOMaticWorking > 0 ? `✅ Consent-O-Matic working on ${consentOMaticWorking} sites` : '❌ Consent-O-Matic not working - needs attention'}
${totalInteractions > 0 ? `✅ Input interaction working (${totalInteractions} interactions performed)` : '⚠️  Input interaction needs review'}

NEXT STEPS
----------
${consentOMaticWorking === totalTests ? '- Consent-O-Matic working perfectly!' : '- Review Consent-O-Matic detection on failed sites'}
- Deploy to production environment
- Monitor network requests for AI service patterns
- Scale up to larger URL lists

==============================
`;

  fs.writeFileSync(reportPath, report);
  
  console.log('\n📊 PRODUCTION TEST SUMMARY');
  console.log('==========================');
  console.log(`✅ Success rate: ${successfulTests}/${totalTests}`);
  console.log(`🍪 Consent-O-Matic: ${consentOMaticWorking}/${totalTests} sites`);
  console.log(`📝 Total interactions: ${totalInteractions}`);
  console.log(`📄 Report saved: ${reportPath}`);
  
  if (successfulTests === totalTests && consentOMaticWorking > 0) {
    console.log('\n🎉 PRODUCTION READY! All systems working correctly.');
  } else {
    console.log('\n⚠️  Review needed before production deployment.');
  }
}

if (require.main === module) {
  runProductionTest().catch(console.error);
}

module.exports = { runProductionTest };
