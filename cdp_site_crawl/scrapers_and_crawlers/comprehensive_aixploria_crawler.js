const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class ComprehensiveAixploriaCrawler {
    constructor() {
        this.aiTools = new Set();
        this.baseUrl = 'https://www.aixploria.com';
        this.outputFile = 'aixploria_ai_tools_FINAL.csv';
        this.processedUrls = new Set();
        this.categories = [];
        
        // All category URLs discovered from the categories page
        this.categoryUrls = [
            // AI Productivity Tools
            '/en/category/e-mail-en/',
            '/en/category/education-en/',
            '/en/category/extensions-chatgpt/',
            '/en/category/files-spreadsheets/',
            '/en/category/memory-en/',
            '/en/category/search-engine/',
            '/en/category/presentation-en/',
            '/en/category/productivity-en/',
            '/en/category/translation-ai/',
            
            // AI Assistants
            '/en/category/legal-assistants/',
            '/en/category/life-assistants/',
            '/en/category/ai-chat-assistant/',
            '/en/category/chatbot-ai/',
            
            // AI Video Tools
            '/en/category/video-edition/',
            '/en/category/video-generators/',
            '/en/category/text-to-video-en/',
            
            // AI Text Generators
            '/en/category/storytelling-generator/',
            '/en/category/ai-text-generators/',
            '/en/category/prompts-help/',
            '/en/category/writing-web-seo/',
            '/en/category/ai-summarizer/',
            
            // AI Art Generators
            '/en/category/art-en/',
            '/en/category/avatars-en/',
            '/en/category/best-ai-logo-generators/',
            '/en/category/image-editing/',
            '/en/category/image-ai-en/',
            '/en/category/3d-model/',
            
            // Automation Tools
            '/en/category/best-ai-agents/',
            '/en/category/automation-ai-workflows/',
            
            // AI Audio & Music
            '/en/category/ai-voice-cloning/',
            '/en/category/audio-editing/',
            '/en/category/voice-reading/',
            '/en/category/music/',
            '/en/category/transcriber/',
            
            // AI Business Tools
            '/en/category/business-study/',
            '/en/category/e-commerce-en/',
            '/en/category/finance-en/',
            '/en/category/marketing-ai/',
            '/en/category/social-assistants-en/',
            '/en/category/human-resources-ai/',
            '/en/category/seo-ai-tools/',
            '/en/category/customer-support/',
            '/en/category/sales-conversion-leads/',
            
            // AI Data & Research
            '/en/category/data-analytics-ai/',
            '/en/category/ai-detection-en/',
            '/en/category/research-science-en/',
            
            // AI Code Tools
            '/en/category/assistant-code-en/',
            '/en/category/llm-model-ai-en/',
            '/en/category/no-code-en/',
            '/en/category/developer-tools/',
            '/en/category/github-project-ai/',
            '/en/category/websites-ai/',
            
            // AI Entertainment
            '/en/category/face-swap-deepfake-en/',
            '/en/category/fashion-en/',
            '/en/category/amazing/',
            '/en/category/games-en/',
            '/en/category/best-ai-characters-chatbots-lists/',
            '/en/category/dating-relationships-ai/',
            '/en/category/ai-rip-en/',
            '/en/category/thisdoesnotexist-en/',
            '/en/category/travel/',
            
            // AI Industry Tools
            '/en/category/real-estate/',
            '/en/category/robots-devices-ai/',
            '/en/category/healthcare/',
            '/en/category/ai-assistive-technology-at/',
            
            // AI Selections
            '/en/category/future-tools-ai/',
            '/en/category/ai-supertools/',
            '/en/category/ia-useful/',
            '/en/category/last-ai-en/',
            '/en/category/featured-en/',
            
            // Additional special pages
            '/en/ultimate-list-ai/',
            '/en/last-ai/',
            '/en/free-ai/',
            '/en/ai-freemium/',
            '/en/ai-paid/',
            '/en/ai-free-trial/'
        ];
        
        this.blacklistPatterns = [
            /^(about us|contact|privacy|terms|categories|tutorials|news|more|visit|home|login|register|submit)$/i,
            /^(a |an |the |with |for |by |in |on |at |to |from |of |and |or |but |so |yet |nor)/i,
            /^(ai tools|best ai|top \d+|ranking|list|ultimate|free|paid|freemium|trial|category|categories)$/i,
            /^.{60,}$/,
            /^\d+\.?\s*$/,
            /^[^\w\s]+$/,
            /^(search|filter|sort|view|show|hide|load more|see more|expand|collapse)$/i,
            /^\+\d+$/,
            /^https?:\/\//i
        ];
    }

    async crawl() {
        console.log('Starting comprehensive Aixploria AI tools crawler...');
        console.log(`Will crawl ${this.categoryUrls.length} category pages`);
        
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
            
            // Crawl each category
            for (let i = 0; i < this.categoryUrls.length; i++) {
                const categoryUrl = this.categoryUrls[i];
                const fullUrl = this.baseUrl + categoryUrl;
                
                console.log(`\n[${i + 1}/${this.categoryUrls.length}] Crawling: ${fullUrl}`);
                
                try {
                    await this.crawlCategoryPage(page, fullUrl, categoryUrl);
                    // Small delay between requests to be respectful
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    console.error(`Error crawling ${fullUrl}:`, error.message);
                    continue;
                }
            }

        } catch (error) {
            console.error('Error during crawling:', error);
        } finally {
            await browser.close();
        }

        await this.saveResults();
        return Array.from(this.aiTools);
    }

    async crawlCategoryPage(page, url, categoryPath) {
        if (this.processedUrls.has(url)) {
            console.log(`Skipping already processed: ${url}`);
            return;
        }

        this.processedUrls.add(url);

        try {
            await page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            await new Promise(resolve => setTimeout(resolve, 3000));

            // Extract tools from this category page
            const tools = await page.evaluate(() => {
                const toolNames = new Set();
                
                // Strategy 1: Look for tool links in the main content
                const links = document.querySelectorAll('a[href*="aixploria.com/en/"]');
                links.forEach(link => {
                    const href = link.href;
                    const text = link.textContent?.trim();
                    
                    // Extract tool names from individual tool pages (not category pages)
                    if (href && !href.includes('/category/') && 
                        !href.includes('/ultimate-list-ai/') && 
                        !href.includes('/categories-ai/') &&
                        !href.includes('/tutorials/') && 
                        !href.includes('/news/') && 
                        !href.includes('/add-ai/') && 
                        !href.includes('/last-ai/') &&
                        !href.includes('/free-ai/') && 
                        !href.includes('/bonus-extras-ai/')) {
                        
                        if (text && text.length > 1 && text.length < 50 && 
                            !text.includes('Visit') && !text.includes('http') &&
                            !text.match(/^\d+\.?\s*$/) && !text.match(/^\+\d+$/)) {
                            toolNames.add(text);
                        }
                    }
                });

                // Strategy 2: Look for numbered lists and structured content
                const textContent = document.body.innerText;
                const lines = textContent.split('\n');
                
                lines.forEach(line => {
                    const trimmed = line.trim();
                    
                    // Match various list patterns
                    const patterns = [
                        /^\d+\.\s*(.+)$/,
                        /^★\s*(.+)$/,
                        /^•\s*(.+)$/,
                        /^-\s*(.+)$/
                    ];
                    
                    for (const pattern of patterns) {
                        const match = trimmed.match(pattern);
                        if (match) {
                            const toolName = match[1]
                                .replace(/https?:\/\/[^\s]+/g, '')
                                .replace(/\([^)]*\)/g, '')
                                .replace(/\+\d+/g, '')
                                .replace(/\s+/g, ' ')
                                .trim();
                            
                            if (toolName && toolName.length > 1 && toolName.length < 50) {
                                toolNames.add(toolName);
                            }
                            break;
                        }
                    }
                });

                // Strategy 3: Look for title attributes and alt text
                const elementsWithTitles = document.querySelectorAll('[title], [alt]');
                elementsWithTitles.forEach(element => {
                    const title = element.getAttribute('title') || element.getAttribute('alt');
                    if (title && title.length > 1 && title.length < 50 && 
                        !title.includes('http') && !title.includes('Click')) {
                        toolNames.add(title);
                    }
                });

                return Array.from(toolNames);
            });

            // Filter and add valid tools
            const validTools = tools.filter(tool => this.isValidToolName(tool));
            const newTools = validTools.filter(tool => !this.aiTools.has(tool));
            
            console.log(`  Found ${tools.length} potential tools, ${validTools.length} valid, ${newTools.length} new`);
            
            newTools.forEach(tool => this.aiTools.add(tool));

            // Try to load more content by scrolling
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

            const validAdditionalTools = additionalTools.filter(tool => this.isValidToolName(tool));
            const newAdditionalTools = validAdditionalTools.filter(tool => !this.aiTools.has(tool));
            
            if (newAdditionalTools.length > 0) {
                console.log(`  Found ${newAdditionalTools.length} additional tools after scrolling`);
                newAdditionalTools.forEach(tool => this.aiTools.add(tool));
            }

        } catch (error) {
            console.error(`Error processing ${url}:`, error.message);
        }
    }

    async scrollAndLoadMore(page) {
        try {
            // Scroll down a few times to load more content
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Check for load more buttons
                const loadMoreButton = await page.$('button[class*="load"], button[class*="more"], .load-more, .show-more, [class*="pagination"] a');
                if (loadMoreButton) {
                    try {
                        await loadMoreButton.click();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } catch (e) {
                        // Button might not be clickable, continue
                    }
                }
            }
        } catch (error) {
            // Scrolling errors are not critical
        }
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
        
        // Shouldn't be common English words only
        const commonWords = ['and', 'the', 'for', 'with', 'you', 'your', 'all', 'any', 'can', 'get', 'new', 'now', 'see', 'way', 'who', 'boy', 'did', 'its', 'let', 'old', 'too', 'use'];
        const words = trimmed.toLowerCase().split(/\s+/);
        const commonWordCount = words.filter(word => commonWords.includes(word)).length;
        if (commonWordCount > words.length * 0.6) return false;
        
        // Should look like a proper name or brand
        if (!/^[A-Z0-9]/.test(trimmed) && !/^\d/.test(trimmed)) return false;
        
        // Filter out obvious non-tool entries
        const lowerName = trimmed.toLowerCase();
        const badPatterns = [
            'click here', 'learn more', 'read more', 'find out', 'discover',
            'explore', 'browse', 'navigate', 'menu', 'sidebar', 'footer',
            'header', 'content', 'article', 'section', 'page', 'website'
        ];
        
        for (const badPattern of badPatterns) {
            if (lowerName.includes(badPattern)) return false;
        }
        
        return true;
    }

    async saveResults() {
        const toolsArray = Array.from(this.aiTools).sort();
        
        // Create CSV content with categories
        let csvContent = 'Tool Name,Cleaned Name,Category,Domain\n';
        toolsArray.forEach(tool => {
            const cleanedName = this.cleanToolName(tool);
            const category = this.categorizeToolName(tool);
            const domain = this.extractDomainFromName(tool);
            csvContent += `"${tool}","${cleanedName}","${category}","${domain}"\n`;
        });

        fs.writeFileSync(this.outputFile, csvContent);
        console.log(`\nSaved ${toolsArray.length} AI tools to ${this.outputFile}`);

        // Save as JSON with metadata
        const jsonOutput = {
            timestamp: new Date().toISOString(),
            totalTools: toolsArray.length,
            categoriesCrawled: this.categoryUrls.length,
            tools: toolsArray.map(tool => ({
                original: tool,
                cleaned: this.cleanToolName(tool),
                category: this.categorizeToolName(tool),
                domain: this.extractDomainFromName(tool)
            }))
        };

        fs.writeFileSync('aixploria_ai_tools_FINAL.json', JSON.stringify(jsonOutput, null, 2));
        console.log('Also saved as aixploria_ai_tools_FINAL.json');
        
        // Create a simple list for easy use in detection
        const simpleList = toolsArray.map(tool => this.cleanToolName(tool));
        fs.writeFileSync('ai_tool_names_list.txt', simpleList.join('\n'));
        console.log('Created simple list: ai_tool_names_list.txt');
    }

    cleanToolName(name) {
        return name
            .replace(/^\d+\.\s*/, '')
            .replace(/★/g, '')
            .replace(/[^\w\s.-]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    categorizeToolName(name) {
        const lowerName = name.toLowerCase();
        
        if (lowerName.includes('video') || lowerName.includes('movie') || lowerName.includes('film')) return 'video';
        if (lowerName.includes('image') || lowerName.includes('photo') || lowerName.includes('picture') || lowerName.includes('visual')) return 'image';
        if (lowerName.includes('text') || lowerName.includes('write') || lowerName.includes('content') || lowerName.includes('copy')) return 'text';
        if (lowerName.includes('chat') || lowerName.includes('conversation') || lowerName.includes('assistant') || lowerName.includes('bot')) return 'chat';
        if (lowerName.includes('code') || lowerName.includes('programming') || lowerName.includes('developer') || lowerName.includes('github')) return 'code';
        if (lowerName.includes('design') || lowerName.includes('creative') || lowerName.includes('art') || lowerName.includes('logo')) return 'design';
        if (lowerName.includes('audio') || lowerName.includes('music') || lowerName.includes('sound') || lowerName.includes('voice')) return 'audio';
        if (lowerName.includes('business') || lowerName.includes('marketing') || lowerName.includes('sales') || lowerName.includes('finance')) return 'business';
        if (lowerName.includes('data') || lowerName.includes('analytics') || lowerName.includes('research') || lowerName.includes('science')) return 'data';
        if (lowerName.includes('game') || lowerName.includes('entertainment') || lowerName.includes('fun')) return 'entertainment';
        
        return 'general';
    }

    extractDomainFromName(name) {
        // Try to extract potential domain/company from tool name
        const cleaned = name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const words = cleaned.split(/\s+/);
        
        // Return the first significant word as potential domain
        for (const word of words) {
            if (word.length > 2 && !['the', 'and', 'for', 'with', 'app', 'tool', 'api'].includes(word)) {
                return word;
            }
        }
        
        return words[0] || '';
    }
}

// Main execution
async function main() {
    const crawler = new ComprehensiveAixploriaCrawler();
    try {
        const tools = await crawler.crawl();
        console.log(`\n🎉 Crawling completed! Found ${tools.length} unique AI tools across all categories.`);
        console.log('\nFirst 20 tools found:');
        tools.slice(0, 20).forEach((tool, index) => {
            console.log(`${index + 1}. ${tool}`);
        });
        
        console.log(`\nLast 10 tools found:`);
        tools.slice(-10).forEach((tool, index) => {
            console.log(`${tools.length - 9 + index}. ${tool}`);
        });
        
    } catch (error) {
        console.error('Crawler failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = ComprehensiveAixploriaCrawler;
