// verify_consent_o_matic.js
// Dedicated script to verify Consent-O-Matic extension is working properly

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function verifyConsentOMatic() {
  console.log('🔍 Verifying Consent-O-Matic Extension...\n');

  const extensionDir = path.join(__dirname, 'Consent_O_Matic', 'build');
  
  // Check if extension exists
  if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
    console.error('❌ Consent-O-Matic extension not found!');
    console.log('Expected location:', extensionDir);
    return false;
  }

  console.log('✅ Extension files found at:', extensionDir);

  // Read manifest to verify extension
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'));
  console.log('📄 Extension manifest:');
  console.log(`   Name: ${manifest.name}`);
  console.log(`   Version: ${manifest.version}`);
  console.log(`   Description: ${manifest.description}`);

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
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-running-insecure-requests'
    ],
    userDataDir: path.join(__dirname, 'profile_with_consents')
  });

  try {
    // Wait for browser to initialize
    console.log('🚀 Launching browser with extension...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const page = await browser.newPage();
    
    // Test on a site with known cookie banners
    const testSites = [
      'https://www.bbc.com',
      'https://www.cnn.com',
      'https://www.theguardian.com'
    ];

    for (const testUrl of testSites) {
      console.log(`\n🌐 Testing on: ${testUrl}`);
      
      try {
        await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for extension to potentially work
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check for extension activity
        const extensionActive = await page.evaluate(() => {
          // Multiple detection methods
          const detectionMethods = [
            // Global variables
            () => !!(window.ConsentOMaticCMP || window.ConsentOMatic),
            
            // Extension-specific elements
            () => !!document.querySelector('[data-consent-o-matic]'),
            () => !!document.querySelector('.ConsentOMatic'),
            
            // Check for extension scripts in page
            () => Array.from(document.scripts).some(script => 
              script.src && (script.src.includes('consent') || script.src.includes('extension'))
            ),
            
            // Check Chrome extension API
            () => !!(window.chrome && window.chrome.runtime),
            
            // Look for signs of cookie banner manipulation
            () => {
              const cookieElements = document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i]');
              return Array.from(cookieElements).some(el => {
                const style = window.getComputedStyle(el);
                return style.display === 'none' || style.visibility === 'hidden';
              });
            }
          ];
          
          const results = detectionMethods.map((method, index) => {
            try {
              const result = method();
              return { method: index + 1, result };
            } catch (e) {
              return { method: index + 1, result: false, error: e.message };
            }
          });
          
          return {
            anyActive: results.some(r => r.result),
            results: results,
            userAgent: navigator.userAgent,
            extensions: window.chrome ? 'Chrome API available' : 'No Chrome API'
          };
        });
        
        console.log(`🔍 Extension detection results:`);
        console.log(`   Extension active: ${extensionActive.anyActive ? '✅ YES' : '❌ NO'}`);
        console.log(`   Chrome API: ${extensionActive.extensions}`);
        
        if (extensionActive.anyActive) {
          console.log('✅ Consent-O-Matic appears to be working!');
        } else {
          console.log('⚠️  Extension not detected on this site');
          console.log('   Detection method results:', extensionActive.results);
        }
        
      } catch (error) {
        console.error(`❌ Error testing ${testUrl}:`, error.message);
      }
    }

    // Test extension permissions and content script injection
    console.log('\n🔧 Testing extension permissions...');
    
    const extensionPages = await browser.pages();
    console.log(`📄 Total pages open: ${extensionPages.length}`);
    
    // Check if extension background page exists
    const targets = await browser.targets();
    const extensionTargets = targets.filter(target => target.type() === 'background_page');
    console.log(`🔌 Extension background pages: ${extensionTargets.length}`);
    
    if (extensionTargets.length > 0) {
      console.log('✅ Extension background page detected - extension is loaded!');
    } else {
      console.log('⚠️  No extension background page found');
    }

    await page.close();
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  } finally {
    await browser.close();
  }

  console.log('\n📊 Consent-O-Matic verification completed');
  return true;
}

// Run verification if this file is executed directly
if (require.main === module) {
  verifyConsentOMatic().then(success => {
    if (success) {
      console.log('\n🎉 Consent-O-Matic verification successful!');
    } else {
      console.log('\n❌ Consent-O-Matic verification failed!');
      process.exit(1);
    }
  }).catch(console.error);
}

module.exports = { verifyConsentOMatic };
