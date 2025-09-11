const fs = require('fs');
const path = require('path');

class AIEndpointMapper {
    constructor() {
        this.aiToolsData = null;
        this.endpointPatterns = new Map();
        this.domainPatterns = new Map();
        this.sdkPatterns = new Map();
        this.functionPatterns = new Map();
        
        // Load known AI service patterns
        this.knownPatterns = {
            // Major AI Services
            'openai': {
                domains: ['api.openai.com', 'openai.com'],
                endpoints: ['/v1/chat/completions', '/v1/completions', '/v1/images/generations', '/v1/audio/transcriptions', '/v1/embeddings'],
                sdks: ['openai', '@openai/api'],
                functions: ['openai.ChatCompletion.create', 'openai.Completion.create', 'openai.Image.create']
            },
            'anthropic': {
                domains: ['api.anthropic.com', 'anthropic.com'],
                endpoints: ['/v1/messages', '/v1/complete'],
                sdks: ['@anthropic-ai/sdk'],
                functions: ['anthropic.messages.create', 'anthropic.completions.create']
            },
            'google': {
                domains: ['generativelanguage.googleapis.com', 'ai.google.dev', 'bard.google.com'],
                endpoints: ['/v1beta/models', '/v1/models', '/generateContent'],
                sdks: ['@google-ai/generativelanguage', 'google-generative-ai'],
                functions: ['genAI.getGenerativeModel', 'model.generateContent']
            },
            'cohere': {
                domains: ['api.cohere.ai', 'cohere.ai'],
                endpoints: ['/v1/generate', '/v1/embed', '/v1/classify'],
                sdks: ['cohere-ai'],
                functions: ['cohere.generate', 'cohere.embed']
            },
            'huggingface': {
                domains: ['api-inference.huggingface.co', 'huggingface.co'],
                endpoints: ['/models', '/pipeline'],
                sdks: ['@huggingface/inference'],
                functions: ['HfInference', 'pipeline']
            },
            'replicate': {
                domains: ['api.replicate.com', 'replicate.com'],
                endpoints: ['/v1/predictions', '/v1/models'],
                sdks: ['replicate'],
                functions: ['replicate.run', 'replicate.predictions.create']
            },
            'stability': {
                domains: ['api.stability.ai', 'stability.ai'],
                endpoints: ['/v1/generation', '/v1/engines'],
                sdks: ['stability-sdk'],
                functions: ['stability.generate']
            },
            'elevenlabs': {
                domains: ['api.elevenlabs.io', 'elevenlabs.io'],
                endpoints: ['/v1/text-to-speech', '/v1/voices'],
                sdks: ['elevenlabs'],
                functions: ['elevenlabs.generate', 'elevenlabs.voices']
            },
            'midjourney': {
                domains: ['discord.com', 'midjourney.com'],
                endpoints: ['/api/webhooks', '/imagine'],
                sdks: ['midjourney'],
                functions: ['midjourney.imagine', 'midjourney.upscale']
            }
        };
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

    generateEndpointPatterns() {
        console.log('Generating endpoint patterns for AI tools...');
        
        const endpointMappings = [];
        
        for (const tool of this.aiToolsData.tools) {
            const toolName = tool.cleaned.toLowerCase();
            const originalName = tool.original;
            const domain = tool.domain;
            
            // Generate potential patterns for this tool
            const patterns = this.generatePatternsForTool(toolName, originalName, domain, tool.category);
            
            if (patterns.domains.length > 0 || patterns.endpoints.length > 0 || patterns.functions.length > 0) {
                endpointMappings.push({
                    toolName: originalName,
                    cleanedName: toolName,
                    domain: domain,
                    category: tool.category,
                    patterns: patterns
                });
            }
        }
        
        return endpointMappings;
    }

    generatePatternsForTool(toolName, originalName, domain, category) {
        const patterns = {
            domains: [],
            endpoints: [],
            sdks: [],
            functions: [],
            keywords: []
        };
        
        // Check if this matches a known service
        const knownService = this.findKnownService(toolName, originalName);
        if (knownService) {
            patterns.domains.push(...knownService.domains);
            patterns.endpoints.push(...knownService.endpoints);
            patterns.sdks.push(...knownService.sdks);
            patterns.functions.push(...knownService.functions);
        }
        
        // Generate domain patterns
        const domainVariations = this.generateDomainVariations(toolName, domain);
        patterns.domains.push(...domainVariations);
        
        // Generate endpoint patterns based on category
        const endpointVariations = this.generateEndpointVariations(toolName, category);
        patterns.endpoints.push(...endpointVariations);
        
        // Generate SDK patterns
        const sdkVariations = this.generateSDKVariations(toolName, domain);
        patterns.sdks.push(...sdkVariations);
        
        // Generate function patterns
        const functionVariations = this.generateFunctionVariations(toolName, category);
        patterns.functions.push(...functionVariations);
        
        // Generate keyword patterns for log searching
        const keywordVariations = this.generateKeywordVariations(toolName, originalName);
        patterns.keywords.push(...keywordVariations);
        
        // Remove duplicates
        patterns.domains = [...new Set(patterns.domains)];
        patterns.endpoints = [...new Set(patterns.endpoints)];
        patterns.sdks = [...new Set(patterns.sdks)];
        patterns.functions = [...new Set(patterns.functions)];
        patterns.keywords = [...new Set(patterns.keywords)];
        
        return patterns;
    }

    findKnownService(toolName, originalName) {
        const searchTerms = [toolName, originalName.toLowerCase()];
        
        for (const term of searchTerms) {
            for (const [serviceName, serviceData] of Object.entries(this.knownPatterns)) {
                if (term.includes(serviceName) || serviceName.includes(term)) {
                    return serviceData;
                }
            }
        }
        
        return null;
    }

    generateDomainVariations(toolName, domain) {
        const domains = [];
        const cleanName = toolName.replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
        
        // Common domain patterns
        const tlds = ['.com', '.ai', '.io', '.co', '.app', '.dev'];
        const subdomains = ['api', 'app', 'www', 'platform', 'service'];
        
        for (const tld of tlds) {
            domains.push(`${cleanName}${tld}`);
            domains.push(`${domain}${tld}`);
            
            for (const subdomain of subdomains) {
                domains.push(`${subdomain}.${cleanName}${tld}`);
                domains.push(`${subdomain}.${domain}${tld}`);
            }
        }
        
        return domains.filter(d => d.length > 4);
    }

    generateEndpointVariations(toolName, category) {
        const endpoints = [];
        const cleanName = toolName.replace(/\s+/g, '');
        
        // Common API endpoint patterns
        const commonPaths = ['/api', '/v1', '/v2', '/api/v1', '/api/v2'];
        const actions = this.getActionsForCategory(category);
        
        for (const basePath of commonPaths) {
            for (const action of actions) {
                endpoints.push(`${basePath}/${action}`);
                endpoints.push(`${basePath}/${cleanName}/${action}`);
                endpoints.push(`${basePath}/${action}/${cleanName}`);
            }
        }
        
        // Tool-specific endpoints
        endpoints.push(`/${cleanName}`);
        endpoints.push(`/api/${cleanName}`);
        endpoints.push(`/${cleanName}/generate`);
        endpoints.push(`/${cleanName}/process`);
        
        return endpoints;
    }

    getActionsForCategory(category) {
        const categoryActions = {
            'text': ['generate', 'complete', 'chat', 'summarize', 'translate'],
            'image': ['generate', 'edit', 'upscale', 'enhance', 'create'],
            'video': ['generate', 'edit', 'process', 'convert', 'create'],
            'audio': ['generate', 'transcribe', 'synthesize', 'convert', 'clone'],
            'code': ['generate', 'complete', 'analyze', 'review', 'debug'],
            'chat': ['chat', 'message', 'conversation', 'respond'],
            'business': ['analyze', 'process', 'generate', 'optimize'],
            'data': ['analyze', 'process', 'extract', 'transform'],
            'design': ['generate', 'create', 'edit', 'enhance'],
            'general': ['generate', 'process', 'analyze', 'create']
        };
        
        return categoryActions[category] || categoryActions['general'];
    }

    generateSDKVariations(toolName, domain) {
        const sdks = [];
        const cleanName = toolName.replace(/\s+/g, '').toLowerCase();
        
        // Common SDK naming patterns
        sdks.push(cleanName);
        sdks.push(`${cleanName}-sdk`);
        sdks.push(`${cleanName}-api`);
        sdks.push(`${cleanName}-js`);
        sdks.push(`@${cleanName}/sdk`);
        sdks.push(`@${cleanName}/api`);
        sdks.push(`@${cleanName}/client`);
        sdks.push(`${domain}-sdk`);
        sdks.push(`${domain}-api`);
        
        return sdks.filter(s => s.length > 2);
    }

    generateFunctionVariations(toolName, category) {
        const functions = [];
        const cleanName = toolName.replace(/\s+/g, '');
        const actions = this.getActionsForCategory(category);
        
        // Common function patterns
        for (const action of actions) {
            functions.push(`${cleanName}.${action}`);
            functions.push(`${cleanName}${action.charAt(0).toUpperCase() + action.slice(1)}`);
            functions.push(`${action}${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)}`);
        }
        
        // Generic patterns
        functions.push(`${cleanName}.create`);
        functions.push(`${cleanName}.run`);
        functions.push(`${cleanName}.execute`);
        functions.push(`${cleanName}.process`);
        
        return functions;
    }

    generateKeywordVariations(toolName, originalName) {
        const keywords = [];
        
        // Add original names
        keywords.push(toolName);
        keywords.push(originalName.toLowerCase());
        
        // Add variations
        const variations = [
            toolName.replace(/\s+/g, ''),
            toolName.replace(/\s+/g, '-'),
            toolName.replace(/\s+/g, '_'),
            originalName.replace(/\s+/g, '').toLowerCase(),
            originalName.replace(/\s+/g, '-').toLowerCase(),
            originalName.replace(/\s+/g, '_').toLowerCase()
        ];
        
        keywords.push(...variations);
        
        return keywords.filter(k => k.length > 2);
    }

    async saveEndpointMappings(mappings) {
        // Save comprehensive mappings
        const output = {
            timestamp: new Date().toISOString(),
            totalTools: mappings.length,
            mappings: mappings
        };
        
        fs.writeFileSync('ai_endpoint_mappings.json', JSON.stringify(output, null, 2));
        
        // Create simplified lookup files for different use cases
        await this.createLookupFiles(mappings);
        
        console.log(`Saved endpoint mappings for ${mappings.length} AI tools`);
    }

    async createLookupFiles(mappings) {
        // Domain lookup
        const domains = new Set();
        mappings.forEach(mapping => {
            mapping.patterns.domains.forEach(domain => domains.add(domain));
        });
        fs.writeFileSync('ai_domains_list.txt', Array.from(domains).sort().join('\n'));
        
        // Endpoint lookup
        const endpoints = new Set();
        mappings.forEach(mapping => {
            mapping.patterns.endpoints.forEach(endpoint => endpoints.add(endpoint));
        });
        fs.writeFileSync('ai_endpoints_list.txt', Array.from(endpoints).sort().join('\n'));
        
        // SDK lookup
        const sdks = new Set();
        mappings.forEach(mapping => {
            mapping.patterns.sdks.forEach(sdk => sdks.add(sdk));
        });
        fs.writeFileSync('ai_sdks_list.txt', Array.from(sdks).sort().join('\n'));
        
        // Function lookup
        const functions = new Set();
        mappings.forEach(mapping => {
            mapping.patterns.functions.forEach(func => functions.add(func));
        });
        fs.writeFileSync('ai_functions_list.txt', Array.from(functions).sort().join('\n'));
        
        // Keywords lookup
        const keywords = new Set();
        mappings.forEach(mapping => {
            mapping.patterns.keywords.forEach(keyword => keywords.add(keyword));
        });
        fs.writeFileSync('ai_keywords_list.txt', Array.from(keywords).sort().join('\n'));
        
        console.log('Created lookup files:');
        console.log(`- ai_domains_list.txt (${domains.size} domains)`);
        console.log(`- ai_endpoints_list.txt (${endpoints.size} endpoints)`);
        console.log(`- ai_sdks_list.txt (${sdks.size} SDKs)`);
        console.log(`- ai_functions_list.txt (${functions.size} functions)`);
        console.log(`- ai_keywords_list.txt (${keywords.size} keywords)`);
    }

    async generateMappings() {
        await this.loadAIToolsData();
        const mappings = this.generateEndpointPatterns();
        await this.saveEndpointMappings(mappings);
        return mappings;
    }
}

// Main execution
async function main() {
    const mapper = new AIEndpointMapper();
    try {
        const mappings = await mapper.generateMappings();
        
        console.log('\n🎯 Endpoint mapping completed!');
        console.log(`Generated patterns for ${mappings.length} AI tools`);
        
        // Show some examples
        console.log('\nExample mappings:');
        mappings.slice(0, 5).forEach((mapping, index) => {
            console.log(`\n${index + 1}. ${mapping.toolName}:`);
            console.log(`   Domains: ${mapping.patterns.domains.slice(0, 3).join(', ')}${mapping.patterns.domains.length > 3 ? '...' : ''}`);
            console.log(`   Endpoints: ${mapping.patterns.endpoints.slice(0, 3).join(', ')}${mapping.patterns.endpoints.length > 3 ? '...' : ''}`);
            console.log(`   SDKs: ${mapping.patterns.sdks.slice(0, 3).join(', ')}${mapping.patterns.sdks.length > 3 ? '...' : ''}`);
        });
        
    } catch (error) {
        console.error('Mapping generation failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = AIEndpointMapper;
