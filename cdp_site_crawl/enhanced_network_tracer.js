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
    this.persistentDataStore = new Map(); // Store data from detached frames
    this.frameLifecycleTracker = new Map(); // Track frame states
    this.crossFrameCorrelations = new Map(); // Link data across frames
  }

  /**
   * Initialize comprehensive network tracing
   */
  async initialize() {
    await this.page.evaluateOnNewDocument(() => {
      // Global network tracer object with persistent data management
      window.__networkTracer = {
        correlations: new Map(),
        functionSources: new Map(),
        requestId: 0,
        persistentStore: new Map(), // Cross-frame persistent storage
        frameDataBackup: new Map(), // Backup data before frame detachment
        liveFrameTracker: new Set(), // Track which frames are currently live
        
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
        
        // Proactively backup data before potential frame detachment
        backupFrameData: function() {
          const frameId = window.frameElement ? window.frameElement.id || 'iframe_' + Date.now() : 'main_frame';
          const backupData = {
            frameId,
            url: window.location.href,
            timestamp: Date.now(),
            correlations: Array.from(this.correlations.entries()),
            functionSources: Array.from(this.functionSources.entries()),
            liveFrames: Array.from(this.liveFrameTracker)
          };
          
          // Store in persistent storage accessible across frames
          this.frameDataBackup.set(frameId, backupData);
          
          // Also store in parent window if available
          try {
            if (window.parent && window.parent !== window && window.parent.__networkTracer) {
              window.parent.__networkTracer.persistentStore.set(frameId, backupData);
            }
          } catch (e) {
            // Cross-origin restriction, store locally
          }
          
          return backupData;
        },

        // Correlate network request with current execution context and backup data
        correlateNetworkRequest: function(url, method, requestData) {
          const requestId = ++this.requestId;
          const stackInfo = this.captureStackTrace();
          const functionSources = this.extractFunctionSource(stackInfo.stack);
          
          // Filter stack trace to only include live frames
          const liveStackTrace = this.filterLiveFramesFromStack(stackInfo.stack);
          
          const correlation = {
            requestId,
            url,
            method,
            requestData,
            timestamp: Date.now(),
            stackTrace: liveStackTrace,
            originalStackTrace: stackInfo.stack, // Keep original for reference
            functionSources,
            executionContext: {
              userAgent: navigator.userAgent,
              currentUrl: window.location.href,
              referrer: document.referrer,
              timestamp: stackInfo.timestamp,
              frameId: window.frameElement ? window.frameElement.id : 'main'
            }
          };
          
          // Store correlation with backup
          this.correlations.set(requestId, correlation);
          
          // Proactively backup this data
          this.backupFrameData();
          
          // Also store by URL for quick lookup with cross-frame data
          const urlKey = url + '_' + method;
          if (!this.correlations.has(urlKey)) {
            this.correlations.set(urlKey, []);
          }
          this.correlations.get(urlKey).push(correlation);
          
          return correlation;
        },

        // Filter stack trace to only include frames that are still live
        filterLiveFramesFromStack: function(stackTrace) {
          if (!stackTrace) return stackTrace;
          
          const lines = stackTrace.split('\n');
          const filteredLines = [];
          
          for (const line of lines) {
            // Check if this stack frame references a live frame
            const isLiveFrame = this.isStackFrameLive(line);
            if (isLiveFrame) {
              filteredLines.push(line);
            } else {
              // Replace with placeholder to maintain stack structure
              filteredLines.push('    at [detached frame] (frame was detached)');
            }
          }
          
          return filteredLines.join('\n');
        },

        // Check if a stack frame line references a live frame
        isStackFrameLive: function(stackLine) {
          try {
            // Extract URL from stack line
            const urlMatch = stackLine.match(/\((.*?):\d+:\d+\)/) || stackLine.match(/at (.*?):\d+:\d+/);
            if (!urlMatch) return true; // If we can't parse, assume it's live
            
            const frameUrl = urlMatch[1];
            
            // Check if this URL corresponds to a live frame
            if (frameUrl === window.location.href) return true; // Current frame is live
            
            // Check parent frames
            try {
              let currentWindow = window;
              while (currentWindow.parent && currentWindow.parent !== currentWindow) {
                if (currentWindow.parent.location.href === frameUrl) return true;
                currentWindow = currentWindow.parent;
              }
            } catch (e) {
              // Cross-origin restriction
            }
            
            // Check child frames
            try {
              const frames = document.querySelectorAll('iframe, frame');
              for (const frame of frames) {
                if (frame.src === frameUrl || frame.contentWindow?.location?.href === frameUrl) {
                  return !frame.contentDocument || frame.contentDocument.readyState !== 'unloading';
                }
              }
            } catch (e) {
              // Frame access restriction
            }
            
            return false; // Assume detached if we can't verify
          } catch (e) {
            return true; // If error checking, assume live to be safe
          }
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
      
      // Enhanced periodic data export with frame lifecycle monitoring
      setInterval(() => {
        // Proactively backup data before potential frame detachment
        window.__networkTracer.backupFrameData();
        
        if (window.__networkTracer.correlations.size > 0 || window.__networkTracer.frameDataBackup.size > 0) {
          // Export correlation data including backed up data from detached frames
          const allCorrelations = new Map(window.__networkTracer.correlations);
          
          // Merge in backed up data from detached frames
          for (const [frameId, backupData] of window.__networkTracer.frameDataBackup.entries()) {
            for (const [key, correlation] of backupData.correlations) {
              if (!allCorrelations.has(key)) {
                // Mark as recovered from detached frame
                correlation.recoveredFromDetachedFrame = true;
                correlation.originalFrameId = frameId;
                allCorrelations.set(key, correlation);
              }
            }
          }
          
          // Also include data from parent frame's persistent store
          try {
            if (window.parent && window.parent !== window && window.parent.__networkTracer) {
              for (const [frameId, backupData] of window.parent.__networkTracer.persistentStore.entries()) {
                for (const [key, correlation] of backupData.correlations) {
                  if (!allCorrelations.has(key)) {
                    correlation.recoveredFromDetachedFrame = true;
                    correlation.originalFrameId = frameId;
                    correlation.crossFrameRecovery = true;
                    allCorrelations.set(key, correlation);
                  }
                }
              }
            }
          } catch (e) {
            // Cross-origin restriction
          }
          
          window.__networkTracerData = {
            correlations: Array.from(allCorrelations.entries()),
            timestamp: Date.now(),
            stats: {
              totalRequests: window.__networkTracer.requestId,
              correlationsCount: allCorrelations.size,
              liveCorrelations: window.__networkTracer.correlations.size,
              recoveredCorrelations: allCorrelations.size - window.__networkTracer.correlations.size,
              backedUpFrames: window.__networkTracer.frameDataBackup.size
            },
            frameLifecycle: {
              currentFrameId: window.frameElement ? window.frameElement.id : 'main',
              backupFrames: Array.from(window.__networkTracer.frameDataBackup.keys()),
              liveFrames: Array.from(window.__networkTracer.liveFrameTracker)
            }
          };
        }
      }, 1000);

      // Monitor for frame detachment and backup data proactively
      window.addEventListener('beforeunload', () => {
        window.__networkTracer.backupFrameData();
      });

      // Monitor for navigation changes
      let lastUrl = window.location.href;
      setInterval(() => {
        if (window.location.href !== lastUrl) {
          window.__networkTracer.backupFrameData();
          lastUrl = window.location.href;
        }
      }, 500);
    });
  }
  
  /**
   * Extract correlation data with persistent storage recovery
   */
  async extractCorrelationData() {
    try {
      // Check if page is still valid and not detached
      if (!this.page || this.page.isClosed()) {
        // Try to recover from persistent storage
        return this.recoverFromPersistentStorage();
      }

      // Check if the main frame is still attached
      const mainFrame = this.page.mainFrame();
      if (!mainFrame || mainFrame.isDetached()) {
        return this.recoverFromPersistentStorage();
      }

      // Validate execution context before attempting evaluation
      try {
        await this.page.evaluate(() => true);
      } catch (contextError) {
        if (contextError.message.includes('Execution context was destroyed') ||
            contextError.message.includes('detached Frame') ||
            contextError.message.includes('Promise was collected')) {
          return this.recoverFromPersistentStorage();
        }
        throw contextError;
      }

      const data = await this.page.evaluate(() => {
        return window.__networkTracerData || null;
      });
      
      if (data && data.correlations) {
        // Store data in persistent storage before processing
        this.storePersistentData(data);
        
        // Process and log correlation data including recovered data
        for (const [key, correlation] of data.correlations) {
          if (typeof correlation === 'object' && correlation.url) {
            this.networkQueue?.enqueue?.({
              event: 'enhancedNetworkTrace',
              ...correlation,
              extractedAt: Date.now(),
              dataSource: correlation.recoveredFromDetachedFrame ? 'recovered' : 'live'
            });
          }
        }
        
        // Clear only live data, keep backup data
        try {
          await this.page.evaluate(() => {
            if (window.__networkTracer) {
              // Only clear live correlations, keep backup data
              window.__networkTracer.correlations.clear();
              // Don't clear frameDataBackup or persistentStore
              window.__networkTracerData = null;
            }
          });
        } catch (clearError) {
          // Ignore errors when clearing data from detached contexts
          if (!clearError.message.includes('detached Frame') &&
              !clearError.message.includes('Execution context was destroyed') &&
              !clearError.message.includes('Promise was collected')) {
            console.warn('Error clearing network tracer data:', clearError.message);
          }
        }
      }
      
      return data;
    } catch (error) {
      // Filter out expected detached frame errors and try recovery
      if (error.message.includes('detached Frame') ||
          error.message.includes('Execution context was destroyed') ||
          error.message.includes('Promise was collected') ||
          error.message.includes('Target closed')) {
        return this.recoverFromPersistentStorage();
      }
      console.warn('Error extracting correlation data:', error.message);
      return null;
    }
  }

  /**
   * Store data in persistent storage for recovery
   */
  storePersistentData(data) {
    if (data && data.correlations) {
      const timestamp = Date.now();
      for (const [key, correlation] of data.correlations) {
        this.persistentDataStore.set(`${key}_${timestamp}`, {
          ...correlation,
          persistedAt: timestamp,
          frameId: correlation.executionContext?.frameId || 'unknown'
        });
      }
      
      // Store frame lifecycle data
      if (data.frameLifecycle) {
        this.frameLifecycleTracker.set(timestamp, data.frameLifecycle);
      }
    }
  }

  /**
   * Recover data from persistent storage when frames are detached
   */
  recoverFromPersistentStorage() {
    if (this.persistentDataStore.size === 0) {
      return null;
    }

    const recoveredCorrelations = [];
    const now = Date.now();
    
    // Get data from the last 30 seconds to avoid stale data
    for (const [key, correlation] of this.persistentDataStore.entries()) {
      if (correlation.persistedAt && (now - correlation.persistedAt) < 30000) {
        recoveredCorrelations.push([key, {
          ...correlation,
          recoveredFromPersistentStorage: true,
          recoveredAt: now
        }]);
      }
    }

    if (recoveredCorrelations.length > 0) {
      return {
        correlations: recoveredCorrelations,
        timestamp: now,
        stats: {
          totalRequests: recoveredCorrelations.length,
          correlationsCount: recoveredCorrelations.length,
          recoveredCorrelations: recoveredCorrelations.length,
          dataSource: 'persistent_storage_recovery'
        },
        frameLifecycle: {
          recoveryMode: true,
          persistentFrames: Array.from(this.frameLifecycleTracker.keys())
        }
      };
    }

    return null;
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
