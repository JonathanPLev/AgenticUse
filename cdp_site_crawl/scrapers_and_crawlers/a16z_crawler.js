const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class A16ZCrawler {
    constructor() {
        this.baseUrl = 'https://a16z.com/100-gen-ai-apps-4/';
        this.tools = [];
    }

    async crawl() {
        console.log('Starting A16Z AI apps crawler...');
        
        const browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            await page.goto(this.baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            await this.delay(3000);

            // Extract AI apps from the page
            const apps = await this.extractAppsFromPage(page);
            this.tools = apps;
            
            console.log(`\nCrawling completed! Found ${this.tools.length} AI apps.`);
            await this.saveResults();
            
        } catch (error) {
            console.error('Error during crawling:', error);
        } finally {
            await browser.close();
        }
    }

    async extractAppsFromPage(page) {
        return await page.evaluate(() => {
            const apps = [];
            
            // A16Z typically lists apps in structured content
            const appSelectors = [
                '.wp-block-table table tr',
                'table tr',
                '.app-list li',
                '.company-list li',
                'ol li',
                'ul li',
                '.entry-content p',
                '.post-content p'
            ];

            let appElements = [];
            
            // Try to find the main content area first
            const contentArea = document.querySelector('.entry-content, .post-content, .content, main, article');
            const searchArea = contentArea || document;

            // Look for tables first (most likely format for A16Z lists)
            const tables = Array.from(searchArea.querySelectorAll('table'));
            if (tables.length > 0) {
                // Extract from table rows
                tables.forEach(table => {
                    const rows = Array.from(table.querySelectorAll('tr'));
                    rows.forEach((row, index) => {
                        // Skip header row
                        if (index === 0 && row.querySelector('th')) return;
                        
                        const cells = Array.from(row.querySelectorAll('td, th'));
                        if (cells.length >= 2) {
                            const name = cells[0]?.textContent?.trim() || '';
                            const description = cells[1]?.textContent?.trim() || '';
                            const category = cells[2]?.textContent?.trim() || '';
                            const url = cells[0]?.querySelector('a')?.href || 
                                       row.querySelector('a')?.href || '';

                            if (name && name.length > 2 && name.length < 100) {
                                apps.push({
                                    name: name,
                                    description: description.substring(0, 500),
                                    category: category,
                                    url: url,
                                    source: 'a16z.com'
                                });
                            }
                        }
                    });
                });
            }

            // If no table data found, look for lists
            if (apps.length === 0) {
                const listItems = Array.from(searchArea.querySelectorAll('ol li, ul li'));
                listItems.forEach(item => {
                    const text = item.textContent.trim();
                    if (text && text.length > 5) {
                        // Try to parse structured list items
                        let name = '';
                        let description = '';
                        let url = '';

                        // Look for links first
                        const link = item.querySelector('a');
                        if (link) {
                            name = link.textContent.trim();
                            url = link.href;
                            
                            // Description might be after the link
                            const remainingText = text.replace(name, '').trim();
                            if (remainingText.startsWith('-') || remainingText.startsWith(':')) {
                                description = remainingText.substring(1).trim();
                            } else {
                                description = remainingText;
                            }
                        } else {
                            // Try to parse "Name - Description" format
                            const parts = text.split(/[-–—:]/);
                            if (parts.length >= 2) {
                                name = parts[0].trim();
                                description = parts.slice(1).join(' - ').trim();
                            } else {
                                name = text;
                            }
                        }

                        if (name && name.length > 2 && name.length < 100 &&
                            !name.toLowerCase().includes('table of contents')) {
                            apps.push({
                                name: name,
                                description: description.substring(0, 500),
                                category: '',
                                url: url,
                                source: 'a16z.com'
                            });
                        }
                    }
                });
            }

            // If still no apps found, look for paragraphs with company names
            if (apps.length === 0) {
                const paragraphs = Array.from(searchArea.querySelectorAll('p'));
                paragraphs.forEach(p => {
                    const text = p.textContent.trim();
                    
                    // Look for patterns like "CompanyName: Description" or "CompanyName - Description"
                    const matches = text.match(/^([A-Z][a-zA-Z0-9\s&.]+?)[-–—:]\s*(.+)$/);
                    if (matches && matches[1].length < 50) {
                        const name = matches[1].trim();
                        const description = matches[2].trim();
                        const url = p.querySelector('a')?.href || '';

                        apps.push({
                            name: name,
                            description: description.substring(0, 500),
                            category: '',
                            url: url,
                            source: 'a16z.com'
                        });
                    }
                });
            }

            // Final fallback: extract all links that look like company names
            if (apps.length === 0) {
                const links = Array.from(searchArea.querySelectorAll('a[href]'));
                links.forEach(link => {
                    const name = link.textContent.trim();
                    const url = link.href;
                    
                    // Filter for likely company/app names
                    if (name && name.length > 2 && name.length < 50 &&
                        !name.toLowerCase().includes('here') &&
                        !name.toLowerCase().includes('read') &&
                        !name.toLowerCase().includes('more') &&
                        !url.includes('a16z.com') &&
                        (url.includes('.com') || url.includes('.ai') || url.includes('.io'))) {
                        
                        apps.push({
                            name: name,
                            description: '',
                            category: '',
                            url: url,
                            source: 'a16z.com'
                        });
                    }
                });
            }

            console.log(`Extracted ${apps.length} apps from A16Z page`);
            return apps;
        });
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
        const jsonPath = path.join(__dirname, 'a16z_ai_apps.json');
        fs.writeFileSync(jsonPath, JSON.stringify(this.tools, null, 2));
        console.log(`Saved ${this.tools.length} apps to ${jsonPath}`);

        // Save as CSV
        const csvPath = path.join(__dirname, 'a16z_ai_apps.csv');
        const csvHeader = 'name,description,category,url,source\n';
        const csvContent = this.tools.map(tool => 
            `"${tool.name.replace(/"/g, '""')}","${tool.description.replace(/"/g, '""')}","${tool.category}","${tool.url}","${tool.source}"`
        ).join('\n');
        
        fs.writeFileSync(csvPath, csvHeader + csvContent);
        console.log(`Saved ${this.tools.length} apps to ${csvPath}`);

        // Save app names for detection
        const namesPath = path.join(__dirname, 'a16z_ai_app_names.txt');
        const appNames = this.tools.map(tool => tool.name).join('\n');
        fs.writeFileSync(namesPath, appNames);
        console.log(`Saved app names to ${namesPath}`);

        // Print sample results
        console.log('\nSample apps found:');
        this.tools.slice(0, 10).forEach((tool, index) => {
            console.log(`${index + 1}. ${tool.name}`);
            if (tool.description) {
                console.log(`   Description: ${tool.description.substring(0, 100)}...`);
            }
            if (tool.url) {
                console.log(`   URL: ${tool.url}`);
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
    const crawler = new A16ZCrawler();
    crawler.crawl().catch(console.error);
}

module.exports = A16ZCrawler;
