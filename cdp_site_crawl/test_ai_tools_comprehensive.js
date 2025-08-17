#!/usr/bin/env node

/**
 * Comprehensive test for AI tools and chatbot detection
 * Tests dynamic iframe detection, generic detection patterns, and interaction logging
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
const { InteractionLogger } = require('./interaction_logger');

puppeteer.use(StealthPlugin());

// Test sites with known AI tools and chatbots + user-specified FSSAI site
const AI_TOOL_TEST_SITES = [
  {
    name: 'OpenAI',
    url: 'https://openai.com',
    expectedFeatures: ['chatbot', 'search', 'forms'],
    description: 'OpenAI homepage with chat interface',
    expectedAITools: ['ChatGPT interface', 'Search functionality', 'Contact forms']
  },
  {
    name: 'Intercom',
    url: 'https://www.intercom.com',
    expectedFeatures: ['chatbot', 'forms'],
    description: 'Intercom - known for chat widgets',
    expectedAITools: ['Intercom Messenger widget', 'Live chat', 'Support bot']
  },
  {
    name: 'Zendesk',
    url: 'https://www.zendesk.com',
    expectedFeatures: ['chatbot', 'search', 'forms'],
    description: 'Zendesk - customer support with chat',
    expectedAITools: ['Zendesk Chat widget', 'Answer Bot', 'Search bar', 'Contact forms']
  },
  {
    name: 'Drift',
    url: 'https://www.drift.com',
    expectedFeatures: ['chatbot', 'forms'],
    description: 'Drift - conversational marketing platform',
    expectedAITools: ['Drift chat widget', 'Conversational AI', 'Lead capture forms']
  },
  {
    name: 'HubSpot',
    url: 'https://www.hubspot.com',
    expectedFeatures: ['chatbot', 'search', 'forms'],
    description: 'HubSpot - CRM with chat features',
    expectedAITools: ['HubSpot chat widget', 'ChatBot', 'Search functionality', 'Demo forms']
  },
  {
    name: 'FSSAI_Standard_Product',
    url: 'https://fctest.fssai.gov.in/standard-product',
    expectedFeatures: ['forms', 'search'],
    description: 'FSSAI Standard Product page - Government site with forms',
    expectedAITools: ['Product search forms', 'Filter forms', 'Government service forms', 'Possible chat support']
  }
];

async function testAIToolsComprehensive() {
  console.log('🤖 COMPREHENSIVE AI TOOLS & CHATBOT DETECTION TEST');
  console.log('==================================================');
  console.log('Testing:');
  console.log('  ✅ Dynamic iframe detection');
  console.log('  ✅ Generic regex-based detection');
  console.log('  ✅ AI tool interaction logging');
  console.log('  ✅ Consent-O-Matic integration');
  console.log('  ✅ No interaction limits\n');
  
  const testDir = path.join(__dirname, 'ai_tools_test_results');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Launch browser in non-headless mode with Consent-O-Matic extension
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
    userDataDir: path.join(__dirname, `user_data_ai_test_${Date.now()}`)
  });
  console.log('✅ Browser launched successfully with Consent-O-Matic extension');

  const testResults = [];

  try {
    for (const site of AI_TOOL_TEST_SITES) {
      console.log(`\n🎯 Testing: ${site.name} (${site.url})`);
      console.log(`   Expected: ${site.expectedFeatures.join(', ')}`);
      console.log(`   Description: ${site.description}`);
      
      const siteDir = path.join(testDir, `test_${site.name.toLowerCase().replace(/\s+/g, '_')}`);
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
          waitUntil: 'networkidle0', 
          timeout: 30000 
        });

        // Handle consent banners
        console.log('  🍪 Handling consent banners...');
        const consentHandled = await handleConsentBanners(page);

        // Wait for dynamic content to load
        console.log('  ⏳ Waiting for dynamic content...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Perform generic detection
        console.log('  🔍 Performing generic detection...');
        const genericDetectionResults = await performGenericDetection(page);
        
        console.log(`     - Search elements found: ${genericDetectionResults.searchElements?.length || 0}`);
        console.log(`     - Chatbots found: ${genericDetectionResults.chatbots?.length || 0}`);
        console.log(`     - Iframe chatbots found: ${genericDetectionResults.iframeChatbots?.length || 0}`);

        // Enhanced input interaction with no limits
        console.log('  🎯 Starting enhanced input interaction (no limits)...');
        const interactionResults = await enhancedInputInteraction(page, site.url, {
          instrumentPage,
          queues,
          logFile: path.join(siteDir, 'interaction_summary.log'),
          maxInteractionsPerPage: Infinity, // No limit for comprehensive testing
          interactionTimeout: 20000,
          enableBotMitigation: true,
          genericDetectionResults: genericDetectionResults
        });

        // Save detailed logs
        console.log('  💾 Saving detailed logs...');
        
        // Save network requests
        fs.writeFileSync(
          path.join(siteDir, 'network_requests.json'),
          JSON.stringify(networkQueue.items, null, 2)
        );

        // Save responses
        fs.writeFileSync(
          path.join(siteDir, 'responses.json'),
          JSON.stringify(responseQueue.items, null, 2)
        );

        // Save console logs
        fs.writeFileSync(
          path.join(siteDir, 'console.log'),
          consoleQueue.items.map(item => `[${new Date(item.ts).toISOString()}] ${item.type}: ${item.text}`).join('\n')
        );

        // Save interaction logs
        fs.writeFileSync(
          path.join(siteDir, 'interactions.json'),
          JSON.stringify(interactionQueue.items, null, 2)
        );

        // Save generic detection results
        fs.writeFileSync(
          path.join(siteDir, 'generic_detection.json'),
          JSON.stringify(genericDetectionResults, null, 2)
        );

        // Save DOM snapshot
        const domContent = await page.content();
        fs.writeFileSync(path.join(siteDir, 'dom_snapshot.html'), domContent);

        // Analyze results
        const aiToolsDetected = [];
        
        // Check for chatbot interactions in network requests
        const chatbotRequests = networkQueue.items.filter(req => 
          req.url && (
            /chat/i.test(req.url) || 
            /bot/i.test(req.url) || 
            /widget/i.test(req.url) ||
            /intercom/i.test(req.url) ||
            /zendesk/i.test(req.url) ||
            /drift/i.test(req.url) ||
            /hubspot/i.test(req.url)
          )
        );

        if (chatbotRequests.length > 0) {
          aiToolsDetected.push('chatbot_network_activity');
        }

        // Check for AI-related form submissions
        const aiFormSubmissions = networkQueue.items.filter(req => 
          req.method === 'POST' && req.postData && (
            /chat/i.test(req.postData) ||
            /message/i.test(req.postData) ||
            /query/i.test(req.postData)
          )
        );

        if (aiFormSubmissions.length > 0) {
          aiToolsDetected.push('ai_form_submissions');
        }

        // Check generic detection results
        if (genericDetectionResults.chatbots?.length > 0) {
          aiToolsDetected.push('generic_chatbot_detection');
        }
        if (genericDetectionResults.iframeChatbots?.length > 0) {
          aiToolsDetected.push('iframe_chatbot_detection');
        }
        if (genericDetectionResults.searchElements?.length > 0) {
          aiToolsDetected.push('search_element_detection');
        }

        const testResult = {
          site: site.name,
          url: site.url,
          timestamp: new Date().toISOString(),
          consentHandled,
          genericDetection: genericDetectionResults,
          interactionResults,
          aiToolsDetected,
          networkRequests: networkQueue.items.length,
          chatbotRequests: chatbotRequests.length,
          aiFormSubmissions: aiFormSubmissions.length,
          consoleMessages: consoleQueue.items.length,
          success: true
        };

        testResults.push(testResult);

        // Generate detailed analysis report for manual examination
        const detailedAnalysis = {
          site: site.name,
          url: site.url,
          expectedAITools: site.expectedAITools,
          detectedAITools: aiToolsDetected,
          genericDetectionResults: genericDetectionResults,
          networkAnalysis: {
            totalRequests: networkQueue.items.length,
            chatbotRequests: chatbotRequests.map(req => ({
              url: req.url,
              method: req.method,
              postData: req.postData ? req.postData.substring(0, 200) : null
            })),
            aiFormSubmissions: aiFormSubmissions.map(req => ({
              url: req.url,
              postData: req.postData ? req.postData.substring(0, 200) : null
            }))
          },
          interactionSummary: {
            totalInteractions: interactionResults?.totalInteractions || 0,
            successfulInteractions: interactionResults?.successfulInteractions || 0,
            failedInteractions: interactionResults?.failedInteractions || 0
          }
        };

        // Save detailed analysis for manual review
        fs.writeFileSync(
          path.join(siteDir, 'MANUAL_REVIEW_ANALYSIS.json'),
          JSON.stringify(detailedAnalysis, null, 2)
        );

        // Create human-readable summary
        const humanReadableSummary = `
=== MANUAL REVIEW SUMMARY FOR ${site.name.toUpperCase()} ===
URL: ${site.url}
Test Date: ${new Date().toISOString()}

EXPECTED AI TOOLS:
${site.expectedAITools.map(tool => `  • ${tool}`).join('\n')}

DETECTED AI TOOLS:
${aiToolsDetected.length > 0 ? aiToolsDetected.map(tool => `  ✅ ${tool}`).join('\n') : '  ❌ No AI tools detected'}

GENERIC DETECTION RESULTS:
  • Search Elements Found: ${genericDetectionResults.searchElements?.length || 0}
  • Chatbots Found: ${genericDetectionResults.chatbots?.length || 0}
  • Iframe Chatbots Found: ${genericDetectionResults.iframeChatbots?.length || 0}

NETWORK ACTIVITY:
  • Total Requests: ${networkQueue.items.length}
  • Chatbot-related Requests: ${chatbotRequests.length}
  • AI Form Submissions: ${aiFormSubmissions.length}

INTERACTION RESULTS:
  • Total Interactions: ${interactionResults?.totalInteractions || 0}
  • Successful: ${interactionResults?.successfulInteractions || 0}
  • Failed: ${interactionResults?.failedInteractions || 0}

FILES TO EXAMINE:
  • network_requests.json - All network requests captured
  • responses.json - All responses with body content
  • interactions.json - Detailed interaction logs
  • generic_detection.json - Generic detection results
  • console.log - Browser console messages
  • dom_snapshot.html - Final DOM state
  • interaction_summary.log - Human-readable interaction log

WHAT TO LOOK FOR IN LOGS:
  • Search for "chat", "bot", "widget" in network requests
  • Check for iframe URLs containing chat services
  • Look for form submissions with AI-related data
  • Examine console messages for chat widget initialization
  • Check DOM snapshot for hidden chat elements
`;

        fs.writeFileSync(
          path.join(siteDir, 'MANUAL_REVIEW_SUMMARY.txt'),
          humanReadableSummary
        );

        console.log(`  ✅ ${site.name} test completed successfully`);
        console.log(`     - Expected AI tools: ${site.expectedAITools.length}`);
        console.log(`     - AI tools detected: ${aiToolsDetected.join(', ') || 'none'}`);
        console.log(`     - Network requests: ${networkQueue.items.length}`);
        console.log(`     - Chatbot requests: ${chatbotRequests.length}`);
        console.log(`     - Interactions performed: ${interactionResults?.totalInteractions || 0}`);
        console.log(`     - 📁 Manual review files saved to: ${siteDir}`);

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

    // Generate comprehensive report
    const report = {
      testType: 'AI Tools & Chatbot Detection',
      timestamp: new Date().toISOString(),
      totalSites: AI_TOOL_TEST_SITES.length,
      successfulTests: testResults.filter(r => r.success).length,
      failedTests: testResults.filter(r => !r.success).length,
      results: testResults,
      summary: {
        sitesWithChatbots: testResults.filter(r => r.success && r.aiToolsDetected?.includes('generic_chatbot_detection')).length,
        sitesWithIframeChatbots: testResults.filter(r => r.success && r.aiToolsDetected?.includes('iframe_chatbot_detection')).length,
        sitesWithSearchElements: testResults.filter(r => r.success && r.aiToolsDetected?.includes('search_element_detection')).length,
        sitesWithAIFormSubmissions: testResults.filter(r => r.success && r.aiToolsDetected?.includes('ai_form_submissions')).length,
        totalNetworkRequests: testResults.reduce((sum, r) => sum + (r.networkRequests || 0), 0),
        totalChatbotRequests: testResults.reduce((sum, r) => sum + (r.chatbotRequests || 0), 0)
      }
    };

    fs.writeFileSync(
      path.join(testDir, 'comprehensive_ai_test_report.json'),
      JSON.stringify(report, null, 2)
    );

    // Print final summary
    console.log('\n🎉 COMPREHENSIVE AI TOOLS TEST COMPLETED');
    console.log('=========================================');
    console.log(`✅ Successful tests: ${report.successfulTests}/${report.totalSites}`);
    console.log(`🤖 Sites with chatbots detected: ${report.summary.sitesWithChatbots}`);
    console.log(`🖼️  Sites with iframe chatbots: ${report.summary.sitesWithIframeChatbots}`);
    console.log(`🔍 Sites with search elements: ${report.summary.sitesWithSearchElements}`);
    console.log(`📝 Sites with AI form submissions: ${report.summary.sitesWithAIFormSubmissions}`);
    console.log(`🌐 Total network requests captured: ${report.summary.totalNetworkRequests}`);
    console.log(`💬 Total chatbot-related requests: ${report.summary.totalChatbotRequests}`);
    console.log(`\n📁 Detailed results saved to: ${testDir}`);

    if (report.failedTests > 0) {
      console.log(`\n⚠️  ${report.failedTests} tests failed. Check individual logs for details.`);
    }

  } catch (error) {
    console.error('❌ Test suite failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the test if called directly
if (require.main === module) {
  testAIToolsComprehensive().catch(console.error);
}

module.exports = { testAIToolsComprehensive };
