const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class AIDocumentationScraper {
    constructor() {
        this.aiToolsData = null;
        this.scrapedData = [];
        this.processedTools = new Set();
        this.maxToolsToProcess = 50; // Start with a subset for testing
        this.requestDelay = 3000; // 3 seconds between requests to be respectful
    }

    async loadAIToolsData() {
        try {
            const data = fs.readFileSync('aixploria_ai_tools_FINAL.json', 'utf8');
            this.aiToolsData = JSON.parse(data);
            console.log(`Loaded ${this.aiToolsData.totalTools} AI tools`);
        } catch (error) {
            console.error('Error loading AI tools data:', error);
            throw error;
        }
    }

    async scrapeDocumentation() {
        console.log('Starting documentation scraping...');
        
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
            
            // Process a subset of tools first
            const toolsToProcess = this.aiToolsData.tools.slice(0, this.maxToolsToProcess);
            
            for (let i = 0; i < toolsToProcess.length; i++) {
                const tool = toolsToProcess[i];
                console.log(`\n[${i + 1}/${toolsToProcess.length}] Processing: ${tool.original}`);
                
                try {
                    const toolData = await this.scrapeToolDocumentation(page, tool);
                    if (toolData) {
                        this.scrapedData.push(toolData);
                        console.log(`✓ Found data for ${tool.original}`);
                    } else {
                        console.log(`✗ No data found for ${tool.original}`);
                    }
                    
                    // Respectful delay between requests
                    await new Promise(resolve => setTimeout(resolve, this.requestDelay));
                    
                } catch (error) {
                    console.error(`Error processing ${tool.original}:`, error.message);
                    continue;
                }
            }

        } catch (error) {
            console.error('Error during scraping:', error);
        } finally {
            await browser.close();
        }

        await this.saveScrapedData();
        return this.scrapedData;
    }

    async scrapeToolDocumentation(page, tool) {
        const toolName = tool.cleaned;
        const originalName = tool.original;
        
        // Try to find the tool's website
        const potentialUrls = this.generatePotentialUrls(toolName, tool.domain);
        
        for (const url of potentialUrls) {
            try {
                console.log(`  Trying: ${url}`);
                
                await page.goto(url, { 
                    waitUntil: 'networkidle2',
                    timeout: 15000 
                });

                // Check if this looks like a valid AI tool website
                const isValidSite = await this.validateAIToolSite(page, toolName);
                if (!isValidSite) {
                    console.log(`  ✗ Not a valid AI tool site: ${url}`);
                    continue;
                }

                console.log(`  ✓ Found valid site: ${url}`);
                
                // Extract documentation data
                const docData = await this.extractDocumentationData(page, tool, url);
                
                if (docData && (docData.endpoints.length > 0 || docData.sdks.length > 0 || docData.functions.length > 0)) {
                    return {
                        toolName: originalName,
                        cleanedName: toolName,
                        category: tool.category,
                        websiteUrl: url,
                        ...docData
                    };
                }
                
            } catch (error) {
                console.log(`  ✗ Error accessing ${url}: ${error.message}`);
                continue;
            }
        }
        
        return null;
    }

    generatePotentialUrls(toolName, domain) {
        const urls = [];
        const cleanName = toolName.replace(/\s+/g, '').toLowerCase();
        const domainName = domain || cleanName;
        
        // Primary domains
        const tlds = ['.com', '.ai', '.io', '.co'];
        for (const tld of tlds) {
            urls.push(`https://${cleanName}${tld}`);
            urls.push(`https://${domainName}${tld}`);
            urls.push(`https://www.${cleanName}${tld}`);
            urls.push(`https://www.${domainName}${tld}`);
        }
        
        // Documentation subpaths
        const docPaths = ['/docs', '/documentation', '/api', '/developers', '/dev', '/guide'];
        for (const tld of ['.com', '.ai', '.io']) {
            const baseUrl = `https://${cleanName}${tld}`;
            for (const docPath of docPaths) {
                urls.push(`${baseUrl}${docPath}`);
            }
        }
        
        return urls;
    }

    async validateAIToolSite(page, toolName) {
        try {
            const content = await page.evaluate(() => {
                const title = document.title.toLowerCase();
                const bodyText = document.body.innerText.toLowerCase();
                const metaDescription = document.querySelector('meta[name="description"]')?.content?.toLowerCase() || '';
                
                return { title, bodyText: bodyText.slice(0, 1000), metaDescription };
            });
            
            const searchTerms = [toolName.toLowerCase(), 'api', 'ai', 'artificial intelligence', 'machine learning', 'sdk', 'documentation'];
            const allText = `${content.title} ${content.bodyText} ${content.metaDescription}`;
            
            // Check if it contains AI-related terms and the tool name
            const hasToolName = allText.includes(toolName.toLowerCase());
            const hasAITerms = searchTerms.some(term => allText.includes(term));
            
            // Avoid generic sites
            const isGeneric = allText.includes('domain for sale') || 
                             allText.includes('parked domain') || 
                             allText.includes('coming soon') ||
                             content.title.includes('404') ||
                             content.title.includes('not found');
            
            return hasToolName && hasAITerms && !isGeneric;
            
        } catch (error) {
            return false;
        }
    }

    async extractDocumentationData(page, tool, url) {
        try {
            const data = await page.evaluate(() => {
                const endpoints = new Set();
                const sdks = new Set();
                const functions = new Set();
                const domains = new Set();
                
                // Extract API endpoints from text content
                const bodyText = document.body.innerText;
                
                // Look for API endpoints
                const endpointPatterns = [
                    /https?:\/\/[^\s]+\/api\/[^\s]*/gi,
                    /\/api\/v?\d*\/[^\s]*/gi,
                    /\/v\d+\/[^\s]*/gi,
                    /"\/[^"]*api[^"]*"/gi,
                    /'\/[^']*api[^']*'/gi
                ];
                
                for (const pattern of endpointPatterns) {
                    const matches = bodyText.match(pattern) || [];
                    matches.forEach(match => {
                        const cleaned = match.replace(/['"]/g, '').trim();
                        if (cleaned.length > 4 && cleaned.length < 100) {
                            endpoints.add(cleaned);
                        }
                    });
                }
                
                // Look for SDK/package names
                const sdkPatterns = [
                    /npm install\s+([^\s\n]+)/gi,
                    /pip install\s+([^\s\n]+)/gi,
                    /import\s+([^\s\n]+)/gi,
                    /from\s+([^\s\n]+)\s+import/gi,
                    /require\(['"]([^'"]+)['"]\)/gi,
                    /@[a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+/gi,
                    /[a-zA-Z0-9-_]+-sdk/gi,
                    /[a-zA-Z0-9-_]+-api/gi
                ];
                
                for (const pattern of sdkPatterns) {
                    const matches = bodyText.match(pattern) || [];
                    matches.forEach(match => {
                        let cleaned = match.replace(/npm install\s+|pip install\s+|import\s+|from\s+|require\(['"]|['"]\)/gi, '').trim();
                        if (cleaned.includes(' import')) {
                            cleaned = cleaned.split(' import')[0];
                        }
                        if (cleaned.length > 2 && cleaned.length < 50 && !cleaned.includes(' ')) {
                            sdks.add(cleaned);
                        }
                    });
                }
                
                // Look for function calls in code examples
                const functionPatterns = [
                    /\w+\.\w+\([^)]*\)/gi,
                    /\w+\([^)]*\)/gi,
                    /def\s+(\w+)/gi,
                    /function\s+(\w+)/gi,
                    /const\s+(\w+)\s*=/gi,
                    /let\s+(\w+)\s*=/gi
                ];
                
                // Look specifically in code blocks
                const codeBlocks = document.querySelectorAll('code, pre, .highlight, .code');
                codeBlocks.forEach(block => {
                    const codeText = block.innerText;
                    for (const pattern of functionPatterns) {
                        const matches = codeText.match(pattern) || [];
                        matches.forEach(match => {
                            let cleaned = match.replace(/def\s+|function\s+|const\s+|let\s+|\s*=.*$/gi, '').trim();
                            if (cleaned.includes('(')) {
                                cleaned = cleaned.split('(')[0];
                            }
                            if (cleaned.length > 2 && cleaned.length < 30 && /^[a-zA-Z_]/.test(cleaned)) {
                                functions.add(cleaned);
                            }
                        });
                    }
                });
                
                // Extract domains from links
                const links = document.querySelectorAll('a[href*="api"], a[href*=".com"], a[href*=".io"], a[href*=".ai"]');
                links.forEach(link => {
                    try {
                        const url = new URL(link.href);
                        if (url.hostname.includes('api') || url.pathname.includes('api')) {
                            domains.add(url.hostname);
                        }
                    } catch (e) {
                        // Invalid URL, skip
                    }
                });
                
                return {
                    endpoints: Array.from(endpoints),
                    sdks: Array.from(sdks),
                    functions: Array.from(functions),
                    domains: Array.from(domains)
                };
            });
            
            return data;
            
        } catch (error) {
            console.error('Error extracting documentation data:', error);
            return {
                endpoints: [],
                sdks: [],
                functions: [],
                domains: []
            };
        }
    }

    async saveScrapedData() {
        const output = {
            timestamp: new Date().toISOString(),
            totalToolsProcessed: this.scrapedData.length,
            scrapedData: this.scrapedData
        };
        
        fs.writeFileSync('ai_documentation_scraped.json', JSON.stringify(output, null, 2));
        
        // Create consolidated lookup files
        const allEndpoints = new Set();
        const allSDKs = new Set();
        const allFunctions = new Set();
        const allDomains = new Set();
        
        this.scrapedData.forEach(tool => {
            tool.endpoints.forEach(endpoint => allEndpoints.add(endpoint));
            tool.sdks.forEach(sdk => allSDKs.add(sdk));
            tool.functions.forEach(func => allFunctions.add(func));
            tool.domains.forEach(domain => allDomains.add(domain));
        });
        
        fs.writeFileSync('scraped_ai_endpoints.txt', Array.from(allEndpoints).sort().join('\n'));
        fs.writeFileSync('scraped_ai_sdks.txt', Array.from(allSDKs).sort().join('\n'));
        fs.writeFileSync('scraped_ai_functions.txt', Array.from(allFunctions).sort().join('\n'));
        fs.writeFileSync('scraped_ai_domains.txt', Array.from(allDomains).sort().join('\n'));
        
        console.log(`\n📊 Scraping Results:`);
        console.log(`- Processed ${this.scrapedData.length} tools successfully`);
        console.log(`- Found ${allEndpoints.size} unique endpoints`);
        console.log(`- Found ${allSDKs.size} unique SDKs`);
        console.log(`- Found ${allFunctions.size} unique functions`);
        console.log(`- Found ${allDomains.size} unique domains`);
    }
}

// Main execution
async function main() {
    const scraper = new AIDocumentationScraper();
    try {
        await scraper.loadAIToolsData();
        const scrapedData = await scraper.scrapeDocumentation();
        
        console.log('\n🎯 Documentation scraping completed!');
        console.log('Files created:');
        console.log('- ai_documentation_scraped.json (detailed data)');
        console.log('- scraped_ai_endpoints.txt (for log searching)');
        console.log('- scraped_ai_sdks.txt (for log searching)');
        console.log('- scraped_ai_functions.txt (for log searching)');
        console.log('- scraped_ai_domains.txt (for log searching)');
        
    } catch (error) {
        console.error('Documentation scraping failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = AIDocumentationScraper;
