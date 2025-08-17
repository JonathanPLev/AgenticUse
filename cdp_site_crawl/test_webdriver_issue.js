// test_webdriver_issue.js
// Quick test to understand the webdriver property redefinition issue

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Test with minimal stealth configuration
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('user-agent-override');
puppeteer.use(stealthPlugin);

async function testWebdriverIssue() {
  console.log('🧪 Testing webdriver property redefinition issue...');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Test the webdriver property override
    await page.evaluateOnNewDocument(() => {
      console.log('Initial webdriver value:', navigator.webdriver);
      
      try {
        // This is what's causing the error - trying to redefine a non-configurable property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        });
        console.log('✅ Successfully redefined webdriver property');
      } catch (error) {
        console.error('❌ Failed to redefine webdriver property:', error.message);
        
        // Check if property is already defined and non-configurable
        const descriptor = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
        console.log('Property descriptor:', descriptor);
        
        // Try alternative approach
        try {
          delete navigator.webdriver;
          navigator.webdriver = undefined;
          console.log('✅ Alternative approach succeeded');
        } catch (altError) {
          console.error('❌ Alternative approach failed:', altError.message);
        }
      }
    });

    await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Check final webdriver value
    const webdriverValue = await page.evaluate(() => navigator.webdriver);
    console.log('Final webdriver value:', webdriverValue);
    
  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  testWebdriverIssue().catch(console.error);
}

module.exports = { testWebdriverIssue };
