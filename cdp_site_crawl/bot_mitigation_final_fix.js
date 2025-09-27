// bot_mitigation_final_fix.js
// Enhanced bot mitigation with proper webdriver property handling

const fs = require('fs');
const path = require('path');

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

  if (logMitigation) console.log('Applying enhanced bot mitigation...');

  try {
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

    // 5. Human-like mouse movements with timeout
    if (enableMouseMovement) {
      try {
        await Promise.race([
          simulateHumanMouseMovement(page),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Mouse movement timeout')), 5000))
        ]);
      } catch (error) {
        console.warn('Mouse movement simulation failed:', error.message);
      }
    }

    // 6. Human-like scrolling with timeout
    if (enableRandomScrolling) {
      try {
        await Promise.race([
          simulateHumanScrolling(page),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Scrolling timeout')), 3000))
        ]);
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

    if (logMitigation) console.log('Bot mitigation applied successfully');

  } catch (error) {
    console.error('Bot mitigation failed:', error.message);
    throw error;
  }
}

/**
 * Simulate human-like mouse movements with proper viewport handling
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
    

    const clickableElements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div, span, p'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          
          // Much more restrictive filtering to avoid navigation
          return rect.width > 20 && rect.height > 20 && 
                 rect.width < 200 && rect.height < 100 && // Avoid large clickable areas
                 style.visibility !== 'hidden' && 
                 style.display !== 'none' &&
                 style.cursor !== 'pointer' && // Avoid elements with pointer cursor
                 !el.closest('button, a, input, select, textarea, [onclick], [role="button"], [href], nav, header, footer, .nav, .menu, .link') &&
                 !el.textContent.toLowerCase().includes('click') &&
                 !el.textContent.toLowerCase().includes('link') &&
                 !el.getAttribute('class')?.toLowerCase().includes('link') &&
                 !el.getAttribute('class')?.toLowerCase().includes('button') &&
                 el.children.length === 0; // Only leaf elements
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

    // Only click 1-2 elements to minimize risk
    const clickCount = 1 + Math.floor(Math.random() * 2);
    const elementsToClick = clickableElements
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(clickCount, clickableElements.length));

    // If no safe elements found, skip clicking entirely
    if (elementsToClick.length === 0) {
      console.log('No safe elements found for random clicking, skipping...');
      return;
    }

    for (const element of elementsToClick) {
      try {
        const urlBeforeClick = page.url();
        
        // Pre-check: ensure we're still on the original page
        if (page.url() !== originalUrl) {
          console.log('Page URL changed before clicking, aborting random clicks');
          break;
        }

        // Perform the click with shorter timeout
        await Promise.race([
          page.mouse.click(element.x, element.y),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Click timeout')), 1000))
        ]);
        
        // Very short wait to detect immediate navigation
        await new Promise(resolve => setTimeout(resolve, 200));

        // If navigation occurred, immediately abort without trying to revert
        if (page.url() !== urlBeforeClick) {
          console.log(`Random click caused navigation from ${urlBeforeClick} to ${page.url()}, aborting further clicks`);
          throw new Error('Navigation detected - aborting random clicks to prevent context destruction');
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
