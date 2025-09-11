const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class AixploriaCrawler {
    constructor() {
        this.aiTools = new Set();
        this.baseUrl = 'https://www.aixploria.com/en/ultimate-list-ai/';
        this.outputFile = 'aixploria_ai_tools.csv';
    }

    async crawl() {
        console.log('Starting Aixploria AI tools crawler...');
        
        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        try {
            const page = await browser.newPage();
            
            // Set user agent to avoid detection
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            console.log(`Navigating to ${this.baseUrl}...`);
            await page.goto(this.baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: 60000 
            });

            // Wait for the page to load completely
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Extract AI tool names from various selectors
            const tools = await page.evaluate(() => {
                const toolNames = new Set();
                
                // Strategy 1: Look for all links and extract tool names from URLs
                const links = document.querySelectorAll('a');
                links.forEach(link => {
                    const href = link.href;
                    const text = link.textContent?.trim();
                    
                    // Extract tool names from aixploria URLs
                    if (href && href.includes('aixploria.com/en/') && !href.includes('/category/') && 
                        !href.includes('/ultimate-list-ai/') && !href.includes('/categories-ai/') &&
                        !href.includes('/tutorials/') && !href.includes('/news/') && 
                        !href.includes('/add-ai/') && !href.includes('/last-ai/') &&
                        !href.includes('/free-ai/') && !href.includes('/bonus-extras-ai/')) {
                        
                        // Extract from URL path
                        const urlParts = href.split('/');
                        const toolSlug = urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1];
                        if (toolSlug && toolSlug.length > 2 && !toolSlug.includes('?')) {
                            // Convert slug to readable name
                            const toolName = toolSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                            toolNames.add(toolName);
                        }
                        
                        // Also use link text if it looks like a tool name
                        if (text && text.length > 2 && text.length < 50 && 
                            !text.includes('Visit') && !text.includes('AI Tools') &&
                            !text.includes('Categories') && !text.includes('More') &&
                            !text.match(/^\d+\.?\s*$/)) {
                            toolNames.add(text);
                        }
                    }
                });

                // Strategy 2: Look for specific AI tool patterns in the page
                const allText = document.body.innerText;
                const lines = allText.split('\n');
                
                lines.forEach(line => {
                    const trimmed = line.trim();
                    // Look for numbered lists or bullet points with tool names
                    const match = trimmed.match(/^\d+\.\s*(.+)$/) || trimmed.match(/^[★•]\s*(.+)$/);
                    if (match) {
                        const toolName = match[1].trim();
                        if (toolName.length > 2 && toolName.length < 50 && 
                            !toolName.includes('AI Tools') && !toolName.includes('Categories')) {
                            toolNames.add(toolName);
                        }
                    }
                });

                // Strategy 3: Look for elements with specific classes or attributes
                const potentialTools = document.querySelectorAll('[title], [alt], [data-name]');
                potentialTools.forEach(element => {
                    const title = element.getAttribute('title') || element.getAttribute('alt') || element.getAttribute('data-name');
                    if (title && title.length > 2 && title.length < 50) {
                        toolNames.add(title);
                    }
                });

                console.log('Found tools:', Array.from(toolNames));
                return Array.from(toolNames);
            });

            console.log(`Found ${tools.length} potential AI tools`);
            tools.forEach(tool => this.aiTools.add(tool));

            // Try to scroll and load more content
            await this.scrollAndLoadMore(page);

            // Extract additional tools after scrolling
            const additionalTools = await page.evaluate(() => {
                const toolNames = new Set();
                const links = document.querySelectorAll('a');
                
                links.forEach(link => {
                    const text = link.textContent?.trim();
                    const href = link.href;
                    
                    if (text && text.length > 2 && text.length < 100 && 
                        href && href.includes('aixploria.com/en/') &&
                        !href.includes('/category/') && 
                        !href.includes('/ultimate-list-ai/') &&
                        !text.includes('AI Tools') &&
                        !text.includes('Categories')) {
                        
                        // Clean up the tool name
                        const cleanName = text.replace(/^\d+\.\s*/, '').replace(/★/g, '').trim();
                        if (cleanName.length > 2) {
                            toolNames.add(cleanName);
                        }
                    }
                });

                return Array.from(toolNames);
            });

            console.log(`Found ${additionalTools.length} additional AI tools after scrolling`);
            additionalTools.forEach(tool => this.aiTools.add(tool));

        } catch (error) {
            console.error('Error during crawling:', error);
        } finally {
            await browser.close();
        }

        await this.saveResults();
        return Array.from(this.aiTools);
    }

    async scrollAndLoadMore(page) {
        console.log('Scrolling to load more content...');
        
        try {
            // Scroll down multiple times to trigger lazy loading
            for (let i = 0; i < 10; i++) {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Check if "Load More" button exists and click it
                const loadMoreButton = await page.$('button[class*="load"], button[class*="more"], .load-more, .show-more');
                if (loadMoreButton) {
                    console.log('Clicking load more button...');
                    await loadMoreButton.click();
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        } catch (error) {
            console.log('Error during scrolling:', error.message);
        }
    }

    async saveResults() {
        const toolsArray = Array.from(this.aiTools).sort();
        
        // Create CSV content
        let csvContent = 'Tool Name,Cleaned Name\n';
        toolsArray.forEach(tool => {
            const cleanedName = this.cleanToolName(tool);
            csvContent += `"${tool}","${cleanedName}"\n`;
        });

        // Save to file
        fs.writeFileSync(this.outputFile, csvContent);
        console.log(`Saved ${toolsArray.length} AI tools to ${this.outputFile}`);

        // Also save as JSON for easier programmatic access
        const jsonOutput = {
            timestamp: new Date().toISOString(),
            totalTools: toolsArray.length,
            tools: toolsArray.map(tool => ({
                original: tool,
                cleaned: this.cleanToolName(tool)
            }))
        };

        fs.writeFileSync('aixploria_ai_tools.json', JSON.stringify(jsonOutput, null, 2));
        console.log('Also saved as aixploria_ai_tools.json');
    }

    cleanToolName(name) {
        return name
            .replace(/^\d+\.\s*/, '') // Remove numbering
            .replace(/★/g, '') // Remove stars
            .replace(/[^\w\s.-]/g, '') // Remove special characters except dots and hyphens
            .trim()
            .toLowerCase();
    }
}

// Main execution
async function main() {
    const crawler = new AixploriaCrawler();
    try {
        const tools = await crawler.crawl();
        console.log(`\nCrawling completed! Found ${tools.length} unique AI tools.`);
        console.log('\nFirst 10 tools found:');
        tools.slice(0, 10).forEach((tool, index) => {
            console.log(`${index + 1}. ${tool}`);
        });
    } catch (error) {
        console.error('Crawler failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = AixploriaCrawler;
