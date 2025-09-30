(() => {
      return Array.from(document.querySelectorAll('div, span, p'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          
          // Much more restrictive filtering to avoid navigation
          return rect.width > 20 && rect.height > 20 && 
                 rect.width < 200 && rect.height < 100 && // Avoid large clickable areas
                 style.visibility !== 'hidden' && 
                 style.display !== 'none' &&
                 style.cursor !== 'pointer' && // Avoid elements with pointer cursor
                 !el.closest('button, a, input, select, textarea, [onclick], [role="button"], [href], nav, header, footer, .nav, .menu, .link') &&
                 !el.textContent.toLowerCase().includes('click') &&
                 !el.textContent.toLowerCase().includes('link') &&
                 !el.getAttribute('class')?.toLowerCase().includes('link') &&
                 !el.getAttribute('class')?.toLowerCase().includes('button') &&
                 el.children.length === 0; // Only leaf elements
        })
        .slice(0, 20) // Limit to first 20 elements
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            tagName: el.tagName
          };
        });
    }
//# sourceURL=pptr:evaluate;simulateRandomClicks%20(%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fcdp_site_crawl%2Fbot_mitigation_final_fix.js%3A196%3A42)
)