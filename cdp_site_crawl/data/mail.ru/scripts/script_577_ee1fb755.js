((reqId) => {
        const functionCallId = window.__functionTracker?.functionToRequestMap?.get(reqId);
        const requestInfo = window.__functionTracker?.activeNetworkRequests?.get(reqId);
        return { functionCallId, requestInfo };
      }
//# sourceURL=pptr:evaluate;%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fcdp_site_crawl%2Fenhanced_instrumentation_optimized.js%3A576%3A12
)