// enhanced_network_tracer.js
// Advanced network request tracing with error-based stack correlation

/**
 * Enhanced network tracer that uses error throwing/catching to precisely
 * correlate network requests with their originating functions
 */

class EnhancedNetworkTracer {
  constructor(page, networkQueue) {
    this.page = page;
    this.networkQueue = networkQueue;
    this.requestCorrelations = new Map();
    this.functionSourceCache = new Map();
  }

  /**
   * Initialize comprehensive network tracing
   */
  async initialize() {
    await this.page.evaluateOnNewDocument(() => {
      // Global network tracer object
      window.__networkTracer = {
        correlations: new Map(),
        functionSources: new Map(),
        requestId: 0,
        
        // Capture stack trace using error throwing
        captureStackTrace: function() {
          try {
            throw new Error('Stack trace capture');
          } catch (e) {
            return {
              stack: e.stack,
              timestamp: Date.now(),
              url: window.location.href
            };
          }
        },
        
        // Extract function source code from stack trace
        extractFunctionSource: function(stackTrace) {
          const sources = [];
          const lines = stackTrace.split('\n');
          
          for (let line of lines) {
            // Parse stack trace line to get function info
            const match = line.match(/at\s+([^(]+)\s*\(([^:]+):(\d+):(\d+)\)/);
            if (match) {
              const [, functionName, scriptUrl, lineNum, colNum] = match;
              
              try {
                // Try to find the script element
                const scripts = document.querySelectorAll('script');
                for (let script of scripts) {
                  if (script.src === scriptUrl || (script.innerHTML && scriptUrl.includes('inline'))) {
                    const scriptContent = script.innerHTML || script.textContent;
                    if (scriptContent) {
                      // Extract function around the line number
                      const lines = scriptContent.split('\n');
                      const targetLine = parseInt(lineNum) - 1;
                      
                      // Get function context (20 lines before and after)
                      const start = Math.max(0, targetLine - 20);
                      const end = Math.min(lines.length, targetLine + 20);
                      const functionContext = lines.slice(start, end).join('\n');
                      
                      sources.push({
                        functionName: functionName || 'anonymous',
                        scriptUrl,
                        lineNumber: lineNum,
                        columnNumber: colNum,
                        sourceCode: functionContext,
                        fullScript: scriptContent.length < 10000 ? scriptContent : scriptContent.substring(0, 10000) + '...[truncated]'
                      });
                    }
                  }
                }
              } catch (e) {
                // Continue if we can't extract source
              }
            }
          }
          
          return sources;
        },
        
        // Correlate network request with current execution context
        correlateNetworkRequest: function(url, method, requestData) {
          const requestId = ++this.requestId;
          const stackInfo = this.captureStackTrace();
          const functionSources = this.extractFunctionSource(stackInfo.stack);
          
          const correlation = {
            requestId,
            url,
            method,
            requestData,
            timestamp: Date.now(),
            stackTrace: stackInfo.stack,
            functionSources,
            executionContext: {
              userAgent: navigator.userAgent,
              currentUrl: window.location.href,
              referrer: document.referrer,
              timestamp: stackInfo.timestamp
            }
          };
          
          this.correlations.set(requestId, correlation);
          
          // Also store by URL for quick lookup
          if (!this.correlations.has(url)) {
            this.correlations.set(url, []);
          }
          this.correlations.get(url).push(correlation);
          
          return correlation;
        }
      };
      
      // Enhanced fetch interception with error-based tracing
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        const options = args[1] || {};
        
        // Capture detailed correlation data
        const correlation = window.__networkTracer.correlateNetworkRequest(
          url, 
          options.method || 'GET',
          {
            headers: options.headers,
            body: options.body,
            mode: options.mode,
            credentials: options.credentials
          }
        );
        
        // Call original fetch and track response
        const fetchPromise = originalFetch.apply(this, args);
        
        fetchPromise.then(response => {
          correlation.response = {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            url: response.url,
            redirected: response.redirected,
            type: response.type
          };
          
          // Try to capture response body for small responses
          if (response.headers.get('content-length') && 
              parseInt(response.headers.get('content-length')) < 50000) {
            response.clone().text().then(text => {
              correlation.responseBody = text;
            }).catch(() => {});
          }
        }).catch(error => {
          correlation.error = {
            message: error.message,
            stack: error.stack,
            name: error.name
          };
        });
        
        return fetchPromise;
      };
      
      // Enhanced XMLHttpRequest interception
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const originalOpen = xhr.open;
        const originalSend = xhr.send;
        
        xhr.open = function(method, url, ...args) {
          this.__networkCorrelation = window.__networkTracer.correlateNetworkRequest(
            url, 
            method,
            { async: args[0], user: args[1], password: args[2] }
          );
          
          return originalOpen.apply(this, arguments);
        };
        
        xhr.send = function(data) {
          if (this.__networkCorrelation) {
            this.__networkCorrelation.requestData.body = data;
            
            // Track response
            this.addEventListener('load', () => {
              this.__networkCorrelation.response = {
                status: this.status,
                statusText: this.statusText,
                responseHeaders: this.getAllResponseHeaders(),
                responseText: this.responseText.length < 50000 ? this.responseText : this.responseText.substring(0, 50000) + '...[truncated]',
                responseURL: this.responseURL
              };
            });
            
            this.addEventListener('error', () => {
              this.__networkCorrelation.error = {
                message: 'XMLHttpRequest error',
                status: this.status,
                statusText: this.statusText
              };
            });
          }
          
          return originalSend.apply(this, arguments);
        };
        
        return xhr;
      };
      
      // Intercept dynamic script loading
      const originalCreateElement = document.createElement;
      document.createElement = function(tagName) {
        const element = originalCreateElement.call(this, tagName);
        
        if (tagName.toLowerCase() === 'script') {
          const originalSrcSetter = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').set;
          Object.defineProperty(element, 'src', {
            set: function(value) {
              // Correlate script loading
              const correlation = window.__networkTracer.correlateNetworkRequest(
                value, 
                'GET',
                { type: 'script', dynamic: true }
              );
              
              // Track script load
              element.addEventListener('load', () => {
                correlation.response = { status: 200, type: 'script_loaded' };
              });
              
              element.addEventListener('error', () => {
                correlation.error = { message: 'Script load error', src: value };
              });
              
              return originalSrcSetter.call(this, value);
            },
            get: function() {
              return Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').get.call(this);
            }
          });
        }
        
        return element;
      };
      
      // Function call tracking with source capture
      window.__trackFunctionCall = function(functionName, args, context) {
        const stackInfo = window.__networkTracer.captureStackTrace();
        const functionSources = window.__networkTracer.extractFunctionSource(stackInfo.stack);
        
        return {
          functionName,
          arguments: Array.from(args).map(arg => {
            try {
              return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            } catch (e) {
              return '[object]';
            }
          }),
          context: context ? String(context) : null,
          stackTrace: stackInfo.stack,
          functionSources,
          timestamp: Date.now()
        };
      };
      
      // Periodic data export
      setInterval(() => {
        if (window.__networkTracer.correlations.size > 0) {
          // Export correlation data for the crawler to pick up
          window.__networkTracerData = {
            correlations: Array.from(window.__networkTracer.correlations.entries()),
            timestamp: Date.now(),
            stats: {
              totalRequests: window.__networkTracer.requestId,
              correlationsCount: window.__networkTracer.correlations.size
            }
          };
        }
      }, 1000);
    });
  }
  
  /**
   * Extract correlation data from the page
   */
  async extractCorrelationData() {
    try {
      const data = await this.page.evaluate(() => {
        return window.__networkTracerData || null;
      });
      
      if (data && data.correlations) {
        // Process and log correlation data
        for (const [key, correlation] of data.correlations) {
          if (typeof correlation === 'object' && correlation.url) {
            this.networkQueue?.enqueue?.({
              event: 'enhancedNetworkTrace',
              ...correlation,
              extractedAt: Date.now()
            });
          }
        }
        
        // Clear processed data
        await this.page.evaluate(() => {
          if (window.__networkTracer) {
            window.__networkTracer.correlations.clear();
            window.__networkTracerData = null;
          }
        });
      }
      
      return data;
    } catch (error) {
      console.warn('Error extracting correlation data:', error.message);
      return null;
    }
  }
  
  /**
   * Start periodic data extraction
   */
  startPeriodicExtraction(intervalMs = 2000) {
    this.extractionInterval = setInterval(() => {
      this.extractCorrelationData();
    }, intervalMs);
  }
  
  /**
   * Stop periodic data extraction
   */
  stopPeriodicExtraction() {
    if (this.extractionInterval) {
      clearInterval(this.extractionInterval);
      this.extractionInterval = null;
    }
  }
}

module.exports = { EnhancedNetworkTracer };
