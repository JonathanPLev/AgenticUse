// bot_mitigation_final_fix.js
// FINAL FIX: Enhanced bot mitigation with proper webdriver property handling

const fs = require('fs');
const path = require('path');

/**
 * Advanced bot mitigation techniques to make the browser appear more human-like
 * FINAL FIX: Proper webdriver property handling that actually works
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
    // FINAL FIX: Comprehensive webdriver property override that actually works
    await page.evaluateOnNewDocument(() => {
      // Method 1: Direct property deletion and redefinition
      try {
        delete Object.getPrototypeOf(navigator).webdriver;
        delete navigator.webdriver;
        navigator.webdriver = undefined;
      } catch (e1) {
        // Method 2: Property descriptor manipulation
        try {
          const descriptor = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
          if (descriptor) {
            if (descriptor.configurable) {
              Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
                set: () => {},
                configurable: true,
                enumerable: false
              });
            } else {
              // Method 3: Prototype chain manipulation
              Object.setPrototypeOf(navigator, new Proxy(Object.getPrototypeOf(navigator), {
                get: (target, prop) => {
                  if (prop === 'webdriver') return undefined;
                  return target[prop];
                },
                has: (target, prop) => {
                  if (prop === 'webdriver') return false;
                  return prop in target;
                }
              }));
            }
          }
        } catch (e2) {
          // Method 4: Global navigator replacement
          try {
            const originalNavigator = navigator;
            Object.defineProperty(window, 'navigator', {
              get: () => new Proxy(originalNavigator, {
                get: (target, prop) => {
                  if (prop === 'webdriver') return undefined;
                  const value = target[prop];
                  return typeof value === 'function' ? value.bind(target) : value;
                },
                has: (target, prop) => {
                  if (prop === 'webdriver') return false;
                  return prop in target;
                }
              }),
              configurable: true
            });
          } catch (e3) {
            console.warn('All webdriver override methods failed');
          }
        }
      }

      // Override other navigator properties with error handling
      const propertiesToOverride = [
        { name: 'plugins', value: () => [1, 2, 3, 4, 5] },
        { name: 'languages', value: () => ['en-US', 'en'] },
        { name: 'platform', value: () => 'MacIntel' },
        { name: 'hardwareConcurrency', value: () => 4 }
      ];

      propertiesToOverride.forEach(({ name, value }) => {
        try {
          const descriptor = Object.getOwnPropertyDescriptor(navigator, name);
          if (!descriptor || descriptor.configurable) {
            Object.defineProperty(navigator, name, {
              get: value,
              configurable: true,
              enumerable: true
            });
          }
        } catch (e) {
          console.warn(`Failed to override navigator.${name}:`, e.message);
        }
      });
    });

    // 5. Human-like mouse movements - FIXED viewport issue
    if (enableMouseMovement) {
      try {
        await simulateHumanMouseMovement(page);
      } catch (error) {
        console.warn('Mouse movement simulation failed:', error.message);
      }
    }

    // 6. Human-like scrolling
    if (enableRandomScrolling) {
      try {
        await simulateHumanScrolling(page);
      } catch (error) {
        console.warn('Scrolling simulation failed:', error.message);
      }
    }

    // 7. Random delays
    if (enableRandomDelays) {
      await randomDelay(500, 1500);
    }

    // 8. Random clicks on non-interactive elements
    try {
      await simulateRandomClicks(page);
    } catch (error) {
      console.warn('Random clicks failed:', error.message);
    }

    if (logMitigation) console.log('✅ Bot mitigation applied successfully');

  } catch (error) {
    console.error('❌ Bot mitigation failed:', error.message);
    throw error;
  }
}

/**
 * FIXED: Simulate human-like mouse movements with proper viewport handling
 */
async function simulateHumanMouseMovement(page) {
  try {
    let viewport = page.viewport();
    if (!viewport) {
      // Set default viewport if none exists
      viewport = { width: 1366, height: 768 };
      await page.setViewport(viewport);
    }
    
    const movements = 3 + Math.floor(Math.random() * 5); // 3-7 movements

    for (let i = 0; i < movements; i++) {
      const x = Math.random() * viewport.width;
      const y = Math.random() * viewport.height;
      
      await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 20) });
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
  try {
    const scrolls = 2 + Math.floor(Math.random() * 4); // 2-5 scrolls
    
    for (let i = 0; i < scrolls; i++) {
      const deltaY = (Math.random() - 0.5) * 500; // Random scroll direction and amount
      await page.mouse.wheel({ deltaY });
      await randomDelay(200, 800);
    }
  } catch (error) {
    console.warn('Scrolling simulation failed:', error.message);
  }
}

/**
 * Simulate random clicks on non-interactive elements for bot mitigation
 */
async function simulateRandomClicks(page) {
  try {
    const originalUrl = page.url();
    
    // Get clickable non-interactive elements
    const clickableElements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6, img'))
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
