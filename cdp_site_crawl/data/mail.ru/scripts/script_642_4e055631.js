((reqId, requestUrl, requestMethod) => {
        const tracker = window.__functionTracker;
        if (!tracker) return null;
        
        // Get current stack trace to correlate with network request
        const currentStack = new Error().stack;
        
        // Find the most recent function call that might have triggered this request
        const recentCalls = tracker.calls?.slice(-10) || [];
        let correlatedCall = null;
        
        // Look for function calls that happened within the last 100ms
        const now = Date.now();
        for (let i = recentCalls.length - 1; i >= 0; i--) {
          const call = recentCalls[i];
          if (now - call.timestamp < 100) {
            // Check if this call's stack trace contains network-related functions
            const stackStr = call.stackTrace || '';
            if (stackStr.includes('fetch') || stackStr.includes('XMLHttpRequest') || 
                stackStr.includes('ajax') || stackStr.includes(requestUrl.split('/').pop())) {
              correlatedCall = call;
              break;
            }
          }
        }
        
        // If no direct correlation, get the most recent call
        if (!correlatedCall && recentCalls.length > 0) {
          correlatedCall = recentCalls[recentCalls.length - 1];
        }
        
        return {
          functionCall: correlatedCall,
          currentStack: currentStack,
          trackerStats: {
            totalCalls: tracker.calls?.length || 0,
            recentCallsCount: recentCalls.length
          }
        };
      }
//# sourceURL=pptr:evaluate;%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fcdp_site_crawl%2Fenhanced_instrumentation_optimized.js%3A346%3A39
)