const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class InsidrCrawler {
    constructor() {
        this.baseUrl = 'https://www.insidr.ai/ai-tools/';
        this.tools = [];
        this.visitedPages = new Set();
        this.maxPages = 50; // Safety limit
    }

    async crawl() {
        console.log('Starting Insidr.ai AI tools crawler...');
        
        const browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            
            // Start with the first page
            await this.crawlPage(page, this.baseUrl, 1);
            
            console.log(`\nCrawling completed! Found ${this.tools.length} AI tools.`);
            await this.saveResults();
            
        } catch (error) {
            console.error('Error during crawling:', error);
        } finally {
            await browser.close();
        }
    }

    async crawlPage(page, url, pageNum) {
        if (this.visitedPages.has(url) || pageNum > this.maxPages) {
            return;
        }

        console.log(`\nCrawling page ${pageNum}: ${url}`);
        this.visitedPages.add(url);

        try {
            await page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Wait for content to load
            await this.delay(2000);

            // Extract AI tools from the current page
            const pageTools = await this.extractToolsFromPage(page);
            console.log(`Found ${pageTools.length} tools on page ${pageNum}`);
            
            this.tools.push(...pageTools);

            // Look for pagination - try multiple selectors
            const nextPageUrl = await page.evaluate(() => {
                // Look for "Next" button or pagination links
                const nextSelectors = [
                    'a[rel="next"]',
                    '.pagination a:contains("Next")',
                    '.pagination .next',
                    '.page-numbers.next',
                    'a:contains("Next")',
                    '.pagination a:last-child',
                    '[aria-label="Next"]'
                ];

                for (const selector of nextSelectors) {
                    try {
                        let nextLink;
                        if (selector.includes(':contains')) {
                            // Handle :contains pseudo-selector manually
                            const links = Array.from(document.querySelectorAll('a'));
                            nextLink = links.find(link => 
                                link.textContent.toLowerCase().includes('next') ||
                                link.textContent.includes('›') ||
                                link.textContent.includes('→')
                            );
                        } else {
                            nextLink = document.querySelector(selector);
                        }
                        
                        if (nextLink && nextLink.href) {
                            return nextLink.href;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                // Look for numbered pagination
                const pageLinks = Array.from(document.querySelectorAll('.pagination a, .page-numbers a'));
                const currentPageNum = window.location.href.match(/page\/(\d+)/)?.[1] || '1';
                const nextPageNum = parseInt(currentPageNum) + 1;
                
                const nextNumLink = pageLinks.find(link => 
                    link.textContent.trim() === nextPageNum.toString()
                );
                
                return nextNumLink ? nextNumLink.href : null;
            });

            // If we found a next page, crawl it
            if (nextPageUrl && !this.visitedPages.has(nextPageUrl)) {
                await this.delay(1000); // Be respectful
                await this.crawlPage(page, nextPageUrl, pageNum + 1);
            }

        } catch (error) {
            console.error(`Error crawling page ${pageNum}:`, error.message);
        }
    }

    async extractToolsFromPage(page) {
        return await page.evaluate(() => {
            const tools = [];
            
            // Debug: log all H2 elements found
            const allH2s = Array.from(document.querySelectorAll('h2'));
            console.log(`Found ${allH2s.length} H2 elements on page`);
            allH2s.forEach((h2, i) => console.log(`H2 ${i}: "${h2.textContent.trim()}"`));
            
            // Insidr.ai specific structure: H2 headers followed by descriptions and "Visit tool" links
            const h2Elements = Array.from(document.querySelectorAll('h2'));
            
            // More specific skip list - only skip exact matches of navigation elements
            const skipHeadings = [
                'best ai tools directory',
                'main categories', 
                'ai tools directory',
                'selected subcategories', 
                'tool reviews', 
                'get 500+ best ai tools',
                'main ai tool categories', 
                'beginner program', 
                'advanced program',
                'start a profitable ai business', 
                'insidr community', 
                'ai resources',
                'ai community', 
                'ai business growth', 
                'contact', 
                'submit', 
                'sponsorship',
                'the best ai tools comparison', 
                'what are ai tools?', 
                'how to use ai tools',
                'artificial intelligence tools - what can they be used for?',
                'top 7 free ai tools that anyone can use in 2025',
                'other tools',
                'final thoughts', 
                'questions about ai tools', 
                'faq\'s',
                'free ai community',
                // Additional content sections that aren't tools
                'ai copywriting tools',
                'ai video generators and editors',
                'ai image and art generators and editors',
                'ai seo tools',
                'ai tools for marketing & social media',
                'artificial intelligence tools for audio generators & music',
                '1. chatgpt by open ai',
                '2. notion: business and productivity with machine learning',
                '3. stable diffusion: text to images',
                '4. lumen5: ai tool for video generation',
                '5. midjourney: artificial intelligence tool for art images',
                '6. dall-e 2: ai tool for image generation',
                '7. point-e: create 3d models'
            ];
            
            h2Elements.forEach((h2, index) => {
                try {
                    const name = h2.textContent.trim();
                    
                    // Enhanced filtering - skip exact matches and patterns that indicate non-tools
                    const shouldSkip = !name || 
                                     name.length < 2 || 
                                     name.length > 100 ||
                                     skipHeadings.some(skip => name.toLowerCase() === skip.toLowerCase()) ||
                                     // Skip numbered list items (like "1. ChatGPT by Open AI")
                                     /^\d+\.\s/.test(name) ||
                                     // Skip questions and how-to content
                                     name.toLowerCase().includes('what are') ||
                                     name.toLowerCase().includes('how to') ||
                                     name.toLowerCase().includes('what can they be used for') ||
                                     // Skip promotional content
                                     name.toLowerCase().includes('free') && name.toLowerCase().includes('community') ||
                                     name.toLowerCase().includes('comparison') ||
                                     // Skip category headers that describe tool types
                                     name.toLowerCase().includes('tools for') ||
                                     name.toLowerCase().includes('generators and') ||
                                     name.toLowerCase().includes('editors');
                    
                    if (shouldSkip) {
                        console.log(`Skipping H2: "${name}"`);
                        return;
                    }
                    
                    console.log(`Processing H2: "${name}"`);
                    
                    // Get the content after this H2 until the next H2
                    let description = '';
                    let url = '';
                    let currentElement = h2.nextElementSibling;
                    let elementCount = 0;
                    
                    while (currentElement && currentElement.tagName !== 'H2' && elementCount < 10) {
                        if (currentElement.tagName === 'P') {
                            const text = currentElement.textContent.trim();
                            
                            // Extract description (skip pagination links)
                            if (text && 
                                !text.match(/^[\[\<\>\d\s]+$/) && // Skip pagination like "[<] [1] [2] [>]"
                                !text.includes('Visit tool') &&
                                text.length > 10) {
                                description += (description ? ' ' : '') + text;
                            }
                            
                            // Look for "Visit tool" links in paragraphs
                            const links = Array.from(currentElement.querySelectorAll('a'));
                            for (const link of links) {
                                if (link.textContent.toLowerCase().includes('visit tool') ||
                                    link.href.includes('insidr.ai/aff') ||
                                    link.href.includes('utm_source') ||
                                    (link.href.includes('http') && !link.href.includes('insidr.ai/ai-tools'))) {
                                    url = link.href;
                                    break;
                                }
                            }
                        }
                        
                        // Check if current element is a direct link
                        if (currentElement.tagName === 'A') {
                            const linkText = currentElement.textContent.toLowerCase();
                            if (linkText.includes('visit tool') ||
                                currentElement.href.includes('insidr.ai/aff') ||
                                currentElement.href.includes('utm_source')) {
                                url = currentElement.href;
                            }
                        }
                        
                        currentElement = currentElement.nextElementSibling;
                        elementCount++;
                    }
                    
                    // Clean description
                    description = description.replace(/\s+/g, ' ').trim();
                    if (description.length > 500) {
                        description = description.substring(0, 500) + '...';
                    }
                    
                    // Add the tool
                    const tool = {
                        name: name,
                        description: description,
                        url: url,
                        category: '',
                        source: 'insidr.ai'
                    };
                    
                    tools.push(tool);
                    console.log(`Added tool: ${name} (URL: ${url ? 'found' : 'missing'})`);
                    
                } catch (error) {
                    console.log(`Error processing H2 element ${index}:`, error);
                }
            });
            
            // Additional fallback: look for visit tool links and work backwards to find names
            if (tools.length < 8) { // Expected around 10 tools per page
                console.log('Trying fallback method to find more tools...');
                
                const visitLinks = Array.from(document.querySelectorAll('a[href*="insidr.ai/aff"], a[href*="utm_source"]'));
                console.log(`Found ${visitLinks.length} visit tool links`);
                
                visitLinks.forEach(link => {
                    // Look for the H2 before this link
                    let element = link;
                    let searchDepth = 0;
                    
                    while (element && searchDepth < 20) {
                        element = element.previousElementSibling || element.parentElement?.previousElementSibling;
                        if (element && element.tagName === 'H2') {
                            const toolName = element.textContent.trim();
                            
                            // Check if we already have this tool
                            const alreadyExists = tools.some(t => t.name.toLowerCase() === toolName.toLowerCase());
                            
                            if (!alreadyExists && toolName.length > 2 && toolName.length < 100) {
                                // Apply the same enhanced filtering as the main method
                                const isSkipped = skipHeadings.some(skip => toolName.toLowerCase() === skip.toLowerCase()) ||
                                                /^\d+\.\s/.test(toolName) ||
                                                toolName.toLowerCase().includes('what are') ||
                                                toolName.toLowerCase().includes('how to') ||
                                                toolName.toLowerCase().includes('what can they be used for') ||
                                                toolName.toLowerCase().includes('free') && toolName.toLowerCase().includes('community') ||
                                                toolName.toLowerCase().includes('comparison') ||
                                                toolName.toLowerCase().includes('tools for') ||
                                                toolName.toLowerCase().includes('generators and') ||
                                                toolName.toLowerCase().includes('editors');
                                
                                if (!isSkipped) {
                                    tools.push({
                                        name: toolName,
                                        description: '',
                                        url: link.href,
                                        category: '',
                                        source: 'insidr.ai'
                                    });
                                    console.log(`Added via fallback: ${toolName}`);
                                }
                            }
                            break;
                        }
                        searchDepth++;
                    }
                });
            }

            console.log(`Final count: Extracted ${tools.length} tools from page`);
            return tools;
        });
    }

    async saveResults() {
        // Remove duplicates based on name
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
        const jsonPath = path.join(__dirname, 'insidr_ai_tools.json');
        fs.writeFileSync(jsonPath, JSON.stringify(this.tools, null, 2));
        console.log(`Saved ${this.tools.length} tools to ${jsonPath}`);

        // Save as CSV
        const csvPath = path.join(__dirname, 'insidr_ai_tools.csv');
        const csvHeader = 'name,description,url,category,source\n';
        const csvContent = this.tools.map(tool => 
            `"${tool.name.replace(/"/g, '""')}","${tool.description.replace(/"/g, '""')}","${tool.url}","${tool.category}","${tool.source}"`
        ).join('\n');
        
        fs.writeFileSync(csvPath, csvHeader + csvContent);
        console.log(`Saved ${this.tools.length} tools to ${csvPath}`);

        // Save tool names only for detection purposes
        const namesPath = path.join(__dirname, 'insidr_ai_tool_names.txt');
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
            console.log('');
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the crawler
if (require.main === module) {
    const crawler = new InsidrCrawler();
    crawler.crawl().catch(console.error);
}

module.exports = InsidrCrawler;
