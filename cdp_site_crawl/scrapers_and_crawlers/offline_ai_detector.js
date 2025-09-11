// offline_ai_detector.js
// Offline AI detection system with enhanced evidence collection and false positive filtering

const fs = require('fs');
const path = require('path');

class OfflineAIDetector {
    constructor() {
        this.aiDomains = this.loadAIDomains();
        this.aiFunctions = this.loadAIFunctions();
        this.enhancedPatterns = this.loadEnhancedPatterns();
        this.falsePositiveFilters = this.initializeFalsePositiveFilters();
    }
    
    loadAIDomains() {
        try {
            const content = fs.readFileSync('./domains.txt', 'utf8');
            return content.split('\n').filter(line => line.trim().length > 0);
        } catch (error) {
            console.warn('Could not load domains.txt, using default patterns');
            return ['openai.com', 'anthropic.com', 'cohere.ai'];
        }
    }
    
    loadAIFunctions() {
        try {
            const content = fs.readFileSync('./functions.txt', 'utf8');
            return content.split('\n').filter(line => line.trim().length > 0);
        } catch (error) {
            console.warn('Could not load functions.txt, using default patterns');
            return ['client.messages.create', 'openai.chat.completions'];
        }
    }
    
    loadEnhancedPatterns() {
        try {
            const content = fs.readFileSync('./enhanced_ai_patterns.json', 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.warn('Could not load enhanced patterns, using minimal set');
            return { domains: [], urlPatterns: [], jsLibraries: [] };
        }
    }
    
    initializeFalsePositiveFilters() {
        return {
            // News/article context indicators
            newsContexts: [
                'news', 'article', 'story', 'report', 'journalism', 'breaking',
                'headline', 'reuters', 'associated press', 'cnn', 'bbc', 'nytimes'
            ],
            
            // Educational/informational context
            educationalContexts: [
                'learn', 'tutorial', 'course', 'education', 'study', 'research',
                'academic', 'university', 'school', 'definition', 'explanation'
            ],
            
            // Marketing/promotional context
            marketingContexts: [
                'advertisement', 'ad', 'promote', 'marketing', 'sale', 'discount',
                'offer', 'deal', 'campaign', 'sponsor'
            ],
            
            // Actual AI usage indicators (high confidence)
            realUsageIndicators: [
                'api key', 'authentication', 'bearer token', 'authorization',
                'request payload', 'response data', 'function call', 'method invocation',
                'sdk', 'library import', 'client initialization'
            ]
        };
    }
    
    /**
     * Analyze log files for a single site with detailed evidence collection
     */
    async analyzeLogFiles(logDir) {
        const siteUrl = path.basename(logDir);
        const detectionResult = {
            site: siteUrl,
            aiDetected: false,
            confidence: 0,
            categories: [],
            totalEvidence: 0,
            detailedEvidence: [],
            falsePositiveRisk: 0,
            contextAnalysis: {
                newsContext: false,
                educationalContext: false,
                marketingContext: false,
                realUsageContext: false
            },
            quantificationMetrics: {
                apiCallCount: 0,
                uniqueAIDomains: new Set(),
                functionCallCount: 0,
                contentMatches: 0,
                streamingIndicators: 0,
                jsLibraryCount: 0
            }
        };
        
        const logFiles = [
            'network.log',
            'responses.log', 
            'dom.log',
            'debug.log',
            'interactions.log'
        ];
        
        for (const logFile of logFiles) {
            const logPath = path.join(logDir, logFile);
            if (fs.existsSync(logPath)) {
                await this.analyzeLogFile(logPath, logFile, detectionResult);
            }
        }
        
        // Calculate final metrics
        this.calculateFinalMetrics(detectionResult);
        
        return detectionResult;
    }
    
    /**
     * Analyze individual log file with detailed evidence extraction
     */
    async analyzeLogFile(logPath, logType, detectionResult) {
        try {
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim().length > 0);
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lineNumber = i + 1;
                
                try {
                    const logEntry = JSON.parse(line);
                    await this.analyzeLogEntry(logEntry, logType, lineNumber, detectionResult);
                } catch (parseError) {
                    // Skip malformed JSON lines
                    continue;
                }
            }
        } catch (error) {
            console.warn(`Could not analyze ${logPath}: ${error.message}`);
        }
    }
    
    /**
     * Analyze individual log entry with comprehensive evidence collection
     */
    async analyzeLogEntry(logEntry, logType, lineNumber, detectionResult) {
        const evidence = [];
        
        // Network request analysis
        if (logType === 'network.log' && logEntry.request) {
            const networkEvidence = this.analyzeNetworkRequest(logEntry, lineNumber);
            evidence.push(...networkEvidence);
        }
        
        // Response analysis
        if (logType === 'responses.log' && logEntry.response) {
            const responseEvidence = this.analyzeResponse(logEntry, lineNumber);
            evidence.push(...responseEvidence);
        }
        
        // DOM content analysis
        if (logType === 'dom.log' && logEntry.html) {
            const domEvidence = this.analyzeDOMContent(logEntry, lineNumber);
            evidence.push(...domEvidence);
        }
        
        // Debug/script analysis
        if (logType === 'debug.log' && logEntry.url) {
            const scriptEvidence = this.analyzeScript(logEntry, lineNumber);
            evidence.push(...scriptEvidence);
        }
        
        // Interaction analysis
        if (logType === 'interactions.log') {
            const interactionEvidence = this.analyzeInteraction(logEntry, lineNumber);
            evidence.push(...interactionEvidence);
        }
        
        // Process evidence
        for (const item of evidence) {
            this.processEvidence(item, detectionResult);
        }
    }
    
    /**
     * Analyze network request with detailed evidence
     */
    analyzeNetworkRequest(logEntry, lineNumber) {
        const evidence = [];
        const url = logEntry.request.url;
        const headers = logEntry.request.headers || {};
        
        // Check AI domains
        for (const domain of this.aiDomains) {
            if (url.includes(domain)) {
                evidence.push({
                    type: 'ai_domain',
                    subtype: 'network_request',
                    confidence: 0.9,
                    details: {
                        domain: domain,
                        fullUrl: url,
                        method: logEntry.request.method,
                        headers: headers,
                        timestamp: logEntry.timestamp,
                        logLine: lineNumber
                    },
                    rawData: logEntry
                });
                
                // Check for API endpoints
                const apiPatterns = ['/v1/', '/api/', '/chat/', '/completions', '/generate'];
                for (const pattern of apiPatterns) {
                    if (url.includes(pattern)) {
                        evidence.push({
                            type: 'api_endpoint',
                            subtype: 'network_request',
                            confidence: 0.95,
                            details: {
                                endpoint: pattern,
                                fullUrl: url,
                                domain: domain,
                                logLine: lineNumber
                            },
                            rawData: logEntry
                        });
                    }
                }
            }
        }
        
        // Check for AI-related headers
        const aiHeaders = ['authorization', 'x-api-key', 'openai-organization'];
        for (const header of aiHeaders) {
            if (headers[header]) {
                evidence.push({
                    type: 'ai_header',
                    subtype: 'authentication',
                    confidence: 0.85,
                    details: {
                        header: header,
                        value: this.sanitizeAuthValue(headers[header]),
                        url: url,
                        logLine: lineNumber
                    },
                    rawData: logEntry
                });
            }
        }
        
        return evidence;
    }
    
    /**
     * Analyze response with detailed evidence
     */
    analyzeResponse(logEntry, lineNumber) {
        const evidence = [];
        const response = logEntry.response;
        const url = response.url;
        
        // Check if response is from AI domain
        for (const domain of this.aiDomains) {
            if (url.includes(domain)) {
                evidence.push({
                    type: 'ai_response',
                    subtype: 'api_response',
                    confidence: 0.9,
                    details: {
                        domain: domain,
                        status: response.status,
                        mimeType: response.mimeType,
                        headers: response.headers,
                        contentLength: response.headers['content-length'],
                        logLine: lineNumber
                    },
                    rawData: logEntry
                });
                
                // Check for streaming responses
                if (response.headers['content-type']?.includes('text/event-stream') ||
                    response.headers['transfer-encoding'] === 'chunked') {
                    evidence.push({
                        type: 'streaming_response',
                        subtype: 'ai_streaming',
                        confidence: 0.95,
                        details: {
                            contentType: response.headers['content-type'],
                            transferEncoding: response.headers['transfer-encoding'],
                            domain: domain,
                            logLine: lineNumber
                        },
                        rawData: logEntry
                    });
                }
            }
        }
        
        return evidence;
    }
    
    /**
     * Analyze DOM content with context awareness
     */
    analyzeDOMContent(logEntry, lineNumber) {
        const evidence = [];
        const html = logEntry.html;
        const frameUrl = logEntry.frameUrl || '';
        
        // Function call detection
        for (const func of this.aiFunctions) {
            const regex = new RegExp(func.replace(/\./g, '\\.'), 'gi');
            const matches = html.match(regex);
            
            if (matches) {
                // Extract surrounding context
                const context = this.extractContext(html, func, 200);
                const contextAnalysis = this.analyzeContext(context);
                
                evidence.push({
                    type: 'function_call',
                    subtype: 'javascript',
                    confidence: contextAnalysis.realUsage ? 0.9 : 0.4,
                    details: {
                        function: func,
                        matchCount: matches.length,
                        context: context,
                        contextAnalysis: contextAnalysis,
                        frameUrl: frameUrl,
                        logLine: lineNumber
                    },
                    rawData: { html: html.substring(0, 1000) + '...' }
                });
            }
        }
        
        // JavaScript library detection
        if (this.enhancedPatterns.jsLibraries) {
            for (const library of this.enhancedPatterns.jsLibraries) {
                if (html.includes(library)) {
                    const context = this.extractContext(html, library, 150);
                    const contextAnalysis = this.analyzeContext(context);
                    
                    evidence.push({
                        type: 'js_library',
                        subtype: 'import_usage',
                        confidence: contextAnalysis.realUsage ? 0.85 : 0.3,
                        details: {
                            library: library,
                            context: context,
                            contextAnalysis: contextAnalysis,
                            frameUrl: frameUrl,
                            logLine: lineNumber
                        },
                        rawData: { html: html.substring(0, 1000) + '...' }
                    });
                }
            }
        }
        
        // Content pattern detection with context
        const aiContentPatterns = [
            'artificial intelligence', 'machine learning', 'neural network',
            'deep learning', 'chatbot', 'ai assistant', 'gpt', 'claude'
        ];
        
        for (const pattern of aiContentPatterns) {
            const regex = new RegExp(pattern, 'gi');
            const matches = html.match(regex);
            
            if (matches) {
                const context = this.extractContext(html, pattern, 300);
                const contextAnalysis = this.analyzeContext(context);
                
                evidence.push({
                    type: 'content_pattern',
                    subtype: 'text_mention',
                    confidence: contextAnalysis.realUsage ? 0.7 : 0.2,
                    details: {
                        pattern: pattern,
                        matchCount: matches.length,
                        context: context,
                        contextAnalysis: contextAnalysis,
                        frameUrl: frameUrl,
                        logLine: lineNumber
                    },
                    rawData: { html: html.substring(0, 1000) + '...' }
                });
            }
        }
        
        return evidence;
    }
    
    /**
     * Analyze script loading/parsing
     */
    analyzeScript(logEntry, lineNumber) {
        const evidence = [];
        const url = logEntry.url;
        
        // Check for AI-related script URLs
        const aiScriptPatterns = ['openai', 'anthropic', 'cohere', 'huggingface'];
        
        for (const pattern of aiScriptPatterns) {
            if (url.includes(pattern)) {
                evidence.push({
                    type: 'script_loading',
                    subtype: 'ai_sdk',
                    confidence: 0.8,
                    details: {
                        scriptUrl: url,
                        pattern: pattern,
                        timestamp: logEntry.timestamp,
                        logLine: lineNumber
                    },
                    rawData: logEntry
                });
            }
        }
        
        return evidence;
    }
    
    /**
     * Analyze interactions for chatbot detection
     */
    analyzeInteraction(logEntry, lineNumber) {
        const evidence = [];
        
        if (logEntry.type === 'chatbot_detection' || 
            logEntry.summary?.includes('chatbot') ||
            logEntry.summary?.includes('assistant')) {
            
            evidence.push({
                type: 'chatbot_interaction',
                subtype: 'detected_interaction',
                confidence: 0.8,
                details: {
                    interactionType: logEntry.type,
                    summary: logEntry.summary,
                    timestamp: logEntry.timestamp,
                    logLine: lineNumber
                },
                rawData: logEntry
            });
        }
        
        return evidence;
    }
    
    /**
     * Extract context around a match for analysis
     */
    extractContext(text, match, contextLength = 200) {
        const index = text.toLowerCase().indexOf(match.toLowerCase());
        if (index === -1) return '';
        
        const start = Math.max(0, index - contextLength / 2);
        const end = Math.min(text.length, index + match.length + contextLength / 2);
        
        return text.substring(start, end);
    }
    
    /**
     * Analyze context to determine if it's real AI usage or false positive
     */
    analyzeContext(context) {
        const lowerContext = context.toLowerCase();
        
        const analysis = {
            newsContext: false,
            educationalContext: false,
            marketingContext: false,
            realUsage: false,
            confidence: 0
        };
        
        // Check for news/article context
        const newsMatches = this.falsePositiveFilters.newsContexts.filter(term => 
            lowerContext.includes(term)
        ).length;
        analysis.newsContext = newsMatches > 0;
        
        // Check for educational context
        const eduMatches = this.falsePositiveFilters.educationalContexts.filter(term => 
            lowerContext.includes(term)
        ).length;
        analysis.educationalContext = eduMatches > 0;
        
        // Check for marketing context
        const marketingMatches = this.falsePositiveFilters.marketingContexts.filter(term => 
            lowerContext.includes(term)
        ).length;
        analysis.marketingContext = marketingMatches > 0;
        
        // Check for real usage indicators
        const realUsageMatches = this.falsePositiveFilters.realUsageIndicators.filter(term => 
            lowerContext.includes(term)
        ).length;
        analysis.realUsage = realUsageMatches > 0;
        
        // Calculate confidence
        if (analysis.realUsage) {
            analysis.confidence = 0.9;
        } else if (analysis.newsContext || analysis.educationalContext || analysis.marketingContext) {
            analysis.confidence = 0.2;
        } else {
            analysis.confidence = 0.5;
        }
        
        return analysis;
    }
    
    /**
     * Process evidence and update detection result
     */
    processEvidence(evidence, detectionResult) {
        detectionResult.detailedEvidence.push(evidence);
        detectionResult.totalEvidence++;
        
        // Update quantification metrics
        const metrics = detectionResult.quantificationMetrics;
        
        switch (evidence.type) {
            case 'ai_domain':
            case 'api_endpoint':
                metrics.apiCallCount++;
                if (evidence.details.domain) {
                    metrics.uniqueAIDomains.add(evidence.details.domain);
                }
                break;
                
            case 'function_call':
                metrics.functionCallCount++;
                break;
                
            case 'content_pattern':
                metrics.contentMatches++;
                break;
                
            case 'streaming_response':
                metrics.streamingIndicators++;
                break;
                
            case 'js_library':
                metrics.jsLibraryCount++;
                break;
        }
        
        // Update context analysis
        if (evidence.details.contextAnalysis) {
            const ctx = evidence.details.contextAnalysis;
            if (ctx.newsContext) detectionResult.contextAnalysis.newsContext = true;
            if (ctx.educationalContext) detectionResult.contextAnalysis.educationalContext = true;
            if (ctx.marketingContext) detectionResult.contextAnalysis.marketingContext = true;
            if (ctx.realUsage) detectionResult.contextAnalysis.realUsageContext = true;
        }
    }
    
    /**
     * Calculate final detection metrics and confidence
     */
    calculateFinalMetrics(detectionResult) {
        const metrics = detectionResult.quantificationMetrics;
        
        // Convert Set to array for JSON serialization
        metrics.uniqueAIDomains = Array.from(metrics.uniqueAIDomains);
        
        // Calculate AI Usage Score (0-100)
        const usageScore = this.calculateAIUsageScore(metrics, detectionResult.contextAnalysis);
        detectionResult.aiUsageScore = usageScore;
        
        // Calculate confidence based on evidence quality and context
        const confidence = this.calculateConfidence(detectionResult);
        detectionResult.confidence = Math.round(confidence);
        
        // Determine if AI is detected
        detectionResult.aiDetected = confidence > 30 && usageScore > 10;
        
        // Calculate false positive risk
        detectionResult.falsePositiveRisk = this.calculateFalsePositiveRisk(detectionResult);
        
        // Categorize AI activity
        detectionResult.categories = this.categorizeAIActivity(detectionResult);
    }
    
    /**
     * Calculate AI Usage Score (0-100) based on quantifiable metrics
     */
    calculateAIUsageScore(metrics, contextAnalysis) {
        let score = 0;
        
        // API calls (high weight - strong indicator of actual usage)
        score += metrics.apiCallCount * 25;
        
        // Unique AI domains (indicates breadth of AI usage)
        score += metrics.uniqueAIDomains.length * 15;
        
        // Function calls (medium weight)
        score += metrics.functionCallCount * 10;
        
        // Streaming indicators (high weight - indicates active AI interaction)
        score += metrics.streamingIndicators * 20;
        
        // JavaScript libraries (medium weight)
        score += metrics.jsLibraryCount * 8;
        
        // Content matches (low weight - could be false positives)
        score += metrics.contentMatches * 2;
        
        // Context adjustments
        if (contextAnalysis.realUsageContext) {
            score *= 1.5; // Boost for real usage context
        }
        
        if (contextAnalysis.newsContext || contextAnalysis.educationalContext) {
            score *= 0.3; // Reduce for likely false positives
        }
        
        return Math.min(Math.round(score), 100);
    }
    
    /**
     * Calculate detection confidence
     */
    calculateConfidence(detectionResult) {
        let confidence = 0;
        let totalWeight = 0;
        
        for (const evidence of detectionResult.detailedEvidence) {
            const weight = this.getEvidenceWeight(evidence.type);
            confidence += evidence.confidence * weight;
            totalWeight += weight;
        }
        
        if (totalWeight === 0) return 0;
        
        const baseConfidence = confidence / totalWeight;
        
        // Apply context adjustments
        let adjustedConfidence = baseConfidence;
        
        if (detectionResult.contextAnalysis.realUsageContext) {
            adjustedConfidence *= 1.3;
        }
        
        if (detectionResult.contextAnalysis.newsContext) {
            adjustedConfidence *= 0.4;
        }
        
        if (detectionResult.contextAnalysis.educationalContext) {
            adjustedConfidence *= 0.6;
        }
        
        return Math.min(adjustedConfidence * 100, 100);
    }
    
    /**
     * Get evidence weight for confidence calculation
     */
    getEvidenceWeight(evidenceType) {
        const weights = {
            'ai_domain': 0.4,
            'api_endpoint': 0.5,
            'ai_response': 0.4,
            'streaming_response': 0.5,
            'function_call': 0.3,
            'js_library': 0.2,
            'content_pattern': 0.1,
            'chatbot_interaction': 0.3,
            'script_loading': 0.2,
            'ai_header': 0.4
        };
        
        return weights[evidenceType] || 0.1;
    }
    
    /**
     * Calculate false positive risk
     */
    calculateFalsePositiveRisk(detectionResult) {
        let risk = 0;
        
        // High risk if mostly content matches without technical evidence
        const technicalEvidence = detectionResult.detailedEvidence.filter(e => 
            ['ai_domain', 'api_endpoint', 'function_call', 'js_library'].includes(e.type)
        ).length;
        
        const contentEvidence = detectionResult.detailedEvidence.filter(e => 
            e.type === 'content_pattern'
        ).length;
        
        if (contentEvidence > technicalEvidence * 2) {
            risk += 0.4;
        }
        
        // Risk from context analysis
        if (detectionResult.contextAnalysis.newsContext) risk += 0.3;
        if (detectionResult.contextAnalysis.educationalContext) risk += 0.2;
        if (detectionResult.contextAnalysis.marketingContext) risk += 0.1;
        
        // Reduce risk for real usage indicators
        if (detectionResult.contextAnalysis.realUsageContext) risk *= 0.3;
        
        return Math.min(Math.round(risk * 100), 100);
    }
    
    /**
     * Categorize AI activity based on evidence
     */
    categorizeAIActivity(detectionResult) {
        const categories = [];
        const evidence = detectionResult.detailedEvidence;
        
        // Check for different AI categories based on evidence
        if (evidence.some(e => e.details.function?.includes('chat') || 
                            e.details.endpoint?.includes('chat'))) {
            categories.push('text_generation');
        }
        
        if (evidence.some(e => e.type === 'chatbot_interaction')) {
            categories.push('chatbot');
        }
        
        if (evidence.some(e => e.details.endpoint?.includes('embeddings'))) {
            categories.push('embedding');
        }
        
        if (evidence.some(e => e.details.domain?.includes('openai') ||
                            e.details.domain?.includes('anthropic'))) {
            categories.push('api_integration');
        }
        
        if (evidence.some(e => e.type === 'streaming_response')) {
            categories.push('streaming_ai');
        }
        
        return categories;
    }
    
    /**
     * Sanitize authentication values for storage
     */
    sanitizeAuthValue(value) {
        if (!value) return '';
        
        // Show only first and last few characters for security
        if (value.length > 10) {
            return value.substring(0, 4) + '***' + value.substring(value.length - 4);
        }
        
        return '***';
    }
}

module.exports = { OfflineAIDetector };
