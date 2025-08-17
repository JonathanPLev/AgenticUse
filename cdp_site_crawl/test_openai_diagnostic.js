#!/usr/bin/env node

/**
 * Diagnostic test specifically for OpenAI site to understand why it's failing early
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

const { enhancedInputInteraction } = require('./enhanced_input_interaction');
const { applyBotMitigation } = require('./bot_mitigation');
const { instrumentPage } = require('./instrumentation');

puppeteer.use(StealthPlugin());

async function testOpenAIDiagnostic() {
  console.log('🔍 OPENAI DIAGNOSTIC TEST');
  console.log('=========================');
  console.log('Testing why OpenAI folder is empty\n');
  
  const testDir = path.join(__dirname, 'openai_diagnostic_results');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  let browser;
  
  try {
    console.log('🚀 Launching browser...');
    browser = await puppeteer.launch({
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
    console.log('✅ Browser launched successfully');

    const page = await browser.newPage();
    
    try {
      console.log('📝 Creating log file...');
      const logFile = path.join(testDir, 'diagnostic.log');
      fs.writeFileSync(logFile, `OpenAI Diagnostic Test Started: ${new Date().toISOString()}\n`);
      
      // Set up basic logging
      const networkQueue = { items: [], enqueue: (item) => {
        networkQueue.items.push(item);
        fs.appendFileSync(logFile, `Network: ${item.url}\n`);
      }};
      const responseQueue = { items: [], enqueue: (item) => responseQueue.items.push(item) };
      const consoleQueue = { items: [], enqueue: (item) => {
        consoleQueue.items.push(item);
        fs.appendFileSync(logFile, `Console: ${JSON.stringify(item)}\n`);
      }};
      const debugQueue = { items: [], enqueue: (item) => debugQueue.items.push(item) };
      const domQueue = { items: [], enqueue: (item) => domQueue.items.push(item) };
      const interactionQueue = { items: [], enqueue: (item) => interactionQueue.items.push(item) };

      const queues = { networkQueue, responseQueue, consoleQueue, debugQueue, domQueue, interactionQueue };

      console.log('📊 Setting up instrumentation...');
      await instrumentPage(page, queues);
      fs.appendFileSync(logFile, 'Instrumentation setup complete\n');

      console.log('🛡️  Applying bot mitigation...');
      await applyBotMitigation(page);
      fs.appendFileSync(logFile, 'Bot mitigation applied\n');

      console.log('🌐 Navigating to OpenAI...');
      fs.appendFileSync(logFile, 'Starting navigation to https://openai.com\n');
      
      await page.goto('https://openai.com', { 
        waitUntil: 'networkidle0', 
        timeout: 30000 
      });
      
      console.log('✅ Navigation successful!');
      fs.appendFileSync(logFile, 'Navigation completed successfully\n');

      console.log('⏳ Waiting for page to load...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      fs.appendFileSync(logFile, 'Page load wait completed\n');

      console.log('🎯 Testing enhanced input interaction...');
      fs.appendFileSync(logFile, 'Starting enhanced input interaction\n');
      
      const interactionResults = await enhancedInputInteraction(page, 'https://openai.com', {
        instrumentPage,
        queues,
        logFile: path.join(testDir, 'interaction_summary.log'),
        maxInteractionsPerPage: 2, // Limit for testing
        interactionTimeout: 15000,
        enableBotMitigation: true
      });

      console.log('✅ Enhanced input interaction completed!');
      fs.appendFileSync(logFile, `Interaction completed: ${JSON.stringify(interactionResults)}\n`);

      // Save final results
      const result = {
        success: true,
        timestamp: new Date().toISOString(),
        url: 'https://openai.com',
        networkRequests: networkQueue.items.length,
        interactions: interactionResults?.totalInteractions || 0,
        elements: interactionResults?.totalElementsFound || 0
      };

      fs.writeFileSync(
        path.join(testDir, 'final_result.json'),
        JSON.stringify(result, null, 2)
      );

      fs.writeFileSync(
        path.join(testDir, 'network_requests.json'),
        JSON.stringify(networkQueue.items, null, 2)
      );

      console.log('\n🎉 OPENAI DIAGNOSTIC COMPLETED SUCCESSFULLY!');
      console.log('===========================================');
      console.log(`✅ Navigation: SUCCESS`);
      console.log(`🎯 Interactions: ${result.interactions}`);
      console.log(`📝 Elements found: ${result.elements}`);
      console.log(`🌐 Network requests: ${result.networkRequests}`);
      console.log(`📁 Results saved to: ${testDir}`);

      return true;

    } catch (error) {
      console.error(`❌ OpenAI test failed: ${error.message}`);
      
      const errorResult = {
        success: false,
        timestamp: new Date().toISOString(),
        url: 'https://openai.com',
        error: error.message,
        stack: error.stack
      };

      fs.writeFileSync(
        path.join(testDir, 'error_result.json'),
        JSON.stringify(errorResult, null, 2)
      );

      fs.appendFileSync(
        path.join(testDir, 'diagnostic.log'),
        `ERROR: ${error.message}\nSTACK: ${error.stack}\n`
      );

      return false;
    } finally {
      await page.close();
    }

  } catch (browserError) {
    console.error(`❌ Browser launch failed: ${browserError.message}`);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

if (require.main === module) {
  testOpenAIDiagnostic().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testOpenAIDiagnostic };
