// function_tracker.js
// Advanced JavaScript function tracking system with stack traces and parameter monitoring

/**
 * Comprehensive function tracking system that:
 * 1. Overwrites JavaScript functions to capture stack traces
 * 2. Tracks parameters, return values, and execution context
 * 3. Monitors event listeners and their triggers
 * 4. Links function calls to network requests
 * 5. Captures function source code and metadata
 */

class FunctionTracker {
  constructor(page, functionTrackingQueue, networkQueue) {
    this.page = page;
    this.functionTrackingQueue = functionTrackingQueue;
    this.networkQueue = networkQueue;
    this.trackedFunctions = new Map();
    this.networkRequestMap = new Map();
    this.eventListenerMap = new Map();
    this.functionCallId = 0;
    this.useInjection = true; // Enable injection-based tracking
  }

  /**
   * Inject tracking code directly into function bodies
   * NOTE: This is disabled by default as the wrapper system is more reliable
   */
  async injectIntoFunction(functionPath) {
    return await this.page.evaluate((path) => {
      try {
        const pathParts = path.split('.');
        let obj = window;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
          obj = obj[pathParts[i]];
          if (!obj) return { success: false, error: 'Path not found' };
        }
        
        const funcName = pathParts[pathParts.length - 1];
        const originalFunc = obj[funcName];
        
        if (typeof originalFunc !== 'function') {
          return { success: false, error: 'Not a function' };
        }

        // Skip if already wrapped or injected
        if (originalFunc.__isWrapped || originalFunc.__isInjected) {
          return { success: false, error: 'Already wrapped or injected' };
        }

        // Store original
        if (!window.__injectedFunctions) {
          window.__injectedFunctions = new Map();
        }
        
        // Check if it's a native function - can't inject into those
        const originalSource = originalFunc.toString();
        if (originalSource.includes('[native code]')) {
          return { success: false, error: 'Cannot inject into native function' };
        }
        
        window.__injectedFunctions.set(path, originalFunc);

        // For complex functions, use wrapper approach instead
        // This is more reliable than trying to parse and rewrite
        const wrappedFunc = function(...args) {
          try {
            if (window.__functionTracker && window.__functionTracker.callId !== undefined) {
              const __callId = ++window.__functionTracker.callId;
              const __stackError = new Error();
              if (window.__functionTracker.calls) {
                window.__functionTracker.calls.push({
                  type: 'injected_internal',
                  callId: __callId,
                  functionName: path,
                  arguments: Array.from(args).map((arg, i) => ({
                    index: i,
                    type: typeof arg,
                    value: typeof arg === 'object' ? JSON.stringify(arg, null, 2).substring(0, 1000) : String(arg).substring(0, 500)
                  })),
                  stackTrace: __stackError.stack ? __stackError.stack.split('\n') : [],
                  timestamp: Date.now(),
                  url: window.location.href
                });
              }
            }
          } catch(__e) { /* Ignore tracking errors */ }
          
          return originalFunc.apply(this, args);
        };
        
        // Mark as injected
        wrappedFunc.__isInjected = true;
        wrappedFunc.__originalFunction = originalFunc;
        
        // Copy properties
        Object.getOwnPropertyNames(originalFunc).forEach(prop => {
          try {
            if (prop !== 'length' && prop !== 'name' && prop !== 'prototype') {
              wrappedFunc[prop] = originalFunc[prop];
            }
          } catch (e) {}
        });

        // Replace
        obj[funcName] = wrappedFunc;

        return { 
          success: true, 
          path: path,
          method: 'wrapper',
          originalLength: originalSource.length
        };

      } catch (error) {
        return { 
          success: false, 
          error: error.message,
          stack: error.stack
        };
      }
    }, functionPath);
  }

  /**
   * Initialize function tracking by injecting tracking code into the page
   */
  async initialize() {
    try {
      // Note: We don't inject into common functions at initialization
      // The wrapper system handles this more reliably
      
      // Inject the function tracking script into the page
      await this.page.evaluateOnNewDocument(() => {
        // Persistent storage functions
        window.__saveTrackerData = function() {
          try {
            if (window.__functionTracker) {
              const dataToSave = {
                callId: window.__functionTracker.callId,
                calls: window.__functionTracker.calls,
                eventListeners: window.__functionTracker.eventListeners,
                timestamp: Date.now(),
                url: window.location.href
              };
              sessionStorage.setItem('__functionTrackerBackup', JSON.stringify(dataToSave));
            }
          } catch (e) {
            console.warn('Failed to save tracker data:', e.message);
          }
        };

        window.__loadTrackerData = function() {
          try {
            const saved = sessionStorage.getItem('__functionTrackerBackup');
            if (saved) {
              const data = JSON.parse(saved);
              return {
                callId: data.callId || 0,
                calls: data.calls || [],
                eventListeners: data.eventListeners || []
              };
            }
          } catch (e) {
            console.warn('Failed to load tracker data:', e.message);
          }
          return { callId: 0, calls: [], eventListeners: [] };
        };

        // Persistent tracker initialization function
        window.__initializeTracker = function() {
          // Load previous data if available
          const previousData = window.__loadTrackerData();
          
          // Initialize comprehensive function tracker
          window.__functionTracker = {
            callId: previousData.callId,
            calls: previousData.calls,
            eventListeners: previousData.eventListeners,
            functionToRequestMap: new Map(),
            activeNetworkRequests: new Map(), // requestId -> {url, method, timestamp}
            hijackedFunctions: new Set(), // Track what we've already hijacked
            originalFunctions: new Map(), // Store original function references
            variableCapture: {
              maxDepth: 5, // Increased depth for better object capture
              maxArrayLength: 100, // Capture more array elements
              maxStringLength: 50000 // Capture full strings and function bodies
            }
          };
          
          console.log(`Tracker initialized with ${previousData.calls.length} previous calls`);
        };

        // Initialize tracker immediately
        window.__initializeTracker();
        
        // Add a backup initialization check
        window.__ensureTrackerExists = function() {
          if (!window.__functionTracker) {
            console.warn('Function tracker missing, re-initializing...');
            window.__initializeTracker();
          }
          return window.__functionTracker;
        };

        // Auto-save tracker data every 2 seconds
        setInterval(() => {
          window.__saveTrackerData();
          if (!window.__functionTracker) {
            console.warn('Function tracker was cleared, re-initializing...');
            window.__initializeTracker();
          }
        }, 2000);

        // Re-initialize on page visibility change (handles tab switching)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            window.__saveTrackerData(); // Save before tab switch
          } else if (!window.__functionTracker && document.visibilityState === 'visible') {
            console.warn('Function tracker missing on visibility change, re-initializing...');
            window.__initializeTracker();
          }
        });

        // Save data before page unload
        window.addEventListener('beforeunload', () => {
          window.__saveTrackerData();
        });

        // Helper function to get stack trace
        window.__getStackTrace = function() {
          const stack = new Error().stack;
          return stack ? stack.split('\n').slice(2) : [];
        };

        // Enhanced deep variable serialization
        window.__serializeValue = function(value, depth = 0, maxDepth = 3) {
          const config = window.__functionTracker.variableCapture;
          
          if (depth > maxDepth) return { type: 'max_depth_reached', depth };
          if (value === null) return { type: 'null', value: null };
          if (value === undefined) return { type: 'undefined', value: undefined };
          
          const type = typeof value;
          
          try {
            if (type === 'function') {
              return {
                type: 'function',
                name: value.name || 'anonymous',
                source: value.toString(), // Capture full function source
                prototype: value.prototype ? Object.getOwnPropertyNames(value.prototype) : [],
                properties: Object.getOwnPropertyNames(value)
              };
            }
            
            if (type === 'object') {
              if (Array.isArray(value)) {
                return {
                  type: 'array',
                  length: value.length,
                  elements: value.slice(0, config.maxArrayLength).map(el => 
                    window.__serializeValue(el, depth + 1, maxDepth)
                  )
                };
              }

              if (value instanceof Date) {
                return { type: 'date', value: value.toISOString() };
              }
              
              if (value instanceof Error) {
                return {
                  type: 'error',
                  name: value.name,
                  message: value.message,
                  stack: value.stack
                };
              }
              
              // Regular object - capture properties recursively
              const obj = {
                type: 'object',
                constructor: value.constructor ? value.constructor.name : 'Object',
                properties: {}
              };
              
              const keys = Object.getOwnPropertyNames(value); // Capture all properties
              for (const key of keys) {
                try {
                  obj.properties[key] = window.__serializeValue(value[key], depth + 1, maxDepth);
                } catch (e) {
                  obj.properties[key] = { type: 'error', message: e.message };
                }
              }
              
              return obj;
            }
            
            if (type === 'string') {
              return {
                type: 'string',
                value: value, // Capture full string
                length: value.length,
                truncated: false
              };
            }
            
            return {
              type: type,
              value: value
            };
          } catch (e) {
            return {
              type: 'serialization_error',
              error: e.message
            };
          }
        };
        
        // Function to serialize parameters with full data capture
        window.__serializeParams = function(params) {
          return params.map((param, index) => ({
            paramIndex: index,
            ...window.__serializeValue(param)
          }));
        };

        // Safe function wrapper with recursion prevention
        window.__wrapFunction = function(obj, funcName, originalFunc) {
          // Prevent wrapping already wrapped functions
          if (originalFunc.__isWrapped) {
            return originalFunc;
          }
          
          // Check if this function was already injected or wrapped - don't double-wrap
          if (originalFunc.__isInjected || (window.__injectedFunctions && window.__injectedFunctions.has(funcName))) {
            return originalFunc; // Already has internal tracking
          }
          
          const wrappedFunction = function(...args) {
            // Prevent recursive wrapping calls
            if (wrappedFunction.__executing) {
              return originalFunc.apply(this, args);
            }
            
            // Safety check - ensure tracker exists
            if (!window.__functionTracker || !window.__functionTracker.calls) {
              return originalFunc.apply(this, args);
            }
            
            wrappedFunction.__executing = true;
            
            try {
              const callId = ++window.__functionTracker.callId;
              
              // Full parameter capture with deep serialization
              let serializedParams = [];
              try {
                serializedParams = window.__serializeParams(args);
              } catch (e) {
                serializedParams = [{ error: 'Parameter serialization failed', message: e.message }];
              }
              
              // Full stack trace capture with safety limits
              let stackTrace = [];
              try {
                const stack = new Error().stack;
                if (stack) {
                  const frames = stack.split('\n').slice(2);
                  // Limit to 50 frames to prevent issues with detached frames or infinite recursion
                  stackTrace = frames.slice(0, 50);
                } else {
                  stackTrace = [];
                }
              } catch (e) {
                stackTrace = ['Stack trace unavailable: ' + e.message];
              }
              
              // Log function call with minimal data to prevent recursion
              const callInfo = {
                type: 'external_wrapper',
                callId,
                functionName: funcName,
                objectName: obj && obj.constructor ? obj.constructor.name : 'unknown',
                parameters: serializedParams,
                stackTrace: stackTrace,
                url: window.location.href,
                timestamp: Date.now(),
                success: true
              };

              // Add to calls array safely
              if (window.__functionTracker.calls) {
                window.__functionTracker.calls.push(callInfo);
              }

              // Call original function
              const result = originalFunc.apply(this, args);
              
              // Capture full result info with serialization
              try {
                callInfo.resultType = typeof result;
                callInfo.isPromise = result && typeof result.then === 'function';
                callInfo.result = window.__serializeValue(result, 0, 3);
              } catch (e) {
                callInfo.resultError = e.message;
              }
              
              return result;
            } catch (error) {
              // Log error without complex serialization
              try {
                if (window.__functionTracker && window.__functionTracker.calls) {
                  const errorInfo = {
                    callId: window.__functionTracker.callId,
                    functionName: funcName,
                    error: error.message,
                    timestamp: Date.now(),
                    success: false
                  };
                  window.__functionTracker.calls.push(errorInfo);
                }
              } catch (e) {
                // Ignore logging errors
              }
              
              throw error;
            } finally {
              wrappedFunction.__executing = false;
            }
          };
          
          // Mark as wrapped to prevent double-wrapping
          wrappedFunction.__isWrapped = true;
          wrappedFunction.__originalFunction = originalFunc;
          
          return wrappedFunction;
        };

        // Safe function hijacking - avoid core Object methods and infinite recursion
        const hijackAllFunctions = function() {
          // Track what we've already hijacked to avoid infinite loops
          const hijacked = window.__functionTracker.hijackedFunctions;
          const originals = window.__functionTracker.originalFunctions;
          
          // Store original Object methods to avoid corruption
          if (!window.__originalObjectMethods) {
            window.__originalObjectMethods = {
              defineProperty: Object.defineProperty,
              getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
              getOwnPropertyNames: Object.getOwnPropertyNames,
              getPrototypeOf: Object.getPrototypeOf
            };
          }
          
          // NEVER hijack core Object methods - this causes infinite recursion
          const forbiddenMethods = new Set([
            'Object.defineProperty',
            'Object.getOwnPropertyDescriptor', 
            'Object.getOwnPropertyNames',
            'Object.getPrototypeOf',
            'Object.prototype.toString',
            'Object.prototype.valueOf',
            'Object.prototype.hasOwnProperty',
            'Function.prototype.call',
            'Function.prototype.apply',
            'Function.prototype.bind'
          ]);
          
          // Hijack fetch separately (it's a function, not a method)
          // Skip if already injected
          if (!hijacked.has('fetch') && typeof window.fetch === 'function') {
            if (!window.__injectedFunctions || !window.__injectedFunctions.has('fetch')) {
              originals.set('fetch', window.fetch);
              window.fetch = window.__wrapFunction(window, 'fetch', originals.get('fetch'));
              hijacked.add('fetch');
            }
          }
          
          // Safe targets - avoid Object.prototype and other dangerous objects
          const safeTargets = [
            { obj: XMLHttpRequest.prototype, name: 'XMLHttpRequest.prototype', methods: ['open', 'send', 'setRequestHeader'] },
            { obj: EventTarget.prototype, name: 'EventTarget.prototype', methods: ['addEventListener', 'removeEventListener', 'dispatchEvent'] },
            { obj: Element.prototype, name: 'Element.prototype', methods: ['querySelector', 'querySelectorAll', 'getAttribute', 'setAttribute'] },
            { obj: document, name: 'document', methods: ['querySelector', 'querySelectorAll', 'getElementById', 'createElement'] }
          ];

          safeTargets.forEach(({ obj, name, methods }) => {
            if (!obj) return;
            
            methods.forEach(methodName => {
              const hijackKey = `${name}.${methodName}`;
              if (hijacked.has(hijackKey) || forbiddenMethods.has(hijackKey)) return;
              
              try {
                if (typeof obj[methodName] === 'function') {
                  const originalFunc = obj[methodName];
                  originals.set(hijackKey, originalFunc);
                  const wrappedFunc = window.__wrapFunction(obj, hijackKey, originalFunc);
                  
                  // Use original defineProperty to avoid recursion
                  window.__originalObjectMethods.defineProperty(obj, methodName, {
                    value: wrappedFunc,
                    writable: true,
                    configurable: true,
                    enumerable: false
                  });
                  
                  hijacked.add(hijackKey);
                }
              } catch (e) {
                // Skip methods that can't be hijacked
              }
            });
          });
          
          // Hijack specific timing functions safely
          ['setTimeout', 'setInterval', 'requestAnimationFrame'].forEach(funcName => {
            if (!hijacked.has(funcName) && typeof window[funcName] === 'function') {
              // Skip if already injected
              if (window.__injectedFunctions && window.__injectedFunctions.has(funcName)) {
                return;
              }
              try {
                originals.set(funcName, window[funcName]);
                window[funcName] = window.__wrapFunction(window, funcName, originals.get(funcName));
                hijacked.add(funcName);
              } catch (e) {
                // Skip if can't hijack
              }
            }
          });
        };

        // Initialize comprehensive hijacking
        hijackAllFunctions();
        
        // Minimal monitoring to avoid excessive re-hijacking
        const observeNewFunctions = function() {
          // Only re-hijack occasionally to avoid performance issues
          const rehijackInterval = setInterval(() => {
            try {
              hijackAllFunctions();
            } catch (e) {
              console.warn('Re-hijack failed:', e.message);
            }
          }, 10000); // Reduced frequency to 10 seconds
          
          // Clear interval after 2 minutes to prevent long-running issues
          setTimeout(() => {
            clearInterval(rehijackInterval);
          }, 120000);
        };
        
        // Start observing only after DOM is ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', observeNewFunctions);
        } else {
          setTimeout(observeNewFunctions, 1000); // Delay initial execution
        }

        // Simplified event listener tracking to avoid recursion
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          // Skip wrapping if already wrapped or if it's our own tracking
          if (listener.__isWrapped || typeof listener !== 'function') {
            return originalAddEventListener.call(this, type, listener, options);
          }
          
          const listenerId = ++window.__functionTracker.callId;
          
          // Simple wrapper to avoid complex serialization
          const wrappedListener = function(event) {
            // Prevent recursive calls
            if (wrappedListener.__executing) {
              return listener.call(this, event);
            }
            
            wrappedListener.__executing = true;
            
            try {
              const eventCallId = ++window.__functionTracker.callId;
              
              // Simple event info without deep serialization
              const eventInfo = {
                callId: eventCallId,
                listenerId: listenerId,
                eventType: type,
                target: this.tagName || this.constructor.name,
                timestamp: Date.now(),
                url: window.location.href
              };

              if (window.__functionTracker.eventListeners) {
                window.__functionTracker.eventListeners.push(eventInfo);
              }

              return listener.call(this, event);
            } catch (error) {
              // Simple error logging
              try {
                if (window.__functionTracker.eventListeners) {
                  window.__functionTracker.eventListeners.push({
                    callId: window.__functionTracker.callId,
                    eventType: type,
                    error: error.message,
                    timestamp: Date.now()
                  });
                }
              } catch (e) {
                // Ignore logging errors
              }
              throw error;
            } finally {
              wrappedListener.__executing = false;
            }
          };

          wrappedListener.__isWrapped = true;
          return originalAddEventListener.call(this, type, wrappedListener, options);
        };
      });
    } catch (error) {
      console.error('Error initializing function tracker:', error.message);
    }
  }

  /**
   * Inject into commonly used JavaScript functions
   * NOTE: This is now optional - the wrapper system is more reliable
   */
  async injectIntoCommonFunctions() {
    const functionsToInject = [
      'fetch',
      'setTimeout',
      'setInterval',
      'requestAnimationFrame'
    ];

    console.log('Injecting tracking code into common functions (optional)...');
    
    for (const funcPath of functionsToInject) {
      try {
        const result = await this.injectIntoFunction(funcPath);
        if (result.success) {
          console.log(`✓ Injected into ${funcPath}`);
        } else {
          console.log(`ℹ Skipped ${funcPath}: ${result.error}`);
        }
      } catch (error) {
        console.log(`ℹ Skipped ${funcPath}: ${error.message}`);
      }
    }
  }

  /**
   * Track commonly used JavaScript functions (wrapper-based fallback)
   */
  async trackCommonFunctions() {
    await this.page.evaluate(() => {
      // Ensure tracker exists and is properly initialized
      if (!window.__functionTracker) {
        // Try the backup initialization function first
        if (typeof window.__ensureTrackerExists === 'function') {
          window.__ensureTrackerExists();
        } else if (typeof window.__initializeTracker === 'function') {
          window.__initializeTracker();
        } else {
          // Fallback initialization if the functions don't exist
          console.warn('Function tracker initialization functions not found, creating fallback tracker');
          window.__functionTracker = {
            callId: 0,
            calls: [],
            eventListeners: [],
            functionToRequestMap: new Map(),
            activeNetworkRequests: new Map(),
            hijackedFunctions: new Set(),
            originalFunctions: new Map(),
            variableCapture: {
              maxDepth: 5,
              maxArrayLength: 100,
              maxStringLength: 50000
            }
          };
        }
      }
      
      // Ensure originalFunctions Map exists
      if (!window.__functionTracker.originalFunctions) {
        window.__functionTracker.originalFunctions = new Map();
      }
      
      // Track fetch API with network request correlation
      if (window.fetch) {
        const originalFetch = window.fetch;
        window.__functionTracker.originalFunctions.set('fetch', originalFetch);
        window.fetch = function(...args) {
          const callId = ++window.__functionTracker.callId;
          const url = args[0];
          const options = args[1] || {};
          
          // Create a unique request identifier
          const requestId = 'fetch_' + callId + '_' + Date.now();
          
          // Track this as an active request
          window.__functionTracker.activeNetworkRequests.set(requestId, {
            type: 'fetch',
            url: url,
            method: options.method || 'GET',
            callId: callId,
            timestamp: Date.now()
          });
          
          const result = originalFetch.apply(this, args);
          
          // Track the promise resolution
          if (result && typeof result.then === 'function') {
            result.then(
              (response) => {
                // Update request info with response
                const requestInfo = window.__functionTracker.activeNetworkRequests.get(requestId);
                if (requestInfo) {
                  requestInfo.status = response.status;
                  requestInfo.statusText = response.statusText;
                  requestInfo.completed = Date.now();
                }
              },
              (error) => {
                // Update request info with error
                const requestInfo = window.__functionTracker.activeNetworkRequests.get(requestId);
                if (requestInfo) {
                  requestInfo.error = error.message;
                  requestInfo.completed = Date.now();
                }
              }
            );
          }
          
          return result;
        };
      }

      // Track XMLHttpRequest with network request correlation
      if (window.XMLHttpRequest) {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        
        // Ensure originalFunctions exists before using it
        if (!window.__functionTracker.originalFunctions) {
          window.__functionTracker.originalFunctions = new Map();
        }
        
        window.__functionTracker.originalFunctions.set('XMLHttpRequest.open', originalOpen);
        window.__functionTracker.originalFunctions.set('XMLHttpRequest.send', originalSend);
        
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
          const callId = ++window.__functionTracker.callId;
          const requestId = 'xhr_' + callId + '_' + Date.now();
          
          // Store request ID on the XHR object
          this._requestId = requestId;
          
          // Track this as an active request
          window.__functionTracker.activeNetworkRequests.set(requestId, {
            type: 'XMLHttpRequest',
            method: method,
            url: url,
            callId: callId,
            timestamp: Date.now()
          });
          
          return originalOpen.call(this, method, url, async, user, password);
        };
        
        XMLHttpRequest.prototype.send = function(data) {
          const requestId = this._requestId;
          const requestInfo = window.__functionTracker.activeNetworkRequests.get(requestId);
          
          if (requestInfo) {
            requestInfo.data = data;
            requestInfo.sent = Date.now();
          }
          
          // Add event listeners to track completion
          this.addEventListener('loadend', () => {
            if (requestInfo) {
              requestInfo.status = this.status;
              requestInfo.statusText = this.statusText;
              requestInfo.responseURL = this.responseURL;
              requestInfo.completed = Date.now();
            }
          });
          
          return originalSend.call(this, data);
        };
      }

      // Track common DOM methods
      const domMethods = [
        'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName',
        'createElement', 'appendChild', 'removeChild', 'insertBefore'
      ];

      domMethods.forEach(method => {
        if (document[method]) {
          const original = document[method];
          // Ensure originalFunctions exists
          if (!window.__functionTracker.originalFunctions) {
            window.__functionTracker.originalFunctions = new Map();
          }
          window.__functionTracker.originalFunctions.set(`document.${method}`, original);
          document[method] = window.__wrapFunction(document, `document.${method}`, original);
        }
      });

      // Track console methods
      const consoleMethods = ['log', 'warn', 'error', 'info', 'debug'];
      consoleMethods.forEach(method => {
        if (console[method]) {
          const original = console[method];
          // Ensure originalFunctions exists
          if (!window.__functionTracker.originalFunctions) {
            window.__functionTracker.originalFunctions = new Map();
          }
          window.__functionTracker.originalFunctions.set(`console.${method}`, original);
          console[method] = window.__wrapFunction(console, `console.${method}`, original);
        }
      });

      // Track setTimeout and setInterval
      if (window.setTimeout) {
        const originalSetTimeout = window.setTimeout;
        // Ensure originalFunctions exists
        if (!window.__functionTracker.originalFunctions) {
          window.__functionTracker.originalFunctions = new Map();
        }
        window.__functionTracker.originalFunctions.set('setTimeout', originalSetTimeout);
        window.setTimeout = window.__wrapFunction(window, 'setTimeout', originalSetTimeout);
      }

      if (window.setInterval) {
        const originalSetInterval = window.setInterval;
        // Ensure originalFunctions exists
        if (!window.__functionTracker.originalFunctions) {
          window.__functionTracker.originalFunctions = new Map();
        }
        window.__functionTracker.originalFunctions.set('setInterval', originalSetInterval);
        window.setInterval = window.__wrapFunction(window, 'setInterval', originalSetInterval);
      }
    });
  }

  /**
   * Set up periodic collection of tracking data
   */
  async setupPeriodicCollection() {
    // Collect data every 5 seconds
    const collectData = async () => {
      try {
        const trackingData = await this.page.evaluate(() => {
          if (!window.__functionTracker) {
            return { functionCalls: [], eventListeners: [], timestamp: Date.now(), url: window.location.href };
          }
          const data = {
            functionCalls: (window.__functionTracker.calls || []).splice(0),
            eventListeners: (window.__functionTracker.eventListeners || []).splice(0),
            timestamp: Date.now(),
            url: window.location.href
          };
          return data;
        });

        // Log collected data
        if (trackingData.functionCalls.length > 0 || trackingData.eventListeners.length > 0) {
          this.functionTrackingQueue.enqueue({
            event: 'functionTrackingData',
            data: trackingData,
            timestamp: Date.now()
          });
        }

      } catch (error) {
        console.warn('Error collecting function tracking data:', error.message);
      }
    };

    // Start periodic collection
    this.collectionInterval = setInterval(collectData, 5000);
    
    // Also collect on page navigation
    this.page.on('framenavigated', collectData);
  }

  /**
   * Track specific functions by name or pattern
   */
  async trackSpecificFunction(functionPath, options = {}) {
    const { captureSource = true, captureParams = true, captureReturn = true } = options;
    
    await this.page.evaluate((path, opts) => {
      try {
        // Navigate to the function using the path (e.g., 'window.myFunction' or 'document.getElementById')
        const pathParts = path.split('.');
        let obj = window;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
          obj = obj[pathParts[i]];
          if (!obj) return false;
        }
        
        const funcName = pathParts[pathParts.length - 1];
        const originalFunc = obj[funcName];
        
        if (typeof originalFunc !== 'function') {
          console.warn(`${path} is not a function`);
          return false;
        }

        // Store original function
        window.__functionTracker.originalFunctions.set(path, originalFunc);
        
        // Replace with wrapped version
        obj[funcName] = window.__wrapFunction(obj, path, originalFunc);
        
        return true;
      } catch (error) {
        console.error(`Failed to track function ${path}:`, error.message);
        return false;
      }
    }, functionPath, options);
  }

  /**
   * Link function calls with network requests
   */
  linkWithNetworkRequests(networkRequestData) {
    // Store network request data for correlation
    this.networkRequestMap.set(networkRequestData.requestId, {
      ...networkRequestData,
      timestamp: Date.now()
    });
  }

  /**
   * Get comprehensive tracking report
   */
  async getTrackingReport() {
    try {
      const finalData = await this.page.evaluate(() => {
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
      });

      return {
        ...finalData,
        networkRequests: Array.from(this.networkRequestMap.values()),
        summary: {
          totalFunctionCalls: finalData.functionCalls.length,
          totalEventListeners: finalData.eventListeners.length,
          totalNetworkRequests: this.networkRequestMap.size,
          trackedFunctionCount: finalData.trackedFunctions.length
        }
      };
    } catch (error) {
      console.error('Error generating tracking report:', error.message);
      return null;
    }
  }

  /**
   * Cleanup tracking resources
   */
  cleanup() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
  }
}

module.exports = { FunctionTracker };
