// bot_mitigation.js
// Enhanced bot mitigation techniques to run before any page interaction

const fs = require('fs');
const path = require('path');

/**
 * Advanced bot mitigation techniques to make the browser appear more human-like
 * @param {import('puppeteer').Page} page - The page to apply mitigation to
 * @param {Object} options - Configuration options
 */
async function applyBotMitigation(page, options = {}) {
  const {
    enableMouseMovement = true,
    enableRandomScrolling = true,
    enableRandomDelays = true,
    enableWebGLFingerprinting = true,
    enableCanvasFingerprinting = true,
    enableTimingAttacks = true,
    logMitigation = true
  } = options;

  if (logMitigation) console.log('🛡️  Applying enhanced bot mitigation...');

  try {
    // 1. Override navigator properties to appear more human
    await page.evaluateOnNewDocument(() => {
      // Override webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // Override chrome runtime
      if (window.chrome && window.chrome.runtime) {
        Object.defineProperty(window.chrome.runtime, 'onConnect', {
          value: undefined,
        });
      }
    });

    // 2. WebGL fingerprinting protection
    if (enableWebGLFingerprinting) {
      await page.evaluateOnNewDocument(() => {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          // Randomize some WebGL parameters
          if (parameter === 37445) {
            return 'Intel Inc.'; // UNMASKED_VENDOR_WEBGL
          }
          if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
          }
          return getParameter.call(this, parameter);
        };
      });
    }

    // 3. Canvas fingerprinting protection
    if (enableCanvasFingerprinting) {
      await page.evaluateOnNewDocument(() => {
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
          // Add slight noise to canvas fingerprinting
          const context = this.getContext('2d');
          if (context) {
            const imageData = context.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] += Math.floor(Math.random() * 3) - 1; // Red
              imageData.data[i + 1] += Math.floor(Math.random() * 3) - 1; // Green
              imageData.data[i + 2] += Math.floor(Math.random() * 3) - 1; // Blue
            }
            context.putImageData(imageData, 0, 0);
          }
          return originalToDataURL.apply(this, args);
        };
      });
    }

    // 4. Timing attack protection
    if (enableTimingAttacks) {
      await page.evaluateOnNewDocument(() => {
        // Add noise to performance.now()
        const originalNow = performance.now;
        performance.now = function() {
          return originalNow.call(this) + Math.random() * 0.1;
        };

        // Add noise to Date.now()
        const originalDateNow = Date.now;
        Date.now = function() {
          return originalDateNow.call(this) + Math.floor(Math.random() * 2);
        };
      });
    }

    // 5. Human-like mouse movements
    if (enableMouseMovement) {
      try {
        await simulateHumanMouseMovement(page);
      } catch (error) {
        console.warn('Mouse movement simulation failed:', error.message);
      }
    }

    // 6. Human-like scrolling (simplified)
    if (enableRandomScrolling) {
      try {
        await Promise.race([
          simulateHumanScrolling(page),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Scrolling timeout')), 5000)
          )
        ]);
      } catch (error) {
        console.warn('Human scrolling simulation failed:', error.message);
      }
    }

    // 7. Random delays throughout (shorter)
    if (enableRandomDelays) {
      await randomDelay(200, 800);
    }

    // 7. Random clicks on non-interactive elements
    await simulateRandomClicks(page);

    // 8. Random delays between actions
    if (enableRandomDelays) {
      await randomDelay(500, 1500);
    }

    if (logMitigation) console.log('✅ Bot mitigation applied successfully');

  } catch (error) {
    console.warn('⚠️  Bot mitigation error:', error.message);
  }
}

/**
 * Simulate human-like mouse movements
 */
async function simulateHumanMouseMovement(page) {
  try {
    const viewport = page.viewport() || { width: 1366, height: 768 }; // Default fallback
    const movements = 3 + Math.floor(Math.random() * 5); // 3-7 movements
    
    for (let i = 0; i < movements; i++) {
      const x = Math.random() * viewport.width;
      const y = Math.random() * viewport.height;
      const steps = 5 + Math.floor(Math.random() * 15); // 5-19 steps
      
      await page.mouse.move(x, y, { steps });
      await randomDelay(100, 300);
    }
  } catch (error) {
    console.warn('Mouse movement failed:', error.message);
  }
}

/**
 * Simulate human-like scrolling behavior
 */
async function simulateHumanScrolling(page) {
  const scrolls = 2 + Math.floor(Math.random() * 4); // 2-5 scrolls
  
  for (let i = 0; i < scrolls; i++) {
    const scrollAmount = 100 + Math.random() * 300; // 100-400px
    await page.evaluate((amount) => {
      window.scrollBy(0, amount);
    }, scrollAmount);
    await randomDelay(200, 800);
  }
  
  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await randomDelay(300, 600);
}

/**
 * Simulate random clicks on non-interactive elements for bot mitigation
 * If a click causes navigation, revert to the original page
 */
async function simulateRandomClicks(page) {
  try {
    const originalUrl = page.url();
    
    const clickableElements = await page.evaluate(() => {
      // Find elements that are visible but not typically interactive
      const elements = Array.from(document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6, img, section, article'));
      return elements
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 10 && rect.height > 10 && 
                 style.visibility !== 'hidden' && 
                 style.display !== 'none' &&
                 !el.closest('button, a, input, select, textarea, [onclick], [role="button"], [href]');
        })
        .slice(0, 20) // Limit to first 20 elements
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            tagName: el.tagName
          };
        });
    });

    // Click on 2-4 random non-interactive elements
    const clickCount = 2 + Math.floor(Math.random() * 3);
    const elementsToClick = clickableElements
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(clickCount, clickableElements.length));

    for (const element of elementsToClick) {
      try {
        const urlBeforeClick = page.url();
        
        // Set up navigation listener to detect if click causes navigation
        let navigationOccurred = false;
        const navigationPromise = page.waitForNavigation({ timeout: 2000 })
          .then(() => { navigationOccurred = true; })
          .catch(() => {}); // Ignore timeout - no navigation is good

        // Perform the click
        await page.mouse.click(element.x, element.y);
        
        // Wait a bit to see if navigation occurs
        await Promise.race([
          navigationPromise,
          new Promise(resolve => setTimeout(resolve, 1000))
        ]);

        // If navigation occurred, go back to original page
        if (navigationOccurred || page.url() !== urlBeforeClick) {
          console.log(`⚠️  Random click caused navigation from ${urlBeforeClick} to ${page.url()}, reverting...`);
          try {
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
            // If goBack doesn't work, navigate directly to original URL
            if (page.url() !== originalUrl) {
              await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
            }
            console.log(`✅ Successfully reverted to ${originalUrl}`);
          } catch (revertError) {
            console.warn('Failed to revert navigation:', revertError.message);
            // Try direct navigation as last resort
            try {
              await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
            } catch (directNavError) {
              console.error('Failed to navigate back to original URL:', directNavError.message);
            }
          }
        }
        
        await randomDelay(200, 800);
      } catch (e) {
        // Ignore click failures on non-interactive elements
        console.warn(`Random click failed on ${element.tagName}:`, e.message);
      }
    }
  } catch (error) {
    // Random clicks are optional, don't fail the whole process
    console.warn('Random clicks failed:', error.message);
  }
}

/**
 * Random delay between min and max milliseconds
 */
async function randomDelay(min = 100, max = 500) {
  const delay = min + Math.random() * (max - min);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Set realistic browser headers and properties
 */
async function setRealisticHeaders(page) {
  // Set additional headers that real browsers send
  await page.setExtraHTTPHeaders({
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  });
}

module.exports = {
  applyBotMitigation,
  simulateHumanMouseMovement,
  simulateHumanScrolling,
  simulateRandomClicks,
  randomDelay,
  setRealisticHeaders
};
