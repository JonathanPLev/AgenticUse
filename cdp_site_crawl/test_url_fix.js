#!/usr/bin/env node

/**
 * Simple test to verify URL navigation fix
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { enhancedInputInteraction } = require('./enhanced_input_interaction');
const { instrumentPage } = require('./instrumentation');

puppeteer.use(StealthPlugin());

async function testURLFix() {
  console.log('🔧 TESTING URL NAVIGATION FIX');
  console.log('=============================');
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1366, height: 768 }
  });

  try {
    const page = await browser.newPage();
    
    // Test with a simple, reliable site
    const testUrl = 'https://httpbin.org/forms/post';
    console.log(`🌐 Testing with: ${testUrl}`);
    
    await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
    
    // Set up basic queues
    const networkQueue = { items: [], enqueue: (item) => networkQueue.items.push(item) };
    const responseQueue = { items: [], enqueue: (item) => responseQueue.items.push(item) };
    const consoleQueue = { items: [], enqueue: (item) => consoleQueue.items.push(item) };
    const debugQueue = { items: [], enqueue: (item) => debugQueue.items.push(item) };
    const domQueue = { items: [], enqueue: (item) => domQueue.items.push(item) };
    const interactionQueue = { items: [], enqueue: (item) => interactionQueue.items.push(item) };

    const queues = { networkQueue, responseQueue, consoleQueue, debugQueue, domQueue, interactionQueue };

    // Test enhanced input interaction with limited interactions
    console.log('🎯 Testing enhanced input interaction...');
    const result = await enhancedInputInteraction(page, 'https://httpbin.org/forms/post', {
      instrumentPage,
      queues,
      maxInteractionsPerPage: 3, // Limit to 3 for testing
      interactionTimeout: 10000,
      enableBotMitigation: true
    });

    console.log('✅ Test completed successfully!');
    console.log(`   - Total interactions: ${result.totalInteractions}`);
    console.log(`   - Successful interactions: ${result.successfulInteractions}`);
    console.log(`   - Failed interactions: ${result.failedInteractions}`);
    
    if (result.failedInteractions === 0) {
      console.log('🎉 URL navigation fix is working correctly!');
    } else {
      console.log('⚠️  Some interactions still failed, but URL errors should be handled gracefully');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  testURLFix().catch(console.error);
}

module.exports = { testURLFix };
