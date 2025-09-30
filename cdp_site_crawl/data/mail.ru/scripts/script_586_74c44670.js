(() => {
            try {
              const body = document.body || document.documentElement;
              if (body && body.scrollHeight) {
                window.scrollTo(0, body.scrollHeight / 2);
              }
            } catch (e) {
              // Ignore scroll errors on broken pages
            }
          }
//# sourceURL=pptr:evaluate;performGenericDetection%20(%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fcdp_site_crawl%2Fgeneric_detection_fixed.js%3A309%3A16)
)