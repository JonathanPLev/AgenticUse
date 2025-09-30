(() => {
    const searchElements = [];
    
    // Enhanced search patterns
    const searchPatterns = [
      new RegExp('search', 'i'), new RegExp('query', 'i'), new RegExp('find', 'i'), new RegExp('lookup', 'i'),
      new RegExp('filter', 'i'), new RegExp('explore', 'i'), new RegExp('discover', 'i')
    ];
    
    // Check all input elements
    const inputs = Array.from(document.querySelectorAll('input, textarea'));
    inputs.forEach(el => {
      try {
        // CRITICAL FIX: Safely handle className
        const className = el.className || '';
        const classString = typeof className === 'string' ? className : (className.toString ? className.toString() : '');
        const id = el.id || '';
        const placeholder = el.placeholder || '';
        const name = el.name || '';
        const type = el.type || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        
        // Check if any attribute matches search patterns
        const attributesToCheck = [classString, id, placeholder, name, type, ariaLabel];
        const matchesPattern = attributesToCheck.some(attr => 
          searchPatterns.some(pattern => pattern.test(attr))
        );
        
        if (matchesPattern) {
          searchElements.push({
            type: 'search_input',
            tagName: el.tagName,
            id: id,
            className: classString,
            placeholder: placeholder,
            name: name,
            inputType: type,
            ariaLabel: ariaLabel,
            // FIXED: Safe selector generation
            selector: id ? `#${id}` : (classString ? `.${classString.split(' ')[0]}` : el.tagName.toLowerCase()),
            detectionMethod: 'generic_search_pattern',
            isVisible: el.offsetWidth > 0 && el.offsetHeight > 0
          });
        }
      } catch (error) {
        console.warn('Error processing search element:', error.message);
      }
    });
    
    return searchElements;
    }
//# sourceURL=pptr:evaluate;detectSearchBarsGeneric%20(%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fcdp_site_crawl%2Fgeneric_detection_fixed.js%3A8%3A10)
)