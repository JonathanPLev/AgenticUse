const fs = require('fs');
const path = require('path');

class ComprehensiveAIDetector {
    constructor() {
        this.aiToolNames = new Set();
        this.aiDomains = new Set();
        this.aiCategories = {};
        this.detectionPatterns = {
            endpoints: [],
            sdks: [],
            functions: [],
            keywords: []
        };
        this.confidenceWeights = {
            exactToolName: 0.9,
            domainMatch: 0.8,
            endpointMatch: 0.7,
            sdkMatch: 0.6,
            functionMatch: 0.5,
            keywordMatch: 0.3
        };
    }

    async initialize() {
        console.log('Initializing Comprehensive AI Detector...');
        
        // Load consolidated AI tools data
        await this.loadAIToolsData();
        
        // Load existing detection patterns
        await this.loadDetectionPatterns();
        
        console.log(`Loaded ${this.aiToolNames.size} AI tool names`);
        console.log(`Loaded ${this.aiDomains.size} AI tool domains`);
        console.log(`Loaded ${Object.keys(this.aiCategories).length} categories`);
        console.log('Initialization complete.\n');
    }

    async loadAIToolsData() {
        // Load consolidated tools
        const consolidatedPath = path.join(__dirname, 'consolidated_ai_tools.json');
        if (fs.existsSync(consolidatedPath)) {
            const tools = JSON.parse(fs.readFileSync(consolidatedPath, 'utf8'));
            
            tools.forEach(tool => {
                // Add tool names
                this.aiToolNames.add(tool.name.toLowerCase());
                if (tool.originalName) {
                    this.aiToolNames.add(tool.originalName.toLowerCase());
                }
                
                // Extract domains from URLs
                if (tool.url) {
                    try {
                        const url = new URL(tool.url);
                        this.aiDomains.add(url.hostname.toLowerCase());
                    } catch (e) {
                        // Invalid URL, skip
                    }
                }
                
                // Group by categories
                if (tool.category) {
                    const cat = tool.category.toLowerCase();
                    if (!this.aiCategories[cat]) this.aiCategories[cat] = [];
                    this.aiCategories[cat].push(tool.name.toLowerCase());
                }
            });
        }

        // Load individual source files as backup
        const sourceFiles = [
            'all_ai_tool_names.txt',
            'high_confidence_tool_names.txt',
            'ai_tool_domains.txt'
        ];

        sourceFiles.forEach(filename => {
            const filePath = path.join(__dirname, filename);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n').filter(line => line.trim());
                
                if (filename.includes('names')) {
                    lines.forEach(name => this.aiToolNames.add(name.toLowerCase()));
                } else if (filename.includes('domains')) {
                    lines.forEach(domain => this.aiDomains.add(domain.toLowerCase()));
                }
            }
        });
    }

    async loadDetectionPatterns() {
        // Load enhanced patterns from existing detection system
        const patternsPath = path.join(__dirname, 'enhanced_ai_patterns.json');
        if (fs.existsSync(patternsPath)) {
            const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
            
            // Add to our detection patterns
            if (patterns.domains) {
                patterns.domains.forEach(domain => this.aiDomains.add(domain.toLowerCase()));
            }
            
            if (patterns.urlPatterns) {
                this.detectionPatterns.endpoints.push(...patterns.urlPatterns);
            }
            
            if (patterns.jsLibraries) {
                this.detectionPatterns.sdks.push(...patterns.jsLibraries);
            }
            
            if (patterns.contentIndicators) {
                this.detectionPatterns.keywords.push(...patterns.contentIndicators);
            }
        }

        // Add common AI API patterns
        this.detectionPatterns.endpoints.push(
            '/v1/chat/completions',
            '/v1/completions',
            '/generate',
            '/api/generate',
            '/predict',
            '/inference',
            '/models',
            '/embeddings'
        );

        this.detectionPatterns.sdks.push(
            'openai',
            '@anthropic-ai/sdk',
            'langchain',
            'transformers',
            'tensorflow',
            'pytorch',
            'huggingface'
        );

        this.detectionPatterns.functions.push(
            'createCompletion',
            'createChatCompletion',
            'generateText',
            'predict',
            'inference',
            'embed'
        );
    }

    async analyzeLogDirectory(logDirectory) {
        console.log(`Analyzing logs in: ${logDirectory}`);
        
        if (!fs.existsSync(logDirectory)) {
            throw new Error(`Log directory not found: ${logDirectory}`);
        }

        const results = {
            siteName: path.basename(logDirectory),
            aiDetected: false,
            confidence: 0,
            evidence: [],
            categories: new Set(),
            detectedTools: new Set(),
            logFiles: {}
        };

        // Analyze each log file
        const logFiles = ['network.log', 'dom.log', 'debug.log', 'responses.log', 'interactions.log'];
        
        for (const logFile of logFiles) {
            const logPath = path.join(logDirectory, logFile);
            if (fs.existsSync(logPath)) {
                const analysis = await this.analyzeLogFile(logPath, logFile);
                results.logFiles[logFile] = analysis;
                
                // Aggregate evidence
                results.evidence.push(...analysis.evidence);
                analysis.detectedTools.forEach(tool => results.detectedTools.add(tool));
                analysis.categories.forEach(cat => results.categories.add(cat));
            }
        }

        // Calculate overall confidence
        results.confidence = this.calculateOverallConfidence(results.evidence);
        results.aiDetected = results.confidence > 0.3;

        // Convert sets to arrays for JSON serialization
        results.categories = Array.from(results.categories);
        results.detectedTools = Array.from(results.detectedTools);

        return results;
    }

    async analyzeLogFile(logPath, logType) {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n');
        
        const analysis = {
            logType: logType,
            evidence: [],
            detectedTools: new Set(),
            categories: new Set(),
            lineCount: lines.length
        };

        lines.forEach((line, index) => {
            if (!line.trim()) return;

            const lineEvidence = this.analyzeLine(line, logType, index + 1);
            if (lineEvidence.length > 0) {
                analysis.evidence.push(...lineEvidence);
                
                lineEvidence.forEach(evidence => {
                    if (evidence.toolName) {
                        analysis.detectedTools.add(evidence.toolName);
                    }
                    if (evidence.category) {
                        analysis.categories.add(evidence.category);
                    }
                });
            }
        });

        return analysis;
    }

    analyzeLine(line, logType, lineNumber) {
        const evidence = [];
        const lineLower = line.toLowerCase();

        // Check for exact tool name matches
        for (const toolName of this.aiToolNames) {
            if (lineLower.includes(toolName)) {
                evidence.push({
                    type: 'exactToolName',
                    value: toolName,
                    confidence: this.confidenceWeights.exactToolName,
                    line: lineNumber,
                    logType: logType,
                    context: line.substring(0, 200),
                    toolName: toolName
                });
            }
        }

        // Check for domain matches
        for (const domain of this.aiDomains) {
            if (lineLower.includes(domain)) {
                evidence.push({
                    type: 'domainMatch',
                    value: domain,
                    confidence: this.confidenceWeights.domainMatch,
                    line: lineNumber,
                    logType: logType,
                    context: line.substring(0, 200)
                });
            }
        }

        // Check for API endpoint patterns
        for (const endpoint of this.detectionPatterns.endpoints) {
            if (lineLower.includes(endpoint.toLowerCase())) {
                evidence.push({
                    type: 'endpointMatch',
                    value: endpoint,
                    confidence: this.confidenceWeights.endpointMatch,
                    line: lineNumber,
                    logType: logType,
                    context: line.substring(0, 200)
                });
            }
        }

        // Check for SDK/library patterns
        for (const sdk of this.detectionPatterns.sdks) {
            if (lineLower.includes(sdk.toLowerCase())) {
                evidence.push({
                    type: 'sdkMatch',
                    value: sdk,
                    confidence: this.confidenceWeights.sdkMatch,
                    line: lineNumber,
                    logType: logType,
                    context: line.substring(0, 200)
                });
            }
        }

        // Check for function patterns
        for (const func of this.detectionPatterns.functions) {
            if (lineLower.includes(func.toLowerCase())) {
                evidence.push({
                    type: 'functionMatch',
                    value: func,
                    confidence: this.confidenceWeights.functionMatch,
                    line: lineNumber,
                    logType: logType,
                    context: line.substring(0, 200)
                });
            }
        }

        // Check for keyword patterns
        for (const keyword of this.detectionPatterns.keywords) {
            if (lineLower.includes(keyword.toLowerCase())) {
                evidence.push({
                    type: 'keywordMatch',
                    value: keyword,
                    confidence: this.confidenceWeights.keywordMatch,
                    line: lineNumber,
                    logType: logType,
                    context: line.substring(0, 200)
                });
            }
        }

        return evidence;
    }

    calculateOverallConfidence(evidence) {
        if (evidence.length === 0) return 0;

        // Group evidence by type
        const evidenceByType = {};
        evidence.forEach(e => {
            if (!evidenceByType[e.type]) evidenceByType[e.type] = [];
            evidenceByType[e.type].push(e);
        });

        // Calculate weighted confidence
        let totalConfidence = 0;
        let maxPossibleConfidence = 0;

        Object.entries(this.confidenceWeights).forEach(([type, weight]) => {
            maxPossibleConfidence += weight;
            
            if (evidenceByType[type]) {
                // Use the maximum confidence for this type (avoid double counting)
                const maxConfidenceForType = Math.max(...evidenceByType[type].map(e => e.confidence));
                totalConfidence += maxConfidenceForType;
            }
        });

        return Math.min(totalConfidence / maxPossibleConfidence, 1.0);
    }

    async analyzeBulkLogs(logsRootDirectory) {
        console.log(`Starting bulk analysis of logs in: ${logsRootDirectory}`);
        
        const results = {
            totalSites: 0,
            sitesWithAI: 0,
            detectionRate: 0,
            sites: [],
            summary: {
                topTools: {},
                topCategories: {},
                confidenceDistribution: { high: 0, medium: 0, low: 0 }
            }
        };

        // Find all site directories
        const entries = fs.readdirSync(logsRootDirectory);
        const siteDirectories = entries.filter(entry => {
            const fullPath = path.join(logsRootDirectory, entry);
            return fs.statSync(fullPath).isDirectory();
        });

        console.log(`Found ${siteDirectories.length} site directories to analyze\n`);

        // Analyze each site
        for (const siteDir of siteDirectories) {
            const sitePath = path.join(logsRootDirectory, siteDir);
            
            try {
                console.log(`Analyzing ${siteDir}...`);
                const siteResult = await this.analyzeLogDirectory(sitePath);
                
                results.sites.push(siteResult);
                results.totalSites++;
                
                if (siteResult.aiDetected) {
                    results.sitesWithAI++;
                    console.log(`  ✓ AI detected (${(siteResult.confidence * 100).toFixed(1)}% confidence)`);
                    
                    // Update summary statistics
                    siteResult.detectedTools.forEach(tool => {
                        results.summary.topTools[tool] = (results.summary.topTools[tool] || 0) + 1;
                    });
                    
                    siteResult.categories.forEach(cat => {
                        results.summary.topCategories[cat] = (results.summary.topCategories[cat] || 0) + 1;
                    });
                    
                    // Confidence distribution
                    if (siteResult.confidence > 0.7) results.summary.confidenceDistribution.high++;
                    else if (siteResult.confidence > 0.4) results.summary.confidenceDistribution.medium++;
                    else results.summary.confidenceDistribution.low++;
                } else {
                    console.log(`  - No AI detected`);
                }
                
            } catch (error) {
                console.error(`  ✗ Error analyzing ${siteDir}: ${error.message}`);
            }
        }

        // Calculate detection rate
        results.detectionRate = results.totalSites > 0 ? 
            (results.sitesWithAI / results.totalSites) * 100 : 0;

        // Sort summary data
        results.summary.topTools = Object.entries(results.summary.topTools)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
            
        results.summary.topCategories = Object.entries(results.summary.topCategories)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        return results;
    }

    async saveResults(results, outputPath) {
        // Save detailed results
        const detailedPath = path.join(outputPath, 'comprehensive_ai_detection_results.json');
        fs.writeFileSync(detailedPath, JSON.stringify(results, null, 2));
        
        // Save summary report
        const summaryPath = path.join(outputPath, 'ai_detection_summary.json');
        const summary = {
            totalSites: results.totalSites,
            sitesWithAI: results.sitesWithAI,
            detectionRate: results.detectionRate.toFixed(1) + '%',
            topTools: results.summary.topTools,
            topCategories: results.summary.topCategories,
            confidenceDistribution: results.summary.confidenceDistribution
        };
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        
        // Save CSV report
        const csvPath = path.join(outputPath, 'ai_detection_report.csv');
        const csvHeader = 'siteName,aiDetected,confidence,toolsDetected,categories,evidenceCount\n';
        const csvContent = results.sites.map(site => 
            `"${site.siteName}","${site.aiDetected}","${site.confidence.toFixed(3)}","${site.detectedTools.join(';')}","${site.categories.join(';')}","${site.evidence.length}"`
        ).join('\n');
        
        fs.writeFileSync(csvPath, csvHeader + csvContent);
        
        console.log(`\nResults saved to:`);
        console.log(`  - ${detailedPath}`);
        console.log(`  - ${summaryPath}`);
        console.log(`  - ${csvPath}`);
    }

    printSummary(results) {
        console.log('\n=== COMPREHENSIVE AI DETECTION SUMMARY ===');
        console.log(`Total sites analyzed: ${results.totalSites}`);
        console.log(`Sites with AI detected: ${results.sitesWithAI}`);
        console.log(`Detection rate: ${results.detectionRate.toFixed(1)}%`);
        
        console.log('\nTop detected AI tools:');
        results.summary.topTools.slice(0, 5).forEach(([tool, count]) => {
            console.log(`  ${tool}: ${count} sites`);
        });
        
        console.log('\nTop AI categories:');
        results.summary.topCategories.slice(0, 5).forEach(([cat, count]) => {
            console.log(`  ${cat}: ${count} sites`);
        });
        
        console.log('\nConfidence distribution:');
        const dist = results.summary.confidenceDistribution;
        console.log(`  High (>70%): ${dist.high} sites`);
        console.log(`  Medium (40-70%): ${dist.medium} sites`);
        console.log(`  Low (<40%): ${dist.low} sites`);
        
        console.log('\nSites with AI detected:');
        results.sites
            .filter(site => site.aiDetected)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 10)
            .forEach(site => {
                console.log(`  ${site.siteName}: ${(site.confidence * 100).toFixed(1)}% (${site.detectedTools.slice(0, 3).join(', ')})`);
            });
    }
}

// CLI interface
async function main() {
    if (process.argv.length < 3) {
        console.log('Usage: node comprehensive_ai_detector.js <logs_directory> [output_directory]');
        console.log('Example: node comprehensive_ai_detector.js ./logs_stealth ./results');
        process.exit(1);
    }

    const logsDirectory = process.argv[2];
    const outputDirectory = process.argv[3] || './';

    try {
        const detector = new ComprehensiveAIDetector();
        await detector.initialize();
        
        const results = await detector.analyzeBulkLogs(logsDirectory);
        
        await detector.saveResults(results, outputDirectory);
        detector.printSummary(results);
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = ComprehensiveAIDetector;
