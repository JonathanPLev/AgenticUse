const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class ImprovedAixploriaCrawler {
    constructor() {
        this.aiTools = new Set();
        this.baseUrl = 'https://www.aixploria.com/en/ultimate-list-ai/';
        this.outputFile = 'aixploria_ai_tools_cleaned.csv';
        this.blacklistPatterns = [
            // Navigation and UI elements
            /^(about us|contact|privacy|terms|categories|tutorials|news|more|visit|home|login|register)$/i,
            // Descriptive text patterns
            /^(a |an |the |with |for |by |in |on |at |to |from |of |and |or |but |so |yet |nor)/i,
            // Generic phrases
            /^(ai tools|best ai|top \d+|ranking|list|ultimate|free|paid|freemium|trial)$/i,
            // Long descriptive sentences
            /^.{60,}$/,
            // Numbers only
            /^\d+\.?\s*$/,
            // Special characters only
            /^[^\w\s]+$/,
            // Common website elements
            /^(search|filter|sort|view|show|hide|load more|see more|expand|collapse)$/i
        ];
    }

    async crawl() {
        console.log('Starting improved Aixploria AI tools crawler...');
        
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
            
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            console.log(`Navigating to ${this.baseUrl}...`);
            await page.goto(this.baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: 60000 
            });

            await new Promise(resolve => setTimeout(resolve, 5000));

            // Extract AI tool names using improved strategy
            const tools = await page.evaluate(() => {
                const toolNames = new Set();
                
                // Strategy 1: Extract from numbered lists in the main content
                const textContent = document.body.innerText;
                const lines = textContent.split('\n');
                
                lines.forEach(line => {
                    const trimmed = line.trim();
                    
                    // Match numbered entries like "1. Tool Name" or "★ Tool Name"
                    const numberedMatch = trimmed.match(/^\d+\.\s*(.+)$/);
                    const starMatch = trimmed.match(/^★\s*(.+)$/);
                    
                    if (numberedMatch || starMatch) {
                        const toolName = (numberedMatch ? numberedMatch[1] : starMatch[1]).trim();
                        
                        // Clean up the tool name
                        const cleanedName = toolName
                            .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
                            .replace(/\([^)]*\)/g, '') // Remove parentheses content
                            .replace(/\+\d+/g, '') // Remove vote counts like "+1152"
                            .trim();
                        
                        if (cleanedName && cleanedName.length > 1 && cleanedName.length < 50) {
                            toolNames.add(cleanedName);
                        }
                    }
                });

                // Strategy 2: Extract from specific link patterns that point to tool pages
                const toolLinks = document.querySelectorAll('a[href*="aixploria.com/en/"][href*="-ai"]');
                toolLinks.forEach(link => {
                    const text = link.textContent?.trim();
                    if (text && text.length > 1 && text.length < 50 && !text.includes('http')) {
                        toolNames.add(text);
                    }
                });

                // Strategy 3: Extract from markdown-style links in brackets
                const markdownLinks = textContent.match(/\[([^\]]+)\]\([^)]+\)/g);
                if (markdownLinks) {
                    markdownLinks.forEach(match => {
                        const linkText = match.match(/\[([^\]]+)\]/);
                        if (linkText && linkText[1]) {
                            const toolName = linkText[1].trim();
                            if (toolName.length > 1 && toolName.length < 50 && 
                                !toolName.includes('More') && !toolName.includes('→')) {
                                toolNames.add(toolName);
                            }
                        }
                    });
                }

                return Array.from(toolNames);
            });

            console.log(`Found ${tools.length} potential AI tools`);
            
            // Filter out noise using blacklist patterns
            const filteredTools = tools.filter(tool => this.isValidToolName(tool));
            filteredTools.forEach(tool => this.aiTools.add(tool));

            console.log(`After filtering: ${filteredTools.length} valid AI tools`);

            // Scroll and extract more tools
            await this.scrollAndLoadMore(page);

            // Extract additional tools after scrolling
            const additionalTools = await page.evaluate(() => {
                const toolNames = new Set();
                const allText = document.body.innerText;
                const lines = allText.split('\n');
                
                lines.forEach(line => {
                    const trimmed = line.trim();
                    const match = trimmed.match(/^\d+\.\s*(.+)$/) || trimmed.match(/^★\s*(.+)$/);
                    
                    if (match) {
                        const toolName = match[1]
                            .replace(/https?:\/\/[^\s]+/g, '')
                            .replace(/\([^)]*\)/g, '')
                            .replace(/\+\d+/g, '')
                            .trim();
                        
                        if (toolName && toolName.length > 1 && toolName.length < 50) {
                            toolNames.add(toolName);
                        }
                    }
                });

                return Array.from(toolNames);
            });

            const filteredAdditionalTools = additionalTools.filter(tool => this.isValidToolName(tool));
            filteredAdditionalTools.forEach(tool => this.aiTools.add(tool));

            console.log(`Found ${filteredAdditionalTools.length} additional valid tools after scrolling`);

        } catch (error) {
            console.error('Error during crawling:', error);
        } finally {
            await browser.close();
        }

        await this.saveResults();
        return Array.from(this.aiTools);
    }

    isValidToolName(name) {
        if (!name || typeof name !== 'string') return false;
        
        const trimmed = name.trim();
        
        // Basic length checks
        if (trimmed.length < 2 || trimmed.length > 50) return false;
        
        // Check against blacklist patterns
        for (const pattern of this.blacklistPatterns) {
            if (pattern.test(trimmed)) return false;
        }
        
        // Must contain at least one letter
        if (!/[a-zA-Z]/.test(trimmed)) return false;
        
        // Shouldn't be all lowercase common words
        const commonWords = ['and', 'the', 'for', 'with', 'you', 'your', 'all', 'any', 'can', 'get', 'new', 'now', 'see', 'way', 'who', 'boy', 'did', 'its', 'let', 'old', 'too', 'use'];
        if (commonWords.includes(trimmed.toLowerCase())) return false;
        
        // Shouldn't contain too many common English words
        const words = trimmed.toLowerCase().split(/\s+/);
        const commonWordCount = words.filter(word => commonWords.includes(word)).length;
        if (commonWordCount > words.length * 0.5) return false;
        
        // Should look like a proper name (starts with capital or number)
        if (!/^[A-Z0-9]/.test(trimmed)) return false;
        
        return true;
    }

    async scrollAndLoadMore(page) {
        console.log('Scrolling to load more content...');
        
        try {
            for (let i = 0; i < 5; i++) {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await new Promise(resolve => setTimeout(resolve, 3000));
                
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
        let csvContent = 'Tool Name,Cleaned Name,Category\n';
        toolsArray.forEach(tool => {
            const cleanedName = this.cleanToolName(tool);
            const category = this.categorizeToolName(tool);
            csvContent += `"${tool}","${cleanedName}","${category}"\n`;
        });

        fs.writeFileSync(this.outputFile, csvContent);
        console.log(`Saved ${toolsArray.length} AI tools to ${this.outputFile}`);

        // Save as JSON
        const jsonOutput = {
            timestamp: new Date().toISOString(),
            totalTools: toolsArray.length,
            tools: toolsArray.map(tool => ({
                original: tool,
                cleaned: this.cleanToolName(tool),
                category: this.categorizeToolName(tool)
            }))
        };

        fs.writeFileSync('aixploria_ai_tools_cleaned.json', JSON.stringify(jsonOutput, null, 2));
        console.log('Also saved as aixploria_ai_tools_cleaned.json');
    }

    cleanToolName(name) {
        return name
            .replace(/^\d+\.\s*/, '') // Remove numbering
            .replace(/★/g, '') // Remove stars
            .replace(/[^\w\s.-]/g, '') // Remove special characters except dots and hyphens
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .toLowerCase();
    }

    categorizeToolName(name) {
        const lowerName = name.toLowerCase();
        
        if (lowerName.includes('video') || lowerName.includes('movie')) return 'video';
        if (lowerName.includes('image') || lowerName.includes('photo') || lowerName.includes('picture')) return 'image';
        if (lowerName.includes('text') || lowerName.includes('write') || lowerName.includes('content')) return 'text';
        if (lowerName.includes('chat') || lowerName.includes('conversation') || lowerName.includes('assistant')) return 'chat';
        if (lowerName.includes('code') || lowerName.includes('programming') || lowerName.includes('developer')) return 'code';
        if (lowerName.includes('design') || lowerName.includes('creative') || lowerName.includes('art')) return 'design';
        if (lowerName.includes('audio') || lowerName.includes('music') || lowerName.includes('sound')) return 'audio';
        if (lowerName.includes('business') || lowerName.includes('marketing') || lowerName.includes('sales')) return 'business';
        
        return 'general';
    }
}

// Main execution
async function main() {
    const crawler = new ImprovedAixploriaCrawler();
    try {
        const tools = await crawler.crawl();
        console.log(`\nCrawling completed! Found ${tools.length} unique AI tools.`);
        console.log('\nFirst 20 tools found:');
        tools.slice(0, 20).forEach((tool, index) => {
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

module.exports = ImprovedAixploriaCrawler;
