#!/usr/bin/env node

/**
 * Production test for AI tools and chatbot detection on real sites
 * Generates detailed logs for manual examination
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Import our modules
const { applyBotMitigation } = require('./bot_mitigation');
const { handleConsentBanners } = require('./consent_handler');
const { instrumentPage } = require('./instrumentation');
const { enhancedInputInteraction } = require('./enhanced_input_interaction');
const { performGenericDetection } = require('./generic_detection');

puppeteer.use(StealthPlugin());

// Test sites including user-specified FSSAI site
const TEST_SITES = [
  {
    name: 'OpenAI',
    url: 'https://openai.com',
    expectedAITools: ['ChatGPT interface', 'Search functionality', 'Contact forms'],
    lookFor: ['chat interface', 'search bar', 'contact forms', 'AI assistant']
  },
  {
    name: 'Intercom',
    url: 'https://www.intercom.com',
    expectedAITools: ['Intercom Messenger widget', 'Live chat', 'Support bot'],
    lookFor: ['messenger widget', 'chat bubble', 'live chat', 'support bot']
  },
  {
    name: 'FSSAI_Standard_Product',
    url: 'https://fctest.fssai.gov.in/standard-product',
    expectedAITools: ['Product search forms', 'Filter forms', 'Government service forms'],
    lookFor: ['search forms', 'filter dropdowns', 'product search', 'form inputs']
  }
];

async function testProductionSites() {
  console.log('🚀 PRODUCTION SITE TESTING FOR AI TOOLS');
  console.log('=======================================');
  console.log('Sites to test:');
  TEST_SITES.forEach(site => {
    console.log(`  • ${site.name}: ${site.url}`);
    console.log(`    Expected: ${site.expectedAITools.join(', ')}`);
  });
  console.log('');
  
  const testDir = path.join(__dirname, 'production_test_results');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Launch browser with minimal configuration to avoid timeouts
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ],
    defaultViewport: { width: 1366, height: 768 }
  });

  const testResults = [];

  try {
    for (const site of TEST_SITES) {
      console.log(`\n🎯 Testing: ${site.name}`);
      console.log(`   URL: ${site.url}`);
      
      const siteDir = path.join(testDir, `${site.name.toLowerCase().replace(/\s+/g, '_')}`);
      if (!fs.existsSync(siteDir)) {
        fs.mkdirSync(siteDir, { recursive: true });
      }

      const page = await browser.newPage();
      
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
        const client = await instrumentPage(page, queues);

        // Apply bot mitigation
        console.log('  🛡️  Applying bot mitigation...');
        await applyBotMitigation(page);

        // Navigate to site
        console.log('  🌐 Navigating to site...');
        await page.goto(site.url, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });

        // Wait for initial load
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Handle consent banners
        console.log('  🍪 Handling consent banners...');
        const consentHandled = await handleConsentBanners(page);

        // Wait for dynamic content
        console.log('  ⏳ Waiting for dynamic content...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Perform generic detection
        console.log('  🔍 Performing generic detection...');
        const genericDetectionResults = await performGenericDetection(page);
        
        console.log(`     - Search elements: ${genericDetectionResults.searchElements?.length || 0}`);
        console.log(`     - Chatbots: ${genericDetectionResults.chatbots?.length || 0}`);
        console.log(`     - Iframe chatbots: ${genericDetectionResults.iframeChatbots?.length || 0}`);

        // Enhanced input interaction with 5 interaction limit
        console.log('  Starting enhanced input interaction (max 5 interactions)...');
        const interactionResults = await enhancedInputInteraction(page, site.url, {
          instrumentPage,
          queues,
          logFile: path.join(siteDir, 'interaction_summary.log'),
          maxInteractionsPerPage: 5, // Limit to 5 per site as requested
          interactionTimeout: 15000,
          enableBotMitigation: true,
          genericDetectionResults: genericDetectionResults
        });

        // Analyze for AI tools
        const aiToolsDetected = [];
        
        // Check network requests for AI/chat patterns
        const aiNetworkRequests = networkQueue.items.filter(req => 
          req.url && (
            /chat/i.test(req.url) || /bot/i.test(req.url) || /widget/i.test(req.url) ||
            /intercom/i.test(req.url) || /zendesk/i.test(req.url) || /drift/i.test(req.url) ||
            /openai/i.test(req.url) || /gpt/i.test(req.url) || /ai/i.test(req.url)
          )
        );

        if (aiNetworkRequests.length > 0) {
          aiToolsDetected.push('ai_network_activity');
        }

        if (genericDetectionResults.chatbots?.length > 0) {
          aiToolsDetected.push('generic_chatbot_detection');
        }
        if (genericDetectionResults.iframeChatbots?.length > 0) {
          aiToolsDetected.push('iframe_chatbot_detection');
        }
        if (genericDetectionResults.searchElements?.length > 0) {
          aiToolsDetected.push('search_element_detection');
        }

        // Save all logs
        console.log('  💾 Saving detailed logs...');
        
        // Network requests
        fs.writeFileSync(
          path.join(siteDir, 'network_requests.json'),
          JSON.stringify(networkQueue.items, null, 2)
        );

        // Responses
        fs.writeFileSync(
          path.join(siteDir, 'responses.json'),
          JSON.stringify(responseQueue.items, null, 2)
        );

        // Console logs
        fs.writeFileSync(
          path.join(siteDir, 'console.log'),
          consoleQueue.items.map(item => `[${new Date(item.ts).toISOString()}] ${item.type}: ${item.text}`).join('\n')
        );

        // Interactions
        fs.writeFileSync(
          path.join(siteDir, 'interactions.json'),
          JSON.stringify(interactionQueue.items, null, 2)
        );

        // Generic detection results
        fs.writeFileSync(
          path.join(siteDir, 'generic_detection.json'),
          JSON.stringify(genericDetectionResults, null, 2)
        );

        // DOM snapshot
        const domContent = await page.content();
        fs.writeFileSync(path.join(siteDir, 'dom_snapshot.html'), domContent);

        // Create detailed manual review summary
        const manualReviewSummary = `
=== MANUAL REVIEW SUMMARY FOR ${site.name.toUpperCase()} ===
URL: ${site.url}
Test Date: ${new Date().toISOString()}

EXPECTED AI TOOLS:
${site.expectedAITools.map(tool => `  • ${tool}`).join('\n')}

WHAT TO LOOK FOR:
${site.lookFor.map(item => `  • ${item}`).join('\n')}

DETECTED AI TOOLS:
${aiToolsDetected.length > 0 ? aiToolsDetected.map(tool => `  ✅ ${tool}`).join('\n') : '  ❌ No AI tools detected'}

GENERIC DETECTION RESULTS:
  • Search Elements Found: ${genericDetectionResults.searchElements?.length || 0}
  • Chatbots Found: ${genericDetectionResults.chatbots?.length || 0}
  • Iframe Chatbots Found: ${genericDetectionResults.iframeChatbots?.length || 0}

NETWORK ACTIVITY ANALYSIS:
  • Total Requests: ${networkQueue.items.length}
  • AI-related Requests: ${aiNetworkRequests.length}
  • AI Request URLs: ${aiNetworkRequests.map(req => req.url).slice(0, 10).join(', ')}

INTERACTION RESULTS:
  • Total Interactions: ${interactionResults?.totalInteractions || 0}
  • Successful: ${interactionResults?.successfulInteractions || 0}
  • Failed: ${interactionResults?.failedInteractions || 0}

FILES TO EXAMINE FOR AI TOOLS:
  1. network_requests.json - Search for "chat", "bot", "widget", "ai" in URLs
  2. generic_detection.json - Check searchElements and chatbots arrays
  3. interactions.json - Look for successful form interactions
  4. console.log - Search for chat widget initialization messages
  5. dom_snapshot.html - Inspect for hidden chat elements or search forms
  6. responses.json - Check response bodies for AI service indicators

KEY PATTERNS TO SEARCH FOR IN LOGS:
  • Network requests to chat services (intercom.io, zendesk.com, drift.com)
  • Form submissions with search or chat data
  • JavaScript console messages about chat widgets
  • DOM elements with chat/bot/search related IDs or classes
  • Iframe URLs pointing to chat services
  • AJAX requests to AI/search endpoints

SPECIFIC ANALYSIS FOR ${site.name}:
${site.name === 'FSSAI_Standard_Product' ? 
  '  • Look for government form interactions in interactions.json\n  • Check for product search functionality in generic_detection.json\n  • Examine form submission data in network_requests.json' :
  site.name === 'OpenAI' ?
  '  • Look for ChatGPT interface elements in dom_snapshot.html\n  • Check for AI-related network requests in network_requests.json\n  • Search console.log for chat initialization' :
  '  • Look for chat widget network requests\n  • Check iframe detection results\n  • Examine chat-related console messages'
}
`;

        fs.writeFileSync(
          path.join(siteDir, 'MANUAL_REVIEW_SUMMARY.txt'),
          manualReviewSummary
        );

        const testResult = {
          site: site.name,
          url: site.url,
          timestamp: new Date().toISOString(),
          consentHandled,
          genericDetection: genericDetectionResults,
          aiToolsDetected,
          networkRequests: networkQueue.items.length,
          aiNetworkRequests: aiNetworkRequests.length,
          interactions: interactionResults?.totalInteractions || 0,
          success: true
        };

        testResults.push(testResult);

        console.log(`  ✅ ${site.name} test completed`);
        console.log(`     - AI tools detected: ${aiToolsDetected.join(', ') || 'none'}`);
        console.log(`     - Network requests: ${networkQueue.items.length}`);
        console.log(`     - AI-related requests: ${aiNetworkRequests.length}`);
        console.log(`     - Interactions: ${interactionResults?.totalInteractions || 0}`);
        console.log(`     - 📁 Logs saved to: ${siteDir}`);

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
    }

    // Generate final report
    const finalReport = {
      testType: 'Production AI Tools Test',
      timestamp: new Date().toISOString(),
      totalSites: TEST_SITES.length,
      successfulTests: testResults.filter(r => r.success).length,
      results: testResults,
      summary: {
        sitesWithAITools: testResults.filter(r => r.success && r.aiToolsDetected?.length > 0).length,
        totalNetworkRequests: testResults.reduce((sum, r) => sum + (r.networkRequests || 0), 0),
        totalAIRequests: testResults.reduce((sum, r) => sum + (r.aiNetworkRequests || 0), 0),
        totalInteractions: testResults.reduce((sum, r) => sum + (r.interactions || 0), 0)
      }
    };

    fs.writeFileSync(
      path.join(testDir, 'FINAL_TEST_REPORT.json'),
      JSON.stringify(finalReport, null, 2)
    );

    // Print final summary
    console.log('\n🎉 PRODUCTION TESTING COMPLETED');
    console.log('===============================');
    console.log(`✅ Successful tests: ${finalReport.successfulTests}/${finalReport.totalSites}`);
    console.log(`🤖 Sites with AI tools: ${finalReport.summary.sitesWithAITools}`);
    console.log(`🌐 Total network requests: ${finalReport.summary.totalNetworkRequests}`);
    console.log(`🔍 AI-related requests: ${finalReport.summary.totalAIRequests}`);
    console.log(`🎯 Total interactions: ${finalReport.summary.totalInteractions}`);
    console.log(`\n📁 All logs saved to: ${testDir}`);
    console.log('\n📋 MANUAL EXAMINATION GUIDE:');
    console.log('Each site folder contains:');
    console.log('  • MANUAL_REVIEW_SUMMARY.txt - Start here for analysis guide');
    console.log('  • network_requests.json - All network activity');
    console.log('  • generic_detection.json - AI tool detection results');
    console.log('  • interactions.json - Form/input interactions');
    console.log('  • console.log - Browser console messages');
    console.log('  • dom_snapshot.html - Final page state');

  } catch (error) {
    console.error('❌ Test suite failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the test
if (require.main === module) {
  testProductionSites().catch(console.error);
}

module.exports = { testProductionSites };
