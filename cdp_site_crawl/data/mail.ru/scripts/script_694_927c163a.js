(() => {
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
              // Safe className handling in iframes too
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
                    // Safe selector generation in iframes
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
        }
//# sourceURL=pptr:;CdpFrame.%3Canonymous%3E%20(%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fnode_modules%2Fpuppeteer-core%2Flib%2Fcjs%2Fpuppeteer%2Futil%2Fdecorators.js%3A109%3A27)
)