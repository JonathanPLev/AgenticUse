// generic_detection_fixed.js
// CRITICAL FIX: Fixed className.split error and improved dynamic content detection

/**
 * FIXED: Generic search bar detection using regex patterns
 */
async function detectSearchBarsGeneric(page) {
  return await page.evaluate(() => {
    const searchElements = [];
    
    // Enhanced search patterns
    const searchPatterns = [
      new RegExp('search', 'i'), new RegExp('query', 'i'), new RegExp('find', 'i'), new RegExp('lookup', 'i'),
      new RegExp('filter', 'i'), new RegExp('explore', 'i'), new RegExp('discover', 'i')
    ];
    
    // Check all input elements
    const inputs = Array.from(document.querySelectorAll('input, textarea'));
    inputs.forEach(el => {
      try {
        // CRITICAL FIX: Safely handle className
        const className = el.className || '';
        const classString = typeof className === 'string' ? className : (className.toString ? className.toString() : '');
        const id = el.id || '';
        const placeholder = el.placeholder || '';
        const name = el.name || '';
        const type = el.type || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        
        // Check if any attribute matches search patterns
        const attributesToCheck = [classString, id, placeholder, name, type, ariaLabel];
        const matchesPattern = attributesToCheck.some(attr => 
          searchPatterns.some(pattern => pattern.test(attr))
        );
        
        if (matchesPattern) {
          searchElements.push({
            type: 'search_input',
            tagName: el.tagName,
            id: id,
            className: classString,
            placeholder: placeholder,
            name: name,
            inputType: type,
            ariaLabel: ariaLabel,
            // FIXED: Safe selector generation
            selector: id ? `#${id}` : (classString ? `.${classString.split(' ')[0]}` : el.tagName.toLowerCase()),
            detectionMethod: 'generic_search_pattern',
            isVisible: el.offsetWidth > 0 && el.offsetHeight > 0
          });
        }
      } catch (error) {
        console.warn('Error processing search element:', error.message);
      }
    });
    
    return searchElements;
  });
}

/**
 * FIXED: Generic chatbot detection using regex patterns
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
    
    // Check DOM elements for chatbot patterns
    const allElements = Array.from(document.querySelectorAll('*'));
    allElements.forEach(el => {
      try {
        // CRITICAL FIX: Safely handle className and other properties
        const className = el.className || '';
        const classString = typeof className === 'string' ? className : (className.toString ? className.toString() : '');
        const id = el.id || '';
        const textContent = el.textContent || '';
        const tagName = el.tagName || '';
        
        // Check class names and IDs
        const attributesToCheck = [classString, id];
        const matchesDomPattern = attributesToCheck.some(attr => 
          domPatterns.some(pattern => pattern.test(attr))
        );
        
        // Check text content
        const matchesTextPattern = textPatterns.some(pattern => 
          pattern.test(textContent)
        );
        
        if (matchesDomPattern || matchesTextPattern) {
          // Check if element is visible and interactive
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const style = window.getComputedStyle(el);
          const isDisplayed = style.display !== 'none' && style.visibility !== 'hidden';
          
          if (isVisible && isDisplayed) {
            chatbots.push({
              type: 'dom_pattern',
              tagName: tagName,
              id: id,
              className: classString,
              textContent: textContent.substring(0, 100),
              // FIXED: Safe selector generation
              selector: id ? `#${id}` : (classString ? `.${classString.split(' ')[0]}` : tagName.toLowerCase()),
              detectionMethod: matchesDomPattern ? 'generic_dom_pattern' : 'generic_text_pattern',
              isVisible: isVisible,
              isDisplayed: isDisplayed
            });
          }
        }
      } catch (error) {
        console.warn('Error processing chatbot element:', error.message);
      }
    });
    
    return chatbots;
  });
}

/**
 * FIXED: Enhanced iframe chatbot detection with better filtering
 */
async function detectChatbotsInIframes(page) {
  const iframeChatbots = [];
  
  try {
    const frames = page.frames();
    console.log(`🔍 Checking ${frames.length} frames for chatbots (including iframes)`);
    
    for (const frame of frames) {
      try {
        const frameUrl = frame.url();
        
        // FIXED: Better iframe filtering - skip about:blank and data URLs but allow meaningful iframes
        if (!frameUrl || 
            frameUrl === 'about:blank' || 
            frameUrl.startsWith('data:') ||
            frameUrl.startsWith('blob:') ||
            frameUrl === '') {
          continue;
        }
        
        // FIXED: Enhanced iframe relevance check
        const isRelevantIframe = await frame.evaluate(() => {
          try {
            const body = document.body;
            if (!body) return false;
            
            const bodyText = body.textContent || '';
            const hasContent = bodyText.length > 50;
            const hasInteractiveElements = document.querySelectorAll('button, input, a, select, textarea').length > 0;
            const hasVisibleElements = document.querySelectorAll('div, span, p').length > 5;
            
            return hasContent || hasInteractiveElements || hasVisibleElements;
          } catch (e) {
            return false;
          }
        });
        
        if (!isRelevantIframe) {
          continue;
        }
        
        console.log(`  📄 Checking frame: ${frameUrl}`);
        
        // Check for chatbot patterns in iframe
        const frameChatbots = await frame.evaluate(() => {
          const chatbots = [];
          
          const chatbotPatterns = [
            new RegExp('chat', 'i'), new RegExp('widget', 'i'), new RegExp('support', 'i'), new RegExp('help', 'i'), new RegExp('bot', 'i'),
            new RegExp('intercom', 'i'), new RegExp('zendesk', 'i'), new RegExp('drift', 'i'), new RegExp('crisp', 'i'), new RegExp('messenger', 'i')
          ];
          
          // Check URL
          const frameUrl = window.location.href;
          const urlMatches = chatbotPatterns.some(pattern => pattern.test(frameUrl));
          
          if (urlMatches) {
            chatbots.push({
              type: 'iframe_url_pattern',
              url: frameUrl,
              detectionMethod: 'iframe_url_analysis'
            });
          }
          
          // Check DOM elements in iframe
          const elements = Array.from(document.querySelectorAll('*'));
          elements.forEach(el => {
            try {
              // FIXED: Safe className handling in iframes too
              const className = el.className || '';
              const classString = typeof className === 'string' ? className : (className.toString ? className.toString() : '');
              const id = el.id || '';
              const textContent = el.textContent || '';
              
              const attributesToCheck = [classString, id, textContent];
              const matchesPattern = attributesToCheck.some(attr => 
                chatbotPatterns.some(pattern => pattern.test(attr))
              );
              
              if (matchesPattern) {
                const rect = el.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0;
                
                if (isVisible) {
                  chatbots.push({
                    type: 'iframe_dom_pattern',
                    tagName: el.tagName,
                    id: id,
                    className: classString,
                    textContent: textContent.substring(0, 100),
                    // FIXED: Safe selector generation in iframes
                    selector: id ? `#${id}` : (classString ? `.${classString.split(' ')[0]}` : el.tagName.toLowerCase()),
                    detectionMethod: 'iframe_dom_analysis',
                    isVisible: isVisible
                  });
                }
              }
            } catch (error) {
              console.warn('Error processing iframe element:', error.message);
            }
          });
          
          return chatbots;
        });
        
        if (frameChatbots.length > 0) {
          iframeChatbots.push({
            frameUrl: frameUrl,
            chatbots: frameChatbots
          });
        }
        
      } catch (frameError) {
        // FIXED: Better error handling for detached frames
        if (frameError.message.includes('detached') || frameError.message.includes('Execution context was destroyed')) {
          continue; // Skip detached frames silently
        }
        console.warn(`⚠️  Error checking frame ${frame.url()}: ${frameError.message}`);
      }
    }
    
    console.log(`✅ Found ${iframeChatbots.length} chatbot indicators across all frames`);
    
  } catch (error) {
    console.warn(`⚠️  Error in iframe chatbot detection: ${error.message}`);
  }
  
  return iframeChatbots;
}

/**
 * FIXED: Main generic detection function with enhanced dynamic content detection
 */
async function performGenericDetection(page, options = {}) {
  const {
    enableIframeDetection = true,
    enableAdvancedPatterns = true,
    logResults = true,
    enableDynamicDetection = true
  } = options;

  try {
    console.log('🔍 Starting generic detection (regex-based patterns)...');
    
    // FIXED: Wait for dynamic content to load
    if (enableDynamicDetection) {
      console.log('⏳ Waiting for dynamic content to load...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Scroll to trigger lazy loading
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Detect search bars
    const searchElements = await detectSearchBarsGeneric(page);
    console.log(`📝 Found ${searchElements.length} search elements using generic patterns`);
    
    // Detect chatbots in main frame
    const mainFrameChatbots = await detectChatbotsGeneric(page);
    console.log(`💬 Found ${mainFrameChatbots.length} chatbot indicators using generic patterns`);
    
    // Detect chatbots in iframes
    let iframeChatbots = [];
    if (enableIframeDetection) {
      iframeChatbots = await detectChatbotsInIframes(page);
    }
    
    const totalIframeChatbots = iframeChatbots.reduce((total, frame) => total + frame.chatbots.length, 0);
    console.log(`🖼️  Found ${totalIframeChatbots} chatbot indicators in all frames`);
    
    const results = {
      searchElements: searchElements,
      mainFrameChatbots: mainFrameChatbots,
      iframeChatbots: iframeChatbots,
      totalSearchElements: searchElements.length,
      totalMainFrameChatbots: mainFrameChatbots.length,
      totalIframeChatbots: totalIframeChatbots,
      timestamp: Date.now()
    };
    
    if (logResults) {
      console.log('🔍 Generic detection results:');
      console.log(`   📝 Search elements: ${results.totalSearchElements}`);
      console.log(`   💬 Chatbots (main frame): ${results.totalMainFrameChatbots}`);
      console.log(`   🖼️  Chatbots (all frames): ${results.totalIframeChatbots}`);
    }
    
    return results;
    
  } catch (error) {
    console.error(`❌ Generic detection failed: ${error.message}`);
    console.error(error.stack);
    
    // Return empty results instead of failing completely
    return {
      searchElements: [],
      mainFrameChatbots: [],
      iframeChatbots: [],
      totalSearchElements: 0,
      totalMainFrameChatbots: 0,
      totalIframeChatbots: 0,
      error: error.message,
      timestamp: Date.now()
    };
  }
}

module.exports = {
  performGenericDetection,
  detectSearchBarsGeneric,
  detectChatbotsGeneric,
  detectChatbotsInIframes
};
