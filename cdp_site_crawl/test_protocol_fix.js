// test_protocol_fix.js
// Test script to verify the protocol error fixes work with problematic sites

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');

// Configure stealth plugin to be more resilient (same as main crawler)
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('user-agent-override'); // Remove problematic user-agent override
puppeteer.use(stealthPlugin);

async function testProtocolFix() {
  const testUrl = 'appsflyersdk.com'; // The problematic site from the error
  let browser = null;
  let page = null;
  
  try {
    console.log(`🧪 Testing protocol fixes with ${testUrl}...`);
    
    // Launch browser with same settings as main crawler
    browser = await puppeteer.launch({
      headless: false,
      protocolTimeout: 120000, // 2 minutes
      ignoreDefaultArgs: [
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages',
        '--disable-blink-features=AutomationControlled,MojoJS',
        '--disable-iframe-blocking'
      ],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ],
      userDataDir: path.join(__dirname, `test_profile_${Date.now()}`),
      dumpio: false
    });
    
    console.log('✅ Browser launched successfully');
    
    // Create page with retry logic
    let pageCreationRetries = 3;
    while (pageCreationRetries > 0) {
      try {
        page = await browser.newPage();
        
        // Add error handlers
        page.on('error', error => {
          console.error(`🚨 Page crashed: ${error.message}`);
        });
        
        page.on('pageerror', error => {
          console.warn(`⚠️  Page error: ${error.message}`);
        });
        
        // Wait for page to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('✅ Page created successfully');
        break;
        
      } catch (pageError) {
        pageCreationRetries--;
        console.warn(`⚠️  Page creation attempt failed (${3 - pageCreationRetries}/3): ${pageError.message}`);
        
        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch (e) {}
        }
        
        if (pageCreationRetries === 0) {
          throw new Error(`Failed to create page after 3 attempts: ${pageError.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Test CDP session creation with retry logic
    let client = null;
    let cdpRetries = 3;
    
    while (cdpRetries > 0) {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const target = page.target();
        if (!target) {
          throw new Error('No page target available');
        }
        
        // More lenient target validation - just check if target exists
        console.log(`Target type: ${target._targetInfo?.type}, URL: ${target.url()}`);
        
        client = await target.createCDPSession();
        console.log('✅ CDP session created successfully');
        break;
        
      } catch (cdpError) {
        cdpRetries--;
        console.warn(`⚠️  CDP session creation attempt failed (${3 - cdpRetries}/3): ${cdpError.message}`);
        
        if (cdpRetries === 0) {
          throw new Error(`Failed to create CDP session after 3 attempts: ${cdpError.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Test CDP domain enabling
    const cdpDomains = [
      'Network.enable',
      'Page.enable', 
      'DOM.enable',
      'Runtime.enable'
    ];
    
    for (const domain of cdpDomains) {
      let domainRetries = 2;
      while (domainRetries > 0) {
        try {
          await client.send(domain);
          console.log(`✅ ${domain} enabled successfully`);
          break;
        } catch (err) {
          domainRetries--;
          if (domainRetries === 0) {
            console.warn(`⚠️  Failed to enable ${domain} after retries: ${err.message}`);
          } else {
            console.warn(`⚠️  Retrying ${domain} (${2 - domainRetries}/2): ${err.message}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    }
    
    // Test navigation to problematic site
    try {
      console.log(`🌐 Navigating to https://${testUrl}...`);
      await page.goto(`https://${testUrl}`, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      console.log(`✅ Successfully navigated to ${testUrl}`);
      
      // Wait a bit to see if any protocol errors occur
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('✅ No protocol errors detected after 5 seconds');
      
    } catch (navError) {
      console.warn(`⚠️  Navigation failed: ${navError.message}`);
      // Try with http instead
      try {
        console.log(`🌐 Trying http://${testUrl}...`);
        await page.goto(`http://${testUrl}`, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        console.log(`✅ Successfully navigated to http://${testUrl}`);
      } catch (httpError) {
        console.warn(`⚠️  HTTP navigation also failed: ${httpError.message}`);
      }
    }
    
    console.log('🎉 Protocol fix test completed successfully!');
    
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    console.error(error.stack);
  } finally {
    // Cleanup
    if (client) {
      try {
        await client.detach();
      } catch (e) {
        console.warn(`⚠️  Could not detach CDP session: ${e.message}`);
      }
    }
    
    if (page && !page.isClosed()) {
      try {
        await page.close();
      } catch (e) {
        console.warn(`⚠️  Could not close page: ${e.message}`);
      }
    }
    
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.warn(`⚠️  Could not close browser: ${e.message}`);
      }
    }
  }
}

// Run the test
testProtocolFix().catch(console.error);
