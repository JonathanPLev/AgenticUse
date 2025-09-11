const fs = require('fs');
const path = require('path');

class AIToolsConsolidator {
    constructor() {
        this.allTools = [];
        this.sources = [
            {
                name: 'Aixploria',
                jsonFile: 'aixploria_ai_tools_FINAL.json',
                csvFile: 'aixploria_ai_tools_FINAL.csv'
            },
            {
                name: 'Insidr.ai',
                jsonFile: 'insidr_ai_tools.json',
                csvFile: 'insidr_ai_tools.csv'
            },
            {
                name: 'Futurepedia',
                jsonFile: 'futurepedia_tools.json',
                csvFile: 'futurepedia_tools.csv'
            },
            {
                name: 'SaasAiTools',
                jsonFile: 'saasai_tools.json',
                csvFile: 'saasai_tools.csv'
            },
            {
                name: 'A16Z',
                jsonFile: 'a16z_ai_apps.json',
                csvFile: 'a16z_ai_apps.csv'
            },
            {
                name: 'RapidAPI',
                jsonFile: 'rapidapi_ai_tools.json',
                csvFile: 'rapidapi_ai_tools.csv'
            }
        ];
        this.stats = {};
    }

    async consolidate() {
        console.log('Starting AI tools consolidation...');
        console.log(`Looking for data from ${this.sources.length} sources\n`);

        // Load data from each source
        for (const source of this.sources) {
            await this.loadSourceData(source);
        }

        // Remove duplicates and normalize data
        await this.deduplicateAndNormalize();

        // Generate statistics
        this.generateStatistics();

        // Save consolidated results
        await this.saveConsolidatedData();

        // Create detection-ready files
        await this.createDetectionFiles();

        console.log('\n=== CONSOLIDATION COMPLETE ===');
        console.log(`Total unique AI tools: ${this.allTools.length}`);
        this.printStatistics();
    }

    async loadSourceData(source) {
        const jsonPath = path.join(__dirname, source.jsonFile);
        
        try {
            if (fs.existsSync(jsonPath)) {
                const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                const toolCount = Array.isArray(data) ? data.length : 0;
                
                console.log(`✓ Loaded ${toolCount} tools from ${source.name}`);
                
                if (Array.isArray(data)) {
                    // Normalize the data structure
                    const normalizedTools = data.map(tool => this.normalizeToolData(tool, source.name));
                    this.allTools.push(...normalizedTools);
                    
                    this.stats[source.name] = {
                        loaded: toolCount,
                        file: source.jsonFile
                    };
                } else {
                    console.log(`⚠ Warning: ${source.name} data is not an array`);
                    this.stats[source.name] = { loaded: 0, error: 'Invalid data format' };
                }
            } else {
                console.log(`✗ File not found: ${source.jsonFile}`);
                this.stats[source.name] = { loaded: 0, error: 'File not found' };
            }
        } catch (error) {
            console.log(`✗ Error loading ${source.name}: ${error.message}`);
            this.stats[source.name] = { loaded: 0, error: error.message };
        }
    }

    normalizeToolData(tool, sourceName) {
        // Create a standardized tool object
        return {
            name: this.cleanToolName(tool.name || ''),
            originalName: tool.name || '',
            description: tool.description || '',
            url: tool.url || tool.websiteUrl || '',
            category: tool.category || '',
            source: sourceName.toLowerCase(),
            
            // Source-specific fields
            imageUrl: tool.imageUrl || '',
            pricing: tool.pricing || '',
            rating: tool.rating || '',
            features: tool.features || '',
            provider: tool.provider || '',
            searchTerm: tool.searchTerm || '',
            
            // Metadata
            dateAdded: new Date().toISOString(),
            confidence: this.calculateConfidence(tool, sourceName)
        };
    }

    cleanToolName(name) {
        if (!name) return '';
        
        return name
            .trim()
            .replace(/^\d+\.\s*/, '') // Remove numbering
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/[^\w\s\-\.\&]/g, '') // Remove special chars except common ones
            .trim();
    }

    calculateConfidence(tool, sourceName) {
        let confidence = 0.5; // Base confidence
        
        // Higher confidence for curated sources
        const curatedSources = ['a16z', 'aixploria'];
        if (curatedSources.includes(sourceName.toLowerCase())) {
            confidence += 0.3;
        }
        
        // Boost confidence based on available data
        if (tool.description && tool.description.length > 20) confidence += 0.1;
        if (tool.url && tool.url.includes('http')) confidence += 0.1;
        if (tool.category) confidence += 0.05;
        
        return Math.min(confidence, 1.0);
    }

    async deduplicateAndNormalize() {
        console.log('\nDeduplicating and normalizing data...');
        
        const uniqueTools = [];
        const seenNames = new Map();
        const duplicates = [];
        
        for (const tool of this.allTools) {
            const normalizedName = tool.name.toLowerCase().trim();
            
            if (!normalizedName || normalizedName.length < 2) {
                continue; // Skip invalid names
            }
            
            if (seenNames.has(normalizedName)) {
                // Handle duplicate - merge data if possible
                const existingTool = seenNames.get(normalizedName);
                const mergedTool = this.mergeToolData(existingTool, tool);
                
                // Replace the existing tool with merged version
                const index = uniqueTools.findIndex(t => t.name.toLowerCase() === normalizedName);
                if (index !== -1) {
                    uniqueTools[index] = mergedTool;
                }
                
                duplicates.push({
                    name: tool.name,
                    sources: [existingTool.source, tool.source]
                });
            } else {
                seenNames.set(normalizedName, tool);
                uniqueTools.push(tool);
            }
        }
        
        console.log(`Removed ${this.allTools.length - uniqueTools.length} duplicates`);
        console.log(`Merged data for ${duplicates.length} tools found in multiple sources`);
        
        this.allTools = uniqueTools;
        
        // Sort by confidence and name
        this.allTools.sort((a, b) => {
            if (b.confidence !== a.confidence) {
                return b.confidence - a.confidence;
            }
            return a.name.localeCompare(b.name);
        });
    }

    mergeToolData(existing, duplicate) {
        // Merge tool data, preferring more complete information
        return {
            ...existing,
            description: this.chooseBetter(existing.description, duplicate.description, 'length'),
            url: existing.url || duplicate.url,
            category: existing.category || duplicate.category,
            imageUrl: existing.imageUrl || duplicate.imageUrl,
            pricing: existing.pricing || duplicate.pricing,
            rating: existing.rating || duplicate.rating,
            features: this.chooseBetter(existing.features, duplicate.features, 'length'),
            provider: existing.provider || duplicate.provider,
            
            // Combine sources
            source: `${existing.source},${duplicate.source}`,
            confidence: Math.max(existing.confidence, duplicate.confidence) + 0.1, // Boost for multiple sources
            
            // Keep original metadata
            dateAdded: existing.dateAdded
        };
    }

    chooseBetter(value1, value2, criteria) {
        if (!value1) return value2;
        if (!value2) return value1;
        
        if (criteria === 'length') {
            return value1.length >= value2.length ? value1 : value2;
        }
        
        return value1;
    }

    generateStatistics() {
        this.stats.consolidated = {
            totalTools: this.allTools.length,
            withDescriptions: this.allTools.filter(t => t.description && t.description.length > 10).length,
            withUrls: this.allTools.filter(t => t.url && t.url.includes('http')).length,
            withCategories: this.allTools.filter(t => t.category).length,
            highConfidence: this.allTools.filter(t => t.confidence > 0.7).length
        };

        // Category distribution
        const categories = {};
        this.allTools.forEach(tool => {
            if (tool.category) {
                const cat = tool.category.toLowerCase();
                categories[cat] = (categories[cat] || 0) + 1;
            }
        });
        
        this.stats.topCategories = Object.entries(categories)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Source distribution
        const sources = {};
        this.allTools.forEach(tool => {
            tool.source.split(',').forEach(src => {
                sources[src] = (sources[src] || 0) + 1;
            });
        });
        
        this.stats.sourceDistribution = sources;
    }

    async saveConsolidatedData() {
        console.log('\nSaving consolidated data...');
        
        // Save complete JSON
        const jsonPath = path.join(__dirname, 'consolidated_ai_tools.json');
        fs.writeFileSync(jsonPath, JSON.stringify(this.allTools, null, 2));
        console.log(`✓ Saved complete data to ${jsonPath}`);
        
        // Save CSV
        const csvPath = path.join(__dirname, 'consolidated_ai_tools.csv');
        const csvHeader = 'name,description,url,category,source,confidence,pricing,features,provider\n';
        const csvContent = this.allTools.map(tool => 
            `"${tool.name.replace(/"/g, '""')}","${tool.description.replace(/"/g, '""')}","${tool.url}","${tool.category}","${tool.source}","${tool.confidence}","${tool.pricing}","${tool.features.replace(/"/g, '""')}","${tool.provider}"`
        ).join('\n');
        
        fs.writeFileSync(csvPath, csvHeader + csvContent);
        console.log(`✓ Saved CSV to ${csvPath}`);
        
        // Save high-confidence subset
        const highConfidenceTools = this.allTools.filter(t => t.confidence > 0.7);
        const highConfPath = path.join(__dirname, 'high_confidence_ai_tools.json');
        fs.writeFileSync(highConfPath, JSON.stringify(highConfidenceTools, null, 2));
        console.log(`✓ Saved ${highConfidenceTools.length} high-confidence tools to ${highConfPath}`);
        
        // Save statistics
        const statsPath = path.join(__dirname, 'consolidation_stats.json');
        fs.writeFileSync(statsPath, JSON.stringify(this.stats, null, 2));
        console.log(`✓ Saved statistics to ${statsPath}`);
    }

    async createDetectionFiles() {
        console.log('\nCreating detection-ready files...');
        
        // All tool names (for basic detection)
        const allNames = this.allTools.map(t => t.name).join('\n');
        fs.writeFileSync(path.join(__dirname, 'all_ai_tool_names.txt'), allNames);
        
        // High-confidence tool names
        const highConfNames = this.allTools
            .filter(t => t.confidence > 0.7)
            .map(t => t.name)
            .join('\n');
        fs.writeFileSync(path.join(__dirname, 'high_confidence_tool_names.txt'), highConfNames);
        
        // Domain extraction for URL detection
        const domains = new Set();
        this.allTools.forEach(tool => {
            if (tool.url) {
                try {
                    const url = new URL(tool.url);
                    domains.add(url.hostname);
                } catch (e) {
                    // Invalid URL, skip
                }
            }
        });
        
        const domainsList = Array.from(domains).sort().join('\n');
        fs.writeFileSync(path.join(__dirname, 'ai_tool_domains.txt'), domainsList);
        
        // Category-based grouping
        const categoryGroups = {};
        this.allTools.forEach(tool => {
            if (tool.category) {
                const cat = tool.category.toLowerCase();
                if (!categoryGroups[cat]) categoryGroups[cat] = [];
                categoryGroups[cat].push(tool.name);
            }
        });
        
        fs.writeFileSync(
            path.join(__dirname, 'ai_tools_by_category.json'), 
            JSON.stringify(categoryGroups, null, 2)
        );
        
        console.log(`✓ Created detection files:`);
        console.log(`  - all_ai_tool_names.txt (${this.allTools.length} names)`);
        console.log(`  - high_confidence_tool_names.txt (${this.allTools.filter(t => t.confidence > 0.7).length} names)`);
        console.log(`  - ai_tool_domains.txt (${domains.size} domains)`);
        console.log(`  - ai_tools_by_category.json (${Object.keys(categoryGroups).length} categories)`);
    }

    printStatistics() {
        console.log('\n=== CONSOLIDATION STATISTICS ===');
        
        // Source statistics
        console.log('\nData loaded per source:');
        Object.entries(this.stats).forEach(([source, data]) => {
            if (source !== 'consolidated' && source !== 'topCategories' && source !== 'sourceDistribution') {
                if (data.error) {
                    console.log(`  ${source}: ✗ ${data.error}`);
                } else {
                    console.log(`  ${source}: ${data.loaded} tools`);
                }
            }
        });
        
        // Consolidated statistics
        const cons = this.stats.consolidated;
        console.log('\nConsolidated dataset:');
        console.log(`  Total unique tools: ${cons.totalTools}`);
        console.log(`  With descriptions: ${cons.withDescriptions} (${Math.round(cons.withDescriptions/cons.totalTools*100)}%)`);
        console.log(`  With URLs: ${cons.withUrls} (${Math.round(cons.withUrls/cons.totalTools*100)}%)`);
        console.log(`  With categories: ${cons.withCategories} (${Math.round(cons.withCategories/cons.totalTools*100)}%)`);
        console.log(`  High confidence: ${cons.highConfidence} (${Math.round(cons.highConfidence/cons.totalTools*100)}%)`);
        
        // Top categories
        console.log('\nTop categories:');
        this.stats.topCategories.slice(0, 5).forEach(([cat, count]) => {
            console.log(`  ${cat}: ${count} tools`);
        });
        
        // Sample tools
        console.log('\nSample high-confidence tools:');
        this.allTools
            .filter(t => t.confidence > 0.8)
            .slice(0, 5)
            .forEach((tool, i) => {
                console.log(`  ${i+1}. ${tool.name} (${tool.source}) - ${tool.confidence.toFixed(2)}`);
            });
    }
}

// Run the consolidator
if (require.main === module) {
    const consolidator = new AIToolsConsolidator();
    consolidator.consolidate().catch(console.error);
}

module.exports = AIToolsConsolidator;
