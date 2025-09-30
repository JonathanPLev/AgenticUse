((scriptId, lineNum) => {
            try {
              // Try to get the script source
              const scripts = document.querySelectorAll('script');
              for (let script of scripts) {
                if (script.src && script.src.includes(scriptId)) {
                  return script.textContent || script.innerHTML;
                }
              }
              return null;
            } catch (e) {
              return null;
            }
          }
//# sourceURL=pptr:evaluate;%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fcdp_site_crawl%2Fenhanced_instrumentation_optimized.js%3A414%3A40
)