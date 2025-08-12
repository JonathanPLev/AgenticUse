// generic_detection.js
// Generic regex-based detection for search bars, chatbots, and other interactive elements
// Addresses GitHub comments 8, 9, and 10

const { chatbotPatterns, genericChatbotDetection } = require('./static_data_structs.cjs');

/**
 * Generic search element detection using regex patterns (Comment 8)
 */
async function findSearchElementsGeneric(page) {
  return await page.evaluate(() => {
    const searchElements = [];
    
    // Generic regex patterns for search detection (defined in browser context)
    const searchPatterns = [
      new RegExp('search', 'i'),         // matches anything containing "search"
      new RegExp('find', 'i'),           // matches anything containing "find"
      new RegExp('query', 'i'),          // matches anything containing "query"
      new RegExp('lookup', 'i')          // matches anything containing "lookup"
    ];
    
    // Find all input elements
    const allInputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
    
    allInputs.forEach(element => {
      // Check if element matches search patterns
      const matchesSearch = searchPatterns.some(pattern => {
        return pattern.test(element.id) ||
               pattern.test(element.className) ||
               pattern.test(element.name || '') ||
               pattern.test(element.placeholder || '') ||
               pattern.test(element.getAttribute('aria-label') || '') ||
               pattern.test(element.getAttribute('data-testid') || '') ||
               pattern.test(element.getAttribute('data-qa') || '');
      });
      
      if (matchesSearch && element.offsetParent !== null) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          searchElements.push({
            tagName: element.tagName.toLowerCase(),
            type: element.type || 'unknown',
            id: element.id,
            className: element.className,
            placeholder: element.placeholder,
            name: element.name,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            detectionMethod: 'generic_regex_pattern'
          });
        }
      }
    });
    
    return searchElements;
  });
}

/**
 * Generic chatbot detection using regex patterns (Comment 9)
 */
async function detectChatbotsGeneric(page) {
  return await page.evaluate(() => {
    const chatbots = [];
    
    // Define patterns directly in browser context using RegExp constructor
    const networkPatterns = [
      new RegExp('chat', 'i'), new RegExp('widget', 'i'), new RegExp('support', 'i'), new RegExp('help', 'i'), new RegExp('bot', 'i'), new RegExp('assistant', 'i'),
      new RegExp('intercom', 'i'), new RegExp('zendesk', 'i'), new RegExp('drift', 'i'), new RegExp('crisp', 'i'), new RegExp('freshchat', 'i'), new RegExp('olark', 'i'),
      new RegExp('livechat', 'i'), new RegExp('tidio', 'i'), new RegExp('hubspot', 'i'), new RegExp('messenger', 'i'), new RegExp('chatlio', 'i')
    ];
    
    const domPatterns = [
      new RegExp('chat', 'i'), new RegExp('widget', 'i'), new RegExp('launcher', 'i'), new RegExp('support', 'i'), new RegExp('help', 'i'), new RegExp('bot', 'i'),
      new RegExp('message', 'i'), new RegExp('conversation', 'i'), new RegExp('assistant', 'i'), new RegExp('contact', 'i')
    ];
    
    const textPatterns = [
      new RegExp('chat with us', 'i'), new RegExp('need help', 'i'), new RegExp('contact support', 'i'), new RegExp('ask a question', 'i'),
      new RegExp('talk to us', 'i'), new RegExp('get help', 'i'), new RegExp('live chat', 'i'), new RegExp('customer support', 'i')
    ];
    
    // Check network patterns in current page URL
    const currentUrl = window.location.href;
    const urlMatches = networkPatterns.some(pattern => 
      pattern.test(currentUrl)
    );
    if (urlMatches) {
      chatbots.push({
        type: 'network_pattern',
        location: 'page_url',
        url: currentUrl,
        detectionMethod: 'generic_url_pattern'
      });
    }
    
    // Check DOM patterns
    domPatterns.forEach(pattern => {
      const elements = Array.from(document.querySelectorAll('*')).filter(el => {
        return pattern.test(el.className) || 
               pattern.test(el.id) || 
               pattern.test(el.getAttribute('data-testid') || '') ||
               pattern.test(el.getAttribute('aria-label') || '') ||
               pattern.test(el.getAttribute('data-qa') || '');
      });
      
      elements.forEach(el => {
        if (el.offsetParent !== null) { // Only visible elements
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            chatbots.push({
              type: 'dom_pattern',
              element: el.tagName.toLowerCase(),
              id: el.id,
              className: el.className,
              selector: el.id ? `#${el.id}` : `.${el.className.split(' ')[0]}`,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              detectionMethod: 'generic_dom_pattern'
            });
          }
        }
      });
    });
    
    // Check text patterns
    const bodyText = document.body ? document.body.innerText : '';
    textPatterns.forEach(pattern => {
      if (pattern.test(bodyText)) {
        chatbots.push({
          type: 'text_pattern',
          text: bodyText.substring(0, 200) + '...',
          detectionMethod: 'generic_text_pattern'
        });
      }
    });
    
    // Check for script tags that might indicate chatbot services
    const scripts = Array.from(document.scripts);
    scripts.forEach(script => {
      if (script.src) {
        const scriptMatches = networkPatterns.some(pattern => 
          pattern.test(script.src)
        );
        if (scriptMatches) {
          chatbots.push({
            type: 'script_pattern',
            src: script.src,
            detectionMethod: 'generic_script_pattern'
          });
        }
      }
    });
    
    return chatbots;
  });
}

/**
 * Enhanced chatbot detection that searches in all frames including iframes (Comment 10)
 */
async function detectChatbotsInAllFrames(page) {
  const allChatbots = [];
  
  try {
    // Get all frames (main frame + all iframes)
    const frames = page.frames();
    console.log(`🔍 Checking ${frames.length} frames for chatbots (including iframes)`);
    
    for (const frame of frames) {
      try {
        const frameUrl = frame.url();
        console.log(`  📄 Checking frame: ${frameUrl}`);
        
        // Check each frame for chatbot indicators using generic detection
        const frameChatbots = await frame.evaluate((frameUrl) => {
          const found = [];
          
          // Define patterns directly in browser context using RegExp constructor
          const networkPatterns = [
            new RegExp('chat', 'i'), new RegExp('widget', 'i'), new RegExp('support', 'i'), new RegExp('help', 'i'), new RegExp('bot', 'i'), new RegExp('assistant', 'i'),
            new RegExp('intercom', 'i'), new RegExp('zendesk', 'i'), new RegExp('drift', 'i'), new RegExp('crisp', 'i'), new RegExp('freshchat', 'i'), new RegExp('olark', 'i'),
            new RegExp('livechat', 'i'), new RegExp('tidio', 'i'), new RegExp('hubspot', 'i'), new RegExp('messenger', 'i'), new RegExp('chatlio', 'i')
          ];
          
          const domPatterns = [
            new RegExp('chat', 'i'), new RegExp('widget', 'i'), new RegExp('launcher', 'i'), new RegExp('support', 'i'), new RegExp('help', 'i'), new RegExp('bot', 'i'),
            new RegExp('message', 'i'), new RegExp('conversation', 'i'), new RegExp('assistant', 'i'), new RegExp('contact', 'i')
          ];
          
          const textPatterns = [
            new RegExp('chat with us', 'i'), new RegExp('need help', 'i'), new RegExp('contact support', 'i'), new RegExp('ask a question', 'i'),
            new RegExp('talk to us', 'i'), new RegExp('get help', 'i'), new RegExp('live chat', 'i'), new RegExp('customer support', 'i')
          ];
          
          // Check network patterns in frame URL
          const urlMatches = networkPatterns.some(pattern => 
            pattern.test(frameUrl)
          );
          if (urlMatches) {
            found.push({
              type: 'network_pattern',
              frame: frameUrl,
              location: 'frame_url',
              detectionMethod: 'generic_iframe_url_pattern'
            });
          }
          
          // Check DOM patterns in frame
          domPatterns.forEach(pattern => {
            const elements = Array.from(document.querySelectorAll('*')).filter(el => {
              return pattern.test(el.className) || 
                     pattern.test(el.id) || 
                     pattern.test(el.getAttribute('data-testid') || '') ||
                     pattern.test(el.getAttribute('aria-label') || '');
            });
            
            elements.forEach(el => {
              if (el.offsetParent !== null) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  found.push({
                    type: 'dom_pattern',
                    frame: frameUrl,
                    element: el.tagName.toLowerCase(),
                    id: el.id,
                    className: el.className,
                    selector: el.id ? `#${el.id}` : `.${el.className.split(' ')[0]}`,
                    rect: {
                      x: rect.x,
                      y: rect.y,
                      width: rect.width,
                      height: rect.height
                    },
                    detectionMethod: 'generic_iframe_dom_pattern'
                  });
                }
              }
            });
          });
          
          // Check text patterns in frame
          const bodyText = document.body ? document.body.innerText : '';
          textPatterns.forEach(pattern => {
            if (pattern.test(bodyText)) {
              found.push({
                type: 'text_pattern',
                frame: frameUrl,
                text: bodyText.substring(0, 100) + '...',
                detectionMethod: 'generic_iframe_text_pattern'
              });
            }
          });
          
          return found;
        }, frameUrl);
        
        allChatbots.push(...frameChatbots);
        
      } catch (error) {
        console.warn(`⚠️  Error checking frame ${frame.url()}:`, error.message);
      }
    }
    
  } catch (error) {
    console.warn('⚠️  Error detecting chatbots in frames:', error.message);
  }
  
  console.log(`✅ Found ${allChatbots.length} chatbot indicators across all frames`);
  return allChatbots;
}

/**
 * Setup dynamic iframe capture to detect chatbots in iframes that load after initial page load
 * Enhanced to immediately capture and save DOM content of each new iframe
 */
async function setupDynamicIframeCapture(page, onNewChatbot, domQueue = null) {
  // Listen for new frames being added
  page.on('frameattached', async (frame) => {
    try {
      console.log(`🆕 New iframe detected: ${frame.url()}`);
      
      // Wait for frame to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // IMMEDIATELY CAPTURE THE IFRAME DOM CONTENT
      if (domQueue) {
        try {
          const html = await frame.content();
          domQueue.enqueue({
            frameId: frame._id,
            url: frame.url(),
            html,
            timestamp: Date.now(),
            captureType: 'dynamic_iframe_attached',
            loadTime: new Date().toISOString()
          });
          console.log(`💾 Saved dynamic iframe DOM: ${frame.url()}`);
        } catch (domError) {
          console.warn(`⚠️  Failed to capture DOM for iframe ${frame.url()}:`, domError.message);
        }
      }
      
      // Check if this frame contains chatbot indicators
      const chatbots = await frame.evaluate(() => {
        const found = [];
        
        // Define patterns directly in browser context using RegExp constructor
        const domPatterns = [
          new RegExp('chat', 'i'), new RegExp('widget', 'i'), new RegExp('launcher', 'i'), new RegExp('support', 'i'), new RegExp('help', 'i'), new RegExp('bot', 'i'),
          new RegExp('message', 'i'), new RegExp('conversation', 'i'), new RegExp('assistant', 'i'), new RegExp('contact', 'i')
        ];
        
        // Check DOM patterns
        domPatterns.forEach(pattern => {
          const elements = Array.from(document.querySelectorAll('*')).filter(el => {
            return pattern.test(el.className) || pattern.test(el.id);
          });
          
          elements.forEach(el => {
            if (el.offsetParent !== null) {
              found.push({
                type: 'dom_pattern',
                element: el.tagName.toLowerCase(),
                selector: el.id ? `#${el.id}` : `.${el.className.split(' ')[0]}`,
                detectionMethod: 'dynamic_iframe_detection'
              });
            }
          });
        });
        
        return found;
      });
      
      if (chatbots.length > 0 && onNewChatbot) {
        console.log(`✅ Found ${chatbots.length} chatbot indicators in new iframe`);
        onNewChatbot(frame, chatbots);
      }
      
    } catch (error) {
      console.warn(`⚠️  Error processing new iframe ${frame.url()}:`, error.message);
    }
  });
  
  // Listen for frame navigation (iframe content changes)
  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) return; // Skip main frame
    
    try {
      console.log(`🔄 Iframe navigated: ${frame.url()}`);
      
      // Wait a bit for content to load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // IMMEDIATELY CAPTURE THE UPDATED IFRAME DOM CONTENT
      if (domQueue) {
        try {
          const html = await frame.content();
          domQueue.enqueue({
            frameId: frame._id,
            url: frame.url(),
            html,
            timestamp: Date.now(),
            captureType: 'dynamic_iframe_navigated',
            loadTime: new Date().toISOString()
          });
          console.log(`💾 Saved navigated iframe DOM: ${frame.url()}`);
        } catch (domError) {
          console.warn(`⚠️  Failed to capture DOM for navigated iframe ${frame.url()}:`, domError.message);
        }
      }
      
      // Re-check this frame for chatbot indicators after navigation
      const chatbots = await detectChatbotsInAllFrames(page);
      if (chatbots.length > 0 && onNewChatbot) {
        onNewChatbot(frame, chatbots);
      }
      
    } catch (error) {
      console.warn(`⚠️  Error processing iframe navigation ${frame.url()}:`, error.message);
    }
  });
}

/**
 * Combined generic detection function that uses all methods
 * Enhanced to accept domQueue for immediate iframe DOM capture
 */
async function performGenericDetection(page, domQueue = null) {
  const results = {
    searchElements: [],
    chatbots: [],
    iframeChatbots: [],
    timestamp: Date.now()
  };
  
  try {
    console.log('🔍 Starting generic detection (regex-based patterns)...');
    
    // Detect search elements using generic patterns
    results.searchElements = await findSearchElementsGeneric(page);
    console.log(`📝 Found ${results.searchElements.length} search elements using generic patterns`);
    
    // Detect chatbots using generic patterns (main frame)
    results.chatbots = await detectChatbotsGeneric(page);
    console.log(`💬 Found ${results.chatbots.length} chatbot indicators using generic patterns`);
    
    // Detect chatbots in all frames including iframes
    results.iframeChatbots = await detectChatbotsInAllFrames(page);
    console.log(`🖼️  Found ${results.iframeChatbots.length} chatbot indicators in all frames`);
    
    // Setup dynamic iframe monitoring with DOM capture
    await setupDynamicIframeCapture(page, (frame, chatbots) => {
      console.log(`🆕 Dynamic iframe chatbot detection: ${chatbots.length} new indicators`);
      results.iframeChatbots.push(...chatbots);
    }, domQueue); // Pass domQueue for immediate iframe DOM capture
    
  } catch (error) {
    console.error('❌ Generic detection failed:', error.message);
  }
  
  return results;
}

module.exports = {
  findSearchElementsGeneric,
  detectChatbotsGeneric,
  detectChatbotsInAllFrames,
  setupDynamicIframeCapture,
  performGenericDetection
};
