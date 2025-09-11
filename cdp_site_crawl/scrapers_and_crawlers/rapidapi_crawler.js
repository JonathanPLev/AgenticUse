const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class RapidAPICrawler {
    constructor() {
        this.baseUrl = 'https://rapidapi.com/search';
        this.searchTerms = [
            'artificial intelligence',
            'machine learning',
            'natural language processing',
            'computer vision',
            'text generation',
            'image generation',
            'speech recognition',
            'chatbot',
            'ai assistant',
            'deep learning',
            'neural network',
            'sentiment analysis',
            'language translation',
            'text analysis',
            'image analysis'
        ];
        this.apis = [];
        this.visitedUrls = new Set();
        this.maxPagesPerSearch = 3;
    }

    async crawl() {
        console.log('Starting RapidAPI AI tools crawler...');
        console.log(`Will search for ${this.searchTerms.length} different AI-related terms`);
        
        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });
        
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });
            
            // Search for each term
            for (const term of this.searchTerms) {
                console.log(`\n--- Searching for: "${term}" ---`);
                await this.searchTerm(page, term);
                await this.delay(2000); // Be respectful between searches
            }
            
            console.log(`\nCrawling completed! Found ${this.apis.length} AI APIs.`);
            await this.saveResults();
            
        } catch (error) {
            console.error('Error during crawling:', error);
        } finally {
            await browser.close();
        }
    }

    async searchTerm(page, searchTerm) {
        try {
            const searchUrl = `${this.baseUrl}?term=${encodeURIComponent(searchTerm)}&sortBy=ByRelevance`;
            
            await page.goto(searchUrl, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });

            await this.delay(3000);

            // Handle any popups or cookie banners
            await this.handlePopups(page);

            // Extract APIs from the search results
            let pageNum = 1;
            while (pageNum <= this.maxPagesPerSearch) {
                console.log(`  Extracting from page ${pageNum}...`);
                
                const pageApis = await this.extractAPIsFromPage(page, searchTerm);
                console.log(`  Found ${pageApis.length} APIs on page ${pageNum}`);
                
                this.apis.push(...pageApis);

                // Try to go to next page
                const hasNextPage = await this.goToNextPage(page);
                if (!hasNextPage) {
                    console.log(`  No more pages for "${searchTerm}"`);
                    break;
                }
                
                pageNum++;
                await this.delay(2000);
            }

        } catch (error) {
            console.error(`Error searching for "${searchTerm}":`, error.message);
        }
    }

    async handlePopups(page) {
        try {
            const popupSelectors = [
                '[data-testid="cookie-banner"] button',
                '.cookie-consent button',
                '[aria-label="Close"]',
                '.modal-close',
                'button:contains("Accept")',
                'button:contains("Got it")'
            ];

            for (const selector of popupSelectors) {
                try {
                    if (selector.includes(':contains')) {
                        const buttons = await page.$$('button');
                        for (const button of buttons) {
                            const text = await page.evaluate(el => el.textContent, button);
                            if (text && (text.includes('Accept') || text.includes('Got it') || text.includes('OK'))) {
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

    async extractAPIsFromPage(page, searchTerm) {
        return await page.evaluate((term) => {
            const apis = [];
            
            // RapidAPI-specific selectors for API cards
            const apiSelectors = [
                '[data-testid="api-card"]',
                '.api-card',
                '.search-result',
                '.api-item',
                '.result-card',
                '.card',
                '[class*="api"]',
                '[class*="card"]'
            ];

            let apiElements = [];
            
            // Find API elements
            for (const selector of apiSelectors) {
                const elements = Array.from(document.querySelectorAll(selector));
                if (elements.length > 0) {
                    // Check if these look like API cards
                    const hasApiContent = elements.some(el => {
                        const text = el.textContent.toLowerCase();
                        return text.includes('api') && 
                               (el.querySelector('h2, h3, h4') || el.querySelector('.title'));
                    });
                    
                    if (hasApiContent) {
                        apiElements = elements;
                        console.log(`Using selector: ${selector}, found ${elements.length} elements`);
                        break;
                    }
                }
            }

            // Fallback: look for any cards with API-like content
            if (apiElements.length === 0) {
                apiElements = Array.from(document.querySelectorAll('div, article'))
                    .filter(el => {
                        const text = el.textContent.toLowerCase();
                        return text.includes('api') && 
                               el.querySelector('h1, h2, h3, h4, h5, h6') &&
                               el.getBoundingClientRect().height > 50;
                    });
            }

            apiElements.forEach((element, index) => {
                try {
                    let name = '';
                    let description = '';
                    let url = '';
                    let provider = '';
                    let category = '';
                    let pricing = '';
                    let rating = '';

                    // Extract API name
                    const nameSelectors = [
                        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                        '.api-name', '.title', '.name',
                        '[data-testid="api-name"]',
                        'a[href*="/api/"]'
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
                        'p', '.api-description', '.card-text',
                        '[data-testid="description"]'
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

                    // Extract provider
                    const providerSelectors = [
                        '.provider', '.author', '.developer',
                        '[data-testid="provider"]',
                        '.by-line'
                    ];

                    for (const selector of providerSelectors) {
                        const providerEl = element.querySelector(selector);
                        if (providerEl && providerEl.textContent.trim()) {
                            provider = providerEl.textContent.trim().replace(/^by\s+/i, '');
                            break;
                        }
                    }

                    // Extract category
                    const categorySelectors = [
                        '.category', '.tag', '.label',
                        '[data-testid="category"]'
                    ];

                    for (const selector of categorySelectors) {
                        const catEl = element.querySelector(selector);
                        if (catEl && catEl.textContent.trim()) {
                            category = catEl.textContent.trim();
                            break;
                        }
                    }

                    // Extract pricing
                    const pricingSelectors = [
                        '.price', '.pricing', '.cost',
                        '.plan', '.freemium', '.free'
                    ];

                    for (const selector of pricingSelectors) {
                        const priceEl = element.querySelector(selector);
                        if (priceEl && priceEl.textContent.trim()) {
                            pricing = priceEl.textContent.trim();
                            break;
                        }
                    }

                    // Extract rating
                    const ratingSelectors = [
                        '.rating', '.score', '.stars',
                        '[data-testid="rating"]'
                    ];

                    for (const selector of ratingSelectors) {
                        const ratingEl = element.querySelector(selector);
                        if (ratingEl && ratingEl.textContent.trim()) {
                            rating = ratingEl.textContent.trim();
                            break;
                        }
                    }

                    // Get URL if not found yet
                    if (!url) {
                        const linkEl = element.querySelector('a[href*="/api/"], a[href*="rapidapi.com"]');
                        if (linkEl && linkEl.href) {
                            url = linkEl.href;
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
                            
                            apis.push({
                                name: name,
                                description: description.substring(0, 500),
                                url: url,
                                provider: provider,
                                category: category,
                                pricing: pricing,
                                rating: rating,
                                searchTerm: term,
                                source: 'rapidapi.com'
                            });
                        }
                    }
                } catch (error) {
                    console.log(`Error processing API element ${index}:`, error);
                }
            });

            return apis;
        }, searchTerm);
    }

    async goToNextPage(page) {
        try {
            // Look for next page button
            const nextButton = await page.$('button[aria-label="Next page"], .pagination .next, [data-testid="next-page"]');
            
            if (nextButton) {
                // Check if button is enabled
                const isDisabled = await page.evaluate(btn => btn.disabled || btn.classList.contains('disabled'), nextButton);
                
                if (!isDisabled) {
                    await nextButton.click();
                    await this.delay(3000);
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.log('Error navigating to next page:', error.message);
            return false;
        }
    }

    async saveResults() {
        // Remove duplicates based on name and URL
        const uniqueApis = [];
        const seenKeys = new Set();

        for (const api of this.apis) {
            const key = `${api.name.toLowerCase()}-${api.url}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueApis.push(api);
            }
        }

        console.log(`Removed ${this.apis.length - uniqueApis.length} duplicates`);
        this.apis = uniqueApis;

        // Save as JSON
        const jsonPath = path.join(__dirname, 'rapidapi_ai_tools.json');
        fs.writeFileSync(jsonPath, JSON.stringify(this.apis, null, 2));
        console.log(`Saved ${this.apis.length} APIs to ${jsonPath}`);

        // Save as CSV
        const csvPath = path.join(__dirname, 'rapidapi_ai_tools.csv');
        const csvHeader = 'name,description,url,provider,category,pricing,rating,searchTerm,source\n';
        const csvContent = this.apis.map(api => 
            `"${api.name.replace(/"/g, '""')}","${api.description.replace(/"/g, '""')}","${api.url}","${api.provider}","${api.category}","${api.pricing}","${api.rating}","${api.searchTerm}","${api.source}"`
        ).join('\n');
        
        fs.writeFileSync(csvPath, csvHeader + csvContent);
        console.log(`Saved ${this.apis.length} APIs to ${csvPath}`);

        // Save API names for detection
        const namesPath = path.join(__dirname, 'rapidapi_ai_names.txt');
        const apiNames = this.apis.map(api => api.name).join('\n');
        fs.writeFileSync(namesPath, apiNames);
        console.log(`Saved API names to ${namesPath}`);

        // Create search term summary
        const termSummary = {};
        this.apis.forEach(api => {
            if (!termSummary[api.searchTerm]) {
                termSummary[api.searchTerm] = 0;
            }
            termSummary[api.searchTerm]++;
        });

        console.log('\nAPIs found per search term:');
        Object.entries(termSummary).forEach(([term, count]) => {
            console.log(`  ${term}: ${count} APIs`);
        });

        // Print sample results
        console.log('\nSample APIs found:');
        this.apis.slice(0, 10).forEach((api, index) => {
            console.log(`${index + 1}. ${api.name}`);
            if (api.description) {
                console.log(`   Description: ${api.description.substring(0, 100)}...`);
            }
            if (api.provider) {
                console.log(`   Provider: ${api.provider}`);
            }
            if (api.category) {
                console.log(`   Category: ${api.category}`);
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
    const crawler = new RapidAPICrawler();
    crawler.crawl().catch(console.error);
}

module.exports = RapidAPICrawler;
