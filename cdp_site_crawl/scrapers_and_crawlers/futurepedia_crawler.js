const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class FuturepediaCrawler {
    constructor() {
        this.baseUrl = 'https://www.futurepedia.io/ai-tools';
        this.tools = [];
        this.visitedCategories = new Set();
        this.maxScrolls = 10;
    }

    async crawl() {
        console.log('Starting Futurepedia AI tools crawler...');
        
        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security'
            ]
        });
        
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });
            
            // Start with the main AI tools page
            await this.crawlMainPage(page);
            
            // Try to find and crawl category pages
            await this.crawlCategories(page);
            
            console.log(`\nCrawling completed! Found ${this.tools.length} AI tools.`);
            await this.saveResults();
            
        } catch (error) {
            console.error('Error during crawling:', error);
        } finally {
            await browser.close();
        }
    }

    async crawlMainPage(page) {
        console.log(`\nCrawling main page: ${this.baseUrl}`);
        
        try {
            await page.goto(this.baseUrl, { 
                waitUntil: 'networkidle0',
                timeout: 60000 
            });

            // Wait for dynamic content to load
            await this.delay(3000);

            // Try to handle cookie banners or popups
            await this.handlePopups(page);

            // Scroll to load more content (infinite scroll)
            await this.scrollAndLoadContent(page);

            // Extract tools from the main page
            const mainPageTools = await this.extractToolsFromPage(page);
            console.log(`Found ${mainPageTools.length} tools on main page`);
            this.tools.push(...mainPageTools);

        } catch (error) {
            console.error('Error crawling main page:', error.message);
        }
    }

    async crawlCategories(page) {
        console.log('\nLooking for category pages...');
        
        try {
            // Go back to main page to find categories
            await page.goto(this.baseUrl, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });

            await this.delay(2000);

            // Extract category links
            const categoryUrls = await page.evaluate(() => {
                const categories = [];
                
                // Look for category navigation or filters
                const categorySelectors = [
                    'a[href*="category"]',
                    'a[href*="/ai-tools/"]',
                    '.category-link',
                    '.filter-link',
                    '.nav-link',
                    '[data-category]'
                ];

                for (const selector of categorySelectors) {
                    const links = Array.from(document.querySelectorAll(selector));
                    links.forEach(link => {
                        if (link.href && 
                            (link.href.includes('ai-tools') || link.href.includes('category')) &&
                            !categories.includes(link.href)) {
                            categories.push({
                                url: link.href,
                                name: link.textContent.trim()
                            });
                        }
                    });
                }

                return categories;
            });

            console.log(`Found ${categoryUrls.length} potential category URLs`);

            // Crawl each category (limit to avoid overwhelming)
            for (let i = 0; i < Math.min(categoryUrls.length, 10); i++) {
                const category = categoryUrls[i];
                if (!this.visitedCategories.has(category.url)) {
                    await this.crawlCategoryPage(page, category);
                    await this.delay(2000); // Be respectful
                }
            }

        } catch (error) {
            console.error('Error crawling categories:', error.message);
        }
    }

    async crawlCategoryPage(page, category) {
        console.log(`\nCrawling category: ${category.name} (${category.url})`);
        this.visitedCategories.add(category.url);

        try {
            await page.goto(category.url, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });

            await this.delay(2000);
            await this.handlePopups(page);
            await this.scrollAndLoadContent(page);

            const categoryTools = await this.extractToolsFromPage(page, category.name);
            console.log(`Found ${categoryTools.length} tools in category: ${category.name}`);
            this.tools.push(...categoryTools);

        } catch (error) {
            console.error(`Error crawling category ${category.name}:`, error.message);
        }
    }

    async handlePopups(page) {
        try {
            // Common popup/cookie banner selectors
            const popupSelectors = [
                '[data-testid="cookie-banner"] button',
                '.cookie-banner button',
                '.gdpr-banner button',
                '[aria-label="Close"]',
                '.modal-close',
                '.popup-close',
                'button:contains("Accept")',
                'button:contains("Close")',
                'button:contains("Dismiss")'
            ];

            for (const selector of popupSelectors) {
                try {
                    if (selector.includes(':contains')) {
                        // Handle :contains manually
                        const buttons = await page.$$('button');
                        for (const button of buttons) {
                            const text = await page.evaluate(el => el.textContent, button);
                            if (text && (text.includes('Accept') || text.includes('Close') || text.includes('Dismiss'))) {
                                await button.click();
                                await this.delay(1000);
                                break;
                            }
                        }
                    } else {
                        const element = await page.$(selector);
                        if (element) {
                            await element.click();
                            await this.delay(1000);
                        }
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }
        } catch (error) {
            // Ignore popup handling errors
        }
    }

    async scrollAndLoadContent(page) {
        console.log('Scrolling to load dynamic content...');
        
        for (let i = 0; i < this.maxScrolls; i++) {
            const previousHeight = await page.evaluate('document.body.scrollHeight');
            
            // Scroll to bottom
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await this.delay(2000);
            
            // Check if new content loaded
            const newHeight = await page.evaluate('document.body.scrollHeight');
            if (newHeight === previousHeight) {
                console.log('No more content to load');
                break;
            }
            
            console.log(`Scroll ${i + 1}/${this.maxScrolls} - Height: ${newHeight}`);
        }
    }

    async extractToolsFromPage(page, categoryName = '') {
        return await page.evaluate((category) => {
            const tools = [];
            
            // Futurepedia-specific selectors
            const toolSelectors = [
                '[data-testid="tool-card"]',
                '.tool-card',
                '.ai-tool-card',
                '.product-card',
                '.tool-item',
                '.grid-item',
                '.card',
                '[class*="tool"]',
                '[class*="card"]'
            ];

            let toolElements = [];
            
            // Find tool elements
            for (const selector of toolSelectors) {
                const elements = Array.from(document.querySelectorAll(selector));
                if (elements.length > 0) {
                    // Verify these look like tool cards
                    const hasToolContent = elements.some(el => {
                        const text = el.textContent.toLowerCase();
                        return (text.includes('ai') || text.includes('tool') || 
                               text.includes('generate') || text.includes('create')) &&
                               (el.querySelector('img') || el.querySelector('h2, h3, h4'));
                    });
                    
                    if (hasToolContent) {
                        toolElements = elements;
                        console.log(`Using selector: ${selector}, found ${elements.length} elements`);
                        break;
                    }
                }
            }

            // Fallback: look for any cards or items with images and headings
            if (toolElements.length === 0) {
                toolElements = Array.from(document.querySelectorAll('div'))
                    .filter(el => {
                        return el.querySelector('img') && 
                               el.querySelector('h1, h2, h3, h4, h5, h6') &&
                               el.getBoundingClientRect().height > 50;
                    });
            }

            toolElements.forEach((element, index) => {
                try {
                    let name = '';
                    let description = '';
                    let url = '';
                    let imageUrl = '';
                    let pricing = '';

                    // Extract tool name
                    const nameSelectors = [
                        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                        '.tool-name', '.title', '.name',
                        '[data-testid="tool-name"]',
                        'a[href*="/ai-tools/"]'
                    ];

                    for (const selector of nameSelectors) {
                        const nameEl = element.querySelector(selector);
                        if (nameEl && nameEl.textContent.trim()) {
                            name = nameEl.textContent.trim();
                            
                            // Get URL if it's a link
                            if (nameEl.tagName === 'A' && nameEl.href) {
                                url = nameEl.href;
                            }
                            break;
                        }
                    }

                    // Extract description
                    const descSelectors = [
                        '.description', '.excerpt', '.summary',
                        'p', '.tool-description', '.card-text',
                        '[data-testid="description"]'
                    ];

                    for (const selector of descSelectors) {
                        const descEl = element.querySelector(selector);
                        if (descEl && descEl.textContent.trim() && 
                            descEl.textContent.trim() !== name) {
                            description = descEl.textContent.trim();
                            break;
                        }
                    }

                    // Extract image URL
                    const imgEl = element.querySelector('img');
                    if (imgEl && imgEl.src) {
                        imageUrl = imgEl.src;
                    }

                    // Extract pricing info
                    const pricingSelectors = [
                        '.price', '.pricing', '.cost',
                        '[data-testid="pricing"]',
                        '.badge:contains("Free")',
                        '.badge:contains("Paid")'
                    ];

                    for (const selector of pricingSelectors) {
                        let pricingEl;
                        if (selector.includes(':contains')) {
                            const badges = Array.from(element.querySelectorAll('.badge, .tag, .label'));
                            pricingEl = badges.find(el => 
                                el.textContent.toLowerCase().includes('free') ||
                                el.textContent.toLowerCase().includes('paid') ||
                                el.textContent.includes('$')
                            );
                        } else {
                            pricingEl = element.querySelector(selector);
                        }
                        
                        if (pricingEl && pricingEl.textContent.trim()) {
                            pricing = pricingEl.textContent.trim();
                            break;
                        }
                    }

                    // Clean and validate name
                    if (name) {
                        name = name.replace(/^\d+\.\s*/, '')
                                  .replace(/\s+/g, ' ')
                                  .trim();

                        if (name.length > 2 && name.length < 100 &&
                            !name.toLowerCase().includes('load more') &&
                            !name.toLowerCase().includes('show more')) {
                            
                            tools.push({
                                name: name,
                                description: description.substring(0, 500),
                                url: url,
                                category: category || '',
                                imageUrl: imageUrl,
                                pricing: pricing,
                                source: 'futurepedia.io'
                            });
                        }
                    }
                } catch (error) {
                    console.log(`Error processing tool element ${index}:`, error);
                }
            });

            return tools;
        }, categoryName);
    }

    async saveResults() {
        // Remove duplicates
        const uniqueTools = [];
        const seenNames = new Set();

        for (const tool of this.tools) {
            const normalizedName = tool.name.toLowerCase().trim();
            if (!seenNames.has(normalizedName)) {
                seenNames.add(normalizedName);
                uniqueTools.push(tool);
            }
        }

        console.log(`Removed ${this.tools.length - uniqueTools.length} duplicates`);
        this.tools = uniqueTools;

        // Save as JSON
        const jsonPath = path.join(__dirname, 'futurepedia_tools.json');
        fs.writeFileSync(jsonPath, JSON.stringify(this.tools, null, 2));
        console.log(`Saved ${this.tools.length} tools to ${jsonPath}`);

        // Save as CSV
        const csvPath = path.join(__dirname, 'futurepedia_tools.csv');
        const csvHeader = 'name,description,url,category,imageUrl,pricing,source\n';
        const csvContent = this.tools.map(tool => 
            `"${tool.name.replace(/"/g, '""')}","${tool.description.replace(/"/g, '""')}","${tool.url}","${tool.category}","${tool.imageUrl}","${tool.pricing}","${tool.source}"`
        ).join('\n');
        
        fs.writeFileSync(csvPath, csvHeader + csvContent);
        console.log(`Saved ${this.tools.length} tools to ${csvPath}`);

        // Save tool names for detection
        const namesPath = path.join(__dirname, 'futurepedia_tool_names.txt');
        const toolNames = this.tools.map(tool => tool.name).join('\n');
        fs.writeFileSync(namesPath, toolNames);
        console.log(`Saved tool names to ${namesPath}`);

        // Print sample results
        console.log('\nSample tools found:');
        this.tools.slice(0, 10).forEach((tool, index) => {
            console.log(`${index + 1}. ${tool.name}`);
            if (tool.description) {
                console.log(`   Description: ${tool.description.substring(0, 100)}...`);
            }
            if (tool.category) {
                console.log(`   Category: ${tool.category}`);
            }
            if (tool.pricing) {
                console.log(`   Pricing: ${tool.pricing}`);
            }
            console.log('');
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the crawler
if (require.main === module) {
    const crawler = new FuturepediaCrawler();
    crawler.crawl().catch(console.error);
}

module.exports = FuturepediaCrawler;
