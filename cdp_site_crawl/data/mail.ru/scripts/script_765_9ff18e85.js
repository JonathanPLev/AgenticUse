(() => {
        if (!window.__functionTracker) {
          return {
            functionCalls: [],
            eventListeners: [],
            trackedFunctions: [],
            totalCalls: 0,
            url: window.location.href,
            timestamp: Date.now()
          };
        }
        return {
          functionCalls: window.__functionTracker.calls || [],
          eventListeners: window.__functionTracker.eventListeners || [],
          trackedFunctions: Array.from((window.__functionTracker.originalFunctions || new Map()).keys()),
          totalCalls: window.__functionTracker.callId || 0,
          url: window.location.href,
          timestamp: Date.now()
        };
      }
//# sourceURL=pptr:evaluate;FunctionTracker.getTrackingReport%20(%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fcdp_site_crawl%2Ffunction_tracker.js%3A742%3A41)
)