// function_injector.js
// Advanced function rewriting with code injection for internal execution tracking

/**
 * Injects tracking code directly into function bodies by rewriting them
 * This captures internal execution flow, not just external calls
 */

class FunctionInjector {
  constructor(functionTrackingQueue) {
    this.functionTrackingQueue = functionTrackingQueue;
    this.injectedFunctions = new Map();
  }

  /**
   * Initialize injection by adding helper functions to the page
   */
  async initialize(page) {
    await page.evaluateOnNewDocument(() => {
      // Global tracking helper that will be called from inside injected functions
      window.__trackInternalExecution = function(functionName, internalCallId, stackInfo) {
        // Safety check - ensure tracker exists
        if (!window.__functionTracker || !window.__functionTracker.calls) return;
        
        try {
          window.__functionTracker.calls.push({
            type: 'internal_execution',
            functionName: functionName,
            internalCallId: internalCallId,
            stackTrace: stackInfo.stack ? stackInfo.stack.split('\n') : [],
            timestamp: Date.now(),
            url: window.location.href
          });
        } catch (e) {
          // Silently fail to not break original function
        }
      };
    });
  }

  /**
   * Rewrite a function with injected tracking code
   */
  async injectIntoFunction(page, functionPath) {
    return await page.evaluate((path) => {
      try {
        // Navigate to the function
        const pathParts = path.split('.');
        let obj = window;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
          obj = obj[pathParts[i]];
          if (!obj) return { success: false, error: 'Path not found' };
        }
        
        const funcName = pathParts[pathParts.length - 1];
        let originalFunc = obj[funcName];
        
        if (typeof originalFunc !== 'function') {
          return { success: false, error: 'Not a function' };
        }
        
        // If already wrapped, get the original function
        if (originalFunc.__isWrapped && originalFunc.__originalFunction) {
          originalFunc = originalFunc.__originalFunction;
        }

        // Check if already injected
        if (originalFunc.__isInjected) {
          return { success: false, error: 'Already injected' };
        }
        
        // Get the original function source
        const originalSource = originalFunc.toString();
        
        // Check if it's a native function
        if (originalSource.includes('[native code]')) {
          return { success: false, error: 'Cannot inject into native function' };
        }
        
        // Store original for reference
        if (!window.__injectedFunctions) {
          window.__injectedFunctions = new Map();
        }
        window.__injectedFunctions.set(path, originalFunc);

        // Parse function to inject code at the beginning
        const injectedCode = `
          // INJECTED TRACKING CODE START
          try {
            if (window.__functionTracker && window.__functionTracker.callId !== undefined) {
              const __internalCallId = ++window.__functionTracker.callId;
              const __trackingError = new Error();
              if (window.__trackInternalExecution) {
                window.__trackInternalExecution('${path}', __internalCallId, {
                  stack: __trackingError.stack,
                  arguments: Array.from(arguments)
                });
              }
            }
          } catch(__e) { /* Ignore tracking errors */ }
          // INJECTED TRACKING CODE END
        `;

        // Detect if it's an arrow function or regular function
        const isArrowFunction = originalSource.includes('=>');
        const isAsyncFunction = originalSource.trim().startsWith('async');
        
        let newFunctionBody;
        
        if (isArrowFunction) {
          // Arrow function: (args) => { body } or (args) => expression
          const arrowMatch = originalSource.match(/\((.*?)\)\s*=>\s*(\{[\s\S]*\}|[^{].*)/);
          if (!arrowMatch) {
            return { success: false, error: 'Could not parse arrow function' };
          }
          
          const params = arrowMatch[1];
          const body = arrowMatch[2];
          
          // If body is an expression (no braces), wrap it
          if (!body.trim().startsWith('{')) {
            newFunctionBody = `(${params}) => { ${injectedCode} return (${body}); }`;
          } else {
            // Body has braces, inject at start
            const bodyContent = body.slice(1, -1); // Remove { }
            newFunctionBody = `(${params}) => { ${injectedCode} ${bodyContent} }`;
          }
          
          if (isAsyncFunction) {
            newFunctionBody = 'async ' + newFunctionBody;
          }
        } else {
          // Regular function: function name(args) { body }
          const funcMatch = originalSource.match(/function\s*\w*\s*\((.*?)\)\s*\{([\s\S]*)\}/);
          if (!funcMatch) {
            return { success: false, error: 'Could not parse function' };
          }
          
          const params = funcMatch[1];
          const body = funcMatch[2];
          
          newFunctionBody = `function(${params}) { ${injectedCode} ${body} }`;
          
          if (isAsyncFunction) {
            newFunctionBody = 'async ' + newFunctionBody;
          }
        }

        // Create the new function
        let newFunc;
        try {
          newFunc = eval(`(${newFunctionBody})`);
        } catch (evalError) {
          return { 
            success: false, 
            error: 'Failed to eval new function: ' + evalError.message,
            attemptedSource: newFunctionBody
          };
        }

        // Mark as injected
        newFunc.__isInjected = true;
        newFunc.__originalFunction = originalFunc;

        // Copy properties from original function
        Object.getOwnPropertyNames(originalFunc).forEach(prop => {
          try {
            if (prop !== 'length' && prop !== 'name' && prop !== 'prototype' && !prop.startsWith('__')) {
              newFunc[prop] = originalFunc[prop];
            }
          } catch (e) {
            // Some properties can't be copied
          }
        });

        // Replace the original function
        try {
          obj[funcName] = newFunc;
        } catch (e) {
          return { success: false, error: 'Could not replace function: ' + e.message };
        }

        return { 
          success: true, 
          functionPath: path,
          originalSource: originalSource.substring(0, 500),
          injectedSource: newFunctionBody.substring(0, 500)
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
   * Inject into multiple common functions and discover user-defined functions
   */
  async injectIntoCommonFunctions(page) {
    const results = [];
    
    // First, try to discover user-defined functions that can be injected
    console.log('Scanning for user-defined functions...');
    const userFunctions = await this.discoverUserDefinedFunctions(page);
    
    if (userFunctions.length > 0) {
      console.log(`Found ${userFunctions.length} user-defined functions to inject into`);
      
      for (const funcPath of userFunctions) {
        try {
          const result = await this.injectIntoFunction(page, funcPath);
          results.push({ path: funcPath, ...result });
          
          if (result.success) {
            console.log(`✓ Injected into ${funcPath}`);
          } else {
            console.log(`✗ Failed to inject into ${funcPath}: ${result.error}`);
          }
        } catch (error) {
          results.push({ 
            path: funcPath, 
            success: false, 
            error: error.message 
          });
        }
      }
    } else {
      console.log('No user-defined functions found for injection');
    }

    // Store function sources for reporting
    await this.storeFunctionSources(page);

    return results;
  }

  /**
   * Store discovered function sources for later retrieval
   */
  async storeFunctionSources(page) {
    const functionSources = await page.evaluate(() => {
      if (window.__discoveredFunctionSources) {
        const sources = {};
        window.__discoveredFunctionSources.forEach((source, path) => {
          sources[path] = source;
        });
        return sources;
      }
      return {};
    });

    this.discoveredFunctionSources = functionSources;
  }

  /**
   * Get discovered function sources
   */
  getFunctionSources() {
    return this.discoveredFunctionSources || {};
  }

  /**
   * Discover user-defined functions that can be injected into
   */
  async discoverUserDefinedFunctions(page) {
    return await page.evaluate(() => {
      const userFunctions = [];
      const functionSources = new Map(); // Store function source code
      
      // 1. Scan global objects for runtime functions
      const objectsToCheck = [
        { obj: window, prefix: 'window' },
        { obj: document, prefix: 'document' }
      ];
      
      // Add any custom global objects that might exist
      for (const key of Object.getOwnPropertyNames(window)) {
        if (typeof window[key] === 'object' && 
            window[key] !== null && 
            !key.startsWith('_') && 
            key !== 'window' && 
            key !== 'document' &&
            key !== 'console' &&
            !['location', 'navigator', 'screen', 'history'].includes(key)) {
          try {
            objectsToCheck.push({ obj: window[key], prefix: key });
          } catch (e) {
            // Skip if we can't access
          }
        }
      }
      
      // Scan runtime objects
      for (const { obj, prefix } of objectsToCheck) {
        try {
          const props = Object.getOwnPropertyNames(obj);
          
          for (const prop of props) {
            try {
              const value = obj[prop];
              
              if (typeof value === 'function') {
                const source = value.toString();
                
                // Only target user-defined functions (not native code)
                if (!source.includes('[native code]') && 
                    !value.__isWrapped && 
                    !value.__isInjected) {
                  
                  const funcPath = prefix === 'window' ? prop : `${prefix}.${prop}`;
                  userFunctions.push(funcPath);
                  functionSources.set(funcPath, source);
                }
              }
            } catch (e) {
              // Skip properties we can't access
            }
          }
        } catch (e) {
          // Skip objects we can't enumerate
        }
      }
      
      // 2. Scan all script tags for function definitions
      const scriptTags = document.querySelectorAll('script');
      for (let i = 0; i < scriptTags.length; i++) {
        const script = scriptTags[i];
        if (script.src) {
          // External script - we can't access content due to CORS, but note it exists
          continue;
        } else if (script.textContent) {
          // Inline script - scan for function definitions
          const scriptContent = script.textContent;
          
          // Find function declarations: function name() { ... }
          const functionDeclarations = scriptContent.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{[^}]*\}/g);
          if (functionDeclarations) {
            functionDeclarations.forEach(funcDef => {
              const nameMatch = funcDef.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
              if (nameMatch) {
                const funcName = nameMatch[1];
                const funcPath = `inline_script_${i}_${funcName}`;
                userFunctions.push(funcPath);
                functionSources.set(funcPath, funcDef);
              }
            });
          }
          
          // Find arrow functions: const name = () => { ... }
          const arrowFunctions = scriptContent.match(/(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\}/g);
          if (arrowFunctions) {
            arrowFunctions.forEach(funcDef => {
              const nameMatch = funcDef.match(/(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
              if (nameMatch) {
                const funcName = nameMatch[2];
                const funcPath = `inline_script_${i}_${funcName}`;
                userFunctions.push(funcPath);
                functionSources.set(funcPath, funcDef);
              }
            });
          }
          
          // Find object method definitions: obj.method = function() { ... }
          const objectMethods = scriptContent.match(/([a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function[^}]*\}/g);
          if (objectMethods) {
            objectMethods.forEach(funcDef => {
              const nameMatch = funcDef.match(/([a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*)/);
              if (nameMatch) {
                const funcPath = nameMatch[1];
                userFunctions.push(funcPath);
                functionSources.set(funcPath, funcDef);
              }
            });
          }
        }
      }
      
      // 3. Scan event handlers in HTML attributes
      const elementsWithEvents = document.querySelectorAll('*[onclick], *[onload], *[onchange], *[onsubmit], *[onmouseover], *[onmouseout]');
      for (let i = 0; i < elementsWithEvents.length; i++) {
        const element = elementsWithEvents[i];
        const eventAttrs = ['onclick', 'onload', 'onchange', 'onsubmit', 'onmouseover', 'onmouseout'];
        
        eventAttrs.forEach(attr => {
          const handler = element.getAttribute(attr);
          if (handler && handler.trim()) {
            const funcPath = `event_handler_${attr}_${i}`;
            userFunctions.push(funcPath);
            functionSources.set(funcPath, handler);
          }
        });
      }
      
      // Store function sources in global for retrieval
      if (!window.__discoveredFunctionSources) {
        window.__discoveredFunctionSources = new Map();
      }
      functionSources.forEach((source, path) => {
        window.__discoveredFunctionSources.set(path, source);
      });
      
      return userFunctions; // No artificial limits
    });
  }

  /**
   * Inject into all functions in a given object
   */
  async injectIntoObject(page, objectPath, maxDepth = 2) {
    return await page.evaluate((path, depth) => {
      const results = [];
      
      function traverseAndInject(obj, currentPath, currentDepth) {
        if (currentDepth > depth) return;
        if (!obj || typeof obj !== 'object') return;
        
        try {
          const props = Object.getOwnPropertyNames(obj);
          
          for (const prop of props) {
            try {
              const value = obj[prop];
              const fullPath = currentPath ? `${currentPath}.${prop}` : prop;
              
              if (typeof value === 'function') {
                // Found a function, attempt injection
                results.push({
                  path: fullPath,
                  attempted: true
                });
              } else if (typeof value === 'object' && value !== null) {
                // Recurse into objects
                traverseAndInject(value, fullPath, currentDepth + 1);
              }
            } catch (e) {
              // Skip properties we can't access
            }
          }
        } catch (e) {
          // Skip objects we can't enumerate
        }
      }
      
      // Start traversal
      const pathParts = path.split('.');
      let startObj = window;
      
      for (const part of pathParts) {
        startObj = startObj[part];
        if (!startObj) {
          return { success: false, error: 'Path not found' };
        }
      }
      
      traverseAndInject(startObj, path, 0);
      
      return {
        success: true,
        functionsFound: results.length,
        functions: results
      };
      
    }, objectPath, maxDepth);
  }
}

module.exports = { FunctionInjector };
