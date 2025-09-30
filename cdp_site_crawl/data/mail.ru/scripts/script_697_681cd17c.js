(() => {
    const elements = [];
    
    // Define all possible input selectors
    const inputSelectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[type="password"]',
      'input[type="search"]',
      'input[type="tel"]',
      'input[type="url"]',
      'input[type="number"]',
      'input[type="date"]',
      'input[type="datetime-local"]',
      'input[type="month"]',
      'input[type="week"]',
      'input[type="time"]',
      'input[type="color"]',
      'input[type="range"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
      'input:not([type])', // inputs without type default to text
      'textarea',
      'select',
      '[contenteditable="true"]',
      '[contenteditable=""]'
    ];

    // Find elements using all selectors
    inputSelectors.forEach(selector => {
      try {
        const foundElements = document.querySelectorAll(selector);
        foundElements.forEach((el, index) => {
          // Skip hidden or disabled elements
          if (el.offsetParent === null || el.disabled) return;
          
          // Get element information
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          const elementInfo = {
            tagName: el.tagName.toLowerCase(),
            type: el.type || el.tagName.toLowerCase(),
            id: el.id || null,
            name: el.name || null,
            className: el.className || null,
            placeholder: el.placeholder || null,
            ariaLabel: el.getAttribute('aria-label') || null,
            selector: selector,
            index: index,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            visible: true,
            interactable: true
          };

          elements.push(elementInfo);
        });
      } catch (e) {
        console.warn(`Selector failed: ${selector}`, e.message);
      }
    });

    // Remove duplicates based on position and type
    const uniqueElements = [];
    const seen = new Set();
    
    elements.forEach(el => {
      const key = `${el.rect.x}-${el.rect.y}-${el.type}-${el.tagName}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueElements.push(el);
      }
    });

    return uniqueElements;
  }
//# sourceURL=pptr:evaluate;findAllInputElements%20(%2Fhome%2Fjlevitsky%2FDownloads%2Fcrawl%2FAgenticUse%2Fcdp_site_crawl%2Fenhanced_input_interaction.js%3A231%3A21)
)