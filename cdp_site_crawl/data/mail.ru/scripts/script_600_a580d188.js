(() => {
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
        // Safely handle className and other properties
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
    }
//# sourceURL=pptr:evaluate;detectChatbotsGeneric%20(%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fcdp_site_crawl%2Fgeneric_detection_fixed.js%3A70%3A10)
)