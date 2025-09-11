const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class SaasAiToolsCrawler {
    constructor() {
        this.baseUrl = 'https://saasaitools.com/';
        this.tools = [];
        this.visitedUrls = new Set();
        this.categories = [];
    }

    async crawl() {
        console.log('Starting SaasAiTools.com crawler...');
        
        const browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // First, discover categories
            await this.discoverCategories(page);
            
            // Crawl main page
            await this.crawlPage(page, this.baseUrl, 'Main');
            
            // Crawl each category
            for (const category of this.categories.slice(0, 15)) { // Limit categories
                await this.crawlPage(page, category.url, category.name);
                await this.delay(1500); // Be respectful
            }
            
            console.log(`\nCrawling completed! Found ${this.tools.length} AI tools.`);
            await this.saveResults();
            
        } catch (error) {
            console.error('Error during crawling:', error);
        } finally {
            await browser.close();
        }
    }

    async discoverCategories(page) {
        console.log('Discovering categories...');
        
        try {
            await page.goto(this.baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            await this.delay(2000);

            this.categories = await page.evaluate(() => {
                const categories = [];
                
                // Look for category links
                const categorySelectors = [
                    'nav a[href*="category"]',
                    '.menu a[href*="category"]',
                    '.category-link',
                    'a[href*="/category/"]',
                    '.nav-link[href*="category"]',
                    '.dropdown-menu a',
                    '.categories a'
                ];

                for (const selector of categorySelectors) {
                    const links = Array.from(document.querySelectorAll(selector));
                    links.forEach(link => {
                        if (link.href && link.textContent.trim()) {
                            const url = link.href;
                            const name = link.textContent.trim();
                            
                            // Avoid duplicates
                            if (!categories.some(cat => cat.url === url)) {
                                categories.push({ url, name });
                            }
                        }
                    });
                }

                // Also look for any links that might be categories
                const allLinks = Array.from(document.querySelectorAll('a[href]'));
                allLinks.forEach(link => {
                    const href = link.href;
                    const text = link.textContent.trim();
                    
                    // Check if this looks like a category
                    if (href.includes('saasaitools.com') && 
                        (href.includes('category') || href.includes('tag') || href.includes('type')) &&
                        text.length > 2 && text.length < 50 &&
                        !categories.some(cat => cat.url === href)) {
                        categories.push({ url: href, name: text });
                    }
                });

                return categories;
            });

            console.log(`Found ${this.categories.length} categories:`, 
                this.categories.slice(0, 10).map(cat => cat.name));

        } catch (error) {
            console.error('Error discovering categories:', error.message);
        }
    }

    async crawlPage(page, url, categoryName) {
        if (this.visitedUrls.has(url)) return;
        
        console.log(`\nCrawling ${categoryName}: ${url}`);
        this.visitedUrls.add(url);

        try {
            await page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            await this.delay(2000);

            // Scroll to load more content if needed
            await this.scrollToLoadContent(page);

            // Extract tools from this page
            const pageTools = await this.extractToolsFromPage(page, categoryName);
            console.log(`Found ${pageTools.length} tools in ${categoryName}`);
            
            this.tools.push(...pageTools);

            // Look for pagination
            await this.handlePagination(page, categoryName);

        } catch (error) {
            console.error(`Error crawling ${categoryName}:`, error.message);
        }
    }

    async scrollToLoadContent(page) {
        try {
            const initialHeight = await page.evaluate('document.body.scrollHeight');
            
            // Scroll down a few times to trigger any lazy loading
            for (let i = 0; i < 3; i++) {
                await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
                await this.delay(1500);
                
                const newHeight = await page.evaluate('document.body.scrollHeight');
                if (newHeight === initialHeight) break;
            }
            
            // Scroll back to top
            await page.evaluate('window.scrollTo(0, 0)');
            await this.delay(1000);
        } catch (error) {
            // Ignore scrolling errors
        }
    }

    async handlePagination(page, categoryName) {
        try {
            // Look for next page links
            const nextPageUrl = await page.evaluate(() => {
                const nextSelectors = [
                    'a[rel="next"]',
                    '.next-page',
                    '.pagination .next',
                    'a:contains("Next")',
                    '.page-numbers.next'
                ];

                for (const selector of nextSelectors) {
                    let nextLink;
                    if (selector.includes(':contains')) {
                        const links = Array.from(document.querySelectorAll('a'));
                        nextLink = links.find(link => 
                            link.textContent.toLowerCase().includes('next') ||
                            link.textContent.includes('›')
                        );
                    } else {
                        nextLink = document.querySelector(selector);
                    }
                    
                    if (nextLink && nextLink.href) {
                        return nextLink.href;
                    }
                }
                return null;
            });

            // Crawl next page if found (limit to avoid infinite loops)
            if (nextPageUrl && !this.visitedUrls.has(nextPageUrl) && this.visitedUrls.size < 50) {
                await this.delay(2000);
                await this.crawlPage(page, nextPageUrl, `${categoryName} (Page ${this.visitedUrls.size})`);
            }
        } catch (error) {
            // Ignore pagination errors
        }
    }

    async extractToolsFromPage(page, categoryName) {
        return await page.evaluate((category) => {
            const tools = [];
            
            // SaasAiTools-specific selectors
            const toolSelectors = [
                '.tool-card',
                '.ai-tool',
                '.product-card',
                '.tool-item',
                '.saas-tool',
                '.listing-item',
                '.entry',
                '.post',
                'article',
                '.grid-item',
                '.card'
            ];

            let toolElements = [];
            
            // Find the best selector
            for (const selector of toolSelectors) {
                const elements = Array.from(document.querySelectorAll(selector));
                if (elements.length > 0) {
                    // Check if these elements contain tool-like content
                    const hasToolContent = elements.some(el => {
                        const text = el.textContent.toLowerCase();
                        return (text.includes('ai') || text.includes('tool') || 
                               text.includes('saas') || text.includes('software')) &&
                               (el.querySelector('h1, h2, h3, h4, h5, h6') ||
                                el.querySelector('a[href]'));
                    });
                    
                    if (hasToolContent) {
                        toolElements = elements;
                        console.log(`Using selector: ${selector}, found ${elements.length} elements`);
                        break;
                    }
                }
            }

            // Fallback: look for divs with headings and links
            if (toolElements.length === 0) {
                toolElements = Array.from(document.querySelectorAll('div'))
                    .filter(el => {
                        return el.querySelector('h1, h2, h3, h4, h5, h6') && 
                               el.querySelector('a[href]') &&
                               el.getBoundingClientRect().height > 30;
                    });
            }

            toolElements.forEach((element, index) => {
                try {
                    let name = '';
                    let description = '';
                    let url = '';
                    let features = '';
                    let pricing = '';

                    // Extract tool name
                    const nameSelectors = [
                        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                        '.tool-name', '.title', '.name',
                        '.entry-title', '.post-title',
                        'a[href*="tool"]', 'a[href*="saas"]'
                    ];

                    for (const selector of nameSelectors) {
                        const nameEl = element.querySelector(selector);
                        if (nameEl && nameEl.textContent.trim()) {
                            name = nameEl.textContent.trim();
                            
                            // Get URL if it's a link
                            if (nameEl.tagName === 'A' && nameEl.href) {
                                url = nameEl.href;
                            } else {
                                // Look for a link within the element
                                const linkEl = element.querySelector('a[href]');
                                if (linkEl && linkEl.href) {
                                    url = linkEl.href;
                                }
                            }
                            break;
                        }
                    }

                    // Extract description
                    const descSelectors = [
                        '.description', '.excerpt', '.summary',
                        'p', '.tool-description', '.content',
                        '.entry-content p', '.post-content p'
                    ];

                    for (const selector of descSelectors) {
                        const descEl = element.querySelector(selector);
                        if (descEl && descEl.textContent.trim() && 
                            descEl.textContent.trim() !== name &&
                            descEl.textContent.length > 10) {
                            description = descEl.textContent.trim();
                            break;
                        }
                    }

                    // Extract features
                    const featureSelectors = [
                        '.features', '.capabilities', '.tags',
                        '.tool-features', '.highlights'
                    ];

                    for (const selector of featureSelectors) {
                        const featureEl = element.querySelector(selector);
                        if (featureEl && featureEl.textContent.trim()) {
                            features = featureEl.textContent.trim();
                            break;
                        }
                    }

                    // Extract pricing
                    const pricingSelectors = [
                        '.price', '.pricing', '.cost',
                        '.plan', '.subscription'
                    ];

                    for (const selector of pricingSelectors) {
                        const priceEl = element.querySelector(selector);
                        if (priceEl && priceEl.textContent.trim()) {
                            pricing = priceEl.textContent.trim();
                            break;
                        }
                    }

                    // Clean and validate name
                    if (name) {
                        name = name.replace(/^\d+\.\s*/, '')
                                  .replace(/\s+/g, ' ')
                                  .trim();

                        // Filter out generic terms
                        const genericTerms = [
                            'read more', 'learn more', 'view all', 'see more',
                            'continue reading', 'full article', 'more info'
                        ];

                        if (name.length > 2 && name.length < 100 &&
                            !genericTerms.some(term => name.toLowerCase().includes(term))) {
                            
                            tools.push({
                                name: name,
                                description: description.substring(0, 500),
                                url: url,
                                category: category || '',
                                features: features.substring(0, 300),
                                pricing: pricing,
                                source: 'saasaitools.com'
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
        const jsonPath = path.join(__dirname, 'saasai_tools.json');
        fs.writeFileSync(jsonPath, JSON.stringify(this.tools, null, 2));
        console.log(`Saved ${this.tools.length} tools to ${jsonPath}`);

        // Save as CSV
        const csvPath = path.join(__dirname, 'saasai_tools.csv');
        const csvHeader = 'name,description,url,category,features,pricing,source\n';
        const csvContent = this.tools.map(tool => 
            `"${tool.name.replace(/"/g, '""')}","${tool.description.replace(/"/g, '""')}","${tool.url}","${tool.category}","${tool.features.replace(/"/g, '""')}","${tool.pricing}","${tool.source}"`
        ).join('\n');
        
        fs.writeFileSync(csvPath, csvHeader + csvContent);
        console.log(`Saved ${this.tools.length} tools to ${csvPath}`);

        // Save tool names for detection
        const namesPath = path.join(__dirname, 'saasai_tool_names.txt');
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
            if (tool.features) {
                console.log(`   Features: ${tool.features.substring(0, 80)}...`);
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
    const crawler = new SaasAiToolsCrawler();
    crawler.crawl().catch(console.error);
}

module.exports = SaasAiToolsCrawler;
