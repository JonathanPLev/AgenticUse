(() => {
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
        }
//# sourceURL=pptr:;CdpFrame.%3Canonymous%3E%20(%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fnode_modules%2Fpuppeteer-core%2Flib%2Fcjs%2Fpuppeteer%2Futil%2Fdecorators.js%3A109%3A27)
)