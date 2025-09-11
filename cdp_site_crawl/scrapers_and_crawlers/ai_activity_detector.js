// ai_activity_detector.js
// Comprehensive AI activity detection system for CDP crawl logs
// Analyzes network requests, DOM content, and JavaScript execution for AI service usage

const fs = require('fs');
const path = require('path');

class AIActivityDetector {
    constructor() {
        // Load AI detection patterns from files
        this.aiDomains = this.loadDetectionPatterns('../domains.txt');
        this.aiFunctions = this.loadDetectionPatterns('../functions.txt');
        
        // Extended AI detection patterns
        this.aiPatterns = {
            // API endpoints
            endpoints: [
                /api\.openai\.com/i,
                /api\.anthropic\.com/i,
                /api\.cohere\.ai/i,
                /api\.ai21\.com/i,
                /huggingface\.co\/api/i,
                /api\.stability\.ai/i,
                /cloud\.google\.com.*ai/i,
                /api\.aleph-alpha\.com/i,
                /api\.elevenlabs\.io/i,
                /api\.assemblyai\.com/i,
                /api\.runwayml\.com/i,
                /api\.replicate\.com/i,
                /api\.perplexity\.ai/i,
                /api\.mistral\.ai/i,
                /api\.jasper\.ai/i,
                /api\.copy\.ai/i,
                /api\.scale\.com/i,
                /api\.deepl\.com/i,
                /api\.lilt\.com/i,
                /api\.pandorabots\.com/i,
                /api\.botpress\.cloud/i
            ],
            
            // Function names and method calls
            functions: [
                /client\.responses\.create/i,
                /client\.messages\.create/i,
                /anthropic\.Anthropic/i,
                /MessageCreateParams\.builder/i,
                /com\.anthropic\.models/i,
                /client\.messages\(\)/i,
                /client\.messages/i,
                /anthropic\.MessageNewParams/i,
                /anthropic\.NewClient/i,
                /client\.beta\.messages/i,
                /client\.chat\.completions/i,
                /client\.messages\.batches/i,
                /cohere\.chat/i,
                /cohere\.builder/i,
                /cohere\.api\.Cohere/i,
                /cohere\.api\.requests\.ChatRequest/i,
                /cohere\.api\.types\.ChatMessage/i,
                /cohere\.api\.types\.Message/i,
                /cohere\.api\.types\.NonStreamedChatResponse/i,
                /cohere\.api\.core\.ApiError/i,
                /ChatRequest\.builder/i,
                /ChatRequest\.message/i,
                /ChatRequest\.chatHistory/i
            ],
            
            // Content patterns in HTML/JS
            content: [
                /artificial.intelligence/i,
                /machine.learning/i,
                /neural.network/i,
                /deep.learning/i,
                /natural.language.processing/i,
                /nlp/i,
                /gpt/i,
                /chatbot/i,
                /ai.assistant/i,
                /voice.recognition/i,
                /speech.to.text/i,
                /text.to.speech/i,
                /image.generation/i,
                /computer.vision/i,
                /sentiment.analysis/i,
                /language.model/i,
                /transformer/i,
                /embedding/i,
                /completion/i,
                /prompt/i
            ],
            
            // HTTP headers that might indicate AI usage
            headers: [
                /openai-/i,
                /anthropic-/i,
                /x-api-key/i,
                /authorization.*bearer/i,
                /content-type.*application\/json/i
            ],
            
            // Request/response patterns
            requestPatterns: [
                /chat/i,
                /completion/i,
                /generate/i,
                /inference/i,
                /predict/i,
                /classify/i,
                /embed/i,
                /transcribe/i,
                /translate/i,
                /summarize/i
            ]
        };
        
        // AI activity categories for classification
        this.aiCategories = {
            'text_generation': ['gpt', 'completion', 'generate', 'chat'],
            'image_generation': ['dall-e', 'midjourney', 'stable-diffusion', 'image'],
            'speech_processing': ['whisper', 'speech', 'voice', 'audio'],
            'translation': ['translate', 'translation', 'deepl'],
            'chatbot': ['chatbot', 'bot', 'assistant', 'support'],
            'analytics': ['sentiment', 'analysis', 'classify', 'predict'],
            'embedding': ['embed', 'vector', 'similarity'],
            'api_integration': ['api', 'sdk', 'client', 'integration']
        };
    }
    
    loadDetectionPatterns(filePath) {
        try {
            const fullPath = path.resolve(__dirname, filePath);
            const content = fs.readFileSync(fullPath, 'utf8');
            return content.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
        } catch (error) {
            console.warn(`Could not load patterns from ${filePath}:`, error.message);
            return [];
        }
    }
    
    /**
     * Main detection method - analyzes all log files for a site
     */
    async detectAIActivity(siteDataDir) {
        const results = {
            site: path.basename(siteDataDir),
            timestamp: new Date().toISOString(),
            aiDetected: false,
            confidence: 0,
            categories: [],
            evidence: {
                network: [],
                dom: [],
                javascript: [],
                interactions: []
            },
            summary: {}
        };
        
        try {
            // Analyze each log file type
            await this.analyzeNetworkLogs(siteDataDir, results);
            await this.analyzeDOMLogs(siteDataDir, results);
            await this.analyzeDebugLogs(siteDataDir, results);
            await this.analyzeResponseLogs(siteDataDir, results);
            await this.analyzeInteractionLogs(siteDataDir, results);
            
            // Calculate overall confidence and categorize
            this.calculateConfidence(results);
            this.categorizeActivity(results);
            
        } catch (error) {
            console.error(`Error analyzing ${siteDataDir}:`, error);
            results.error = error.message;
        }
        
        return results;
    }
    
    /**
     * Analyze network.log for AI-related requests
     */
    async analyzeNetworkLogs(siteDataDir, results) {
        const networkLogPath = path.join(siteDataDir, 'network.log');
        if (!fs.existsSync(networkLogPath)) return;
        
        const logContent = fs.readFileSync(networkLogPath, 'utf8');
        const lines = logContent.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const logEntry = JSON.parse(line);
                if (logEntry.event === 'requestWillBeSent' && logEntry.request) {
                    const request = logEntry.request;
                    const url = request.url;
                    const headers = request.headers || {};
                    
                    // Check URL against AI domains
                    const domainMatch = this.checkAIDomains(url);
                    if (domainMatch) {
                        results.evidence.network.push({
                            type: 'ai_domain',
                            url: url,
                            domain: domainMatch,
                            method: request.method,
                            timestamp: logEntry.timestamp,
                            confidence: 0.9
                        });
                    }
                    
                    // Check URL patterns
                    const patternMatch = this.checkAIPatterns(url, 'endpoints');
                    if (patternMatch) {
                        results.evidence.network.push({
                            type: 'ai_endpoint_pattern',
                            url: url,
                            pattern: patternMatch,
                            method: request.method,
                            timestamp: logEntry.timestamp,
                            confidence: 0.8
                        });
                    }
                    
                    // Check headers
                    const headerMatch = this.checkAIHeaders(headers);
                    if (headerMatch) {
                        results.evidence.network.push({
                            type: 'ai_headers',
                            url: url,
                            headers: headerMatch,
                            timestamp: logEntry.timestamp,
                            confidence: 0.7
                        });
                    }
                    
                    // Check request path patterns
                    const requestMatch = this.checkRequestPatterns(url);
                    if (requestMatch) {
                        results.evidence.network.push({
                            type: 'ai_request_pattern',
                            url: url,
                            pattern: requestMatch,
                            method: request.method,
                            timestamp: logEntry.timestamp,
                            confidence: 0.6
                        });
                    }
                }
            } catch (error) {
                // Skip malformed JSON lines
                continue;
            }
        }
    }
    
    /**
     * Analyze dom.log for AI-related content
     */
    async analyzeDOMLogs(siteDataDir, results) {
        const domLogPath = path.join(siteDataDir, 'dom.log');
        if (!fs.existsSync(domLogPath)) return;
        
        const logContent = fs.readFileSync(domLogPath, 'utf8');
        const lines = logContent.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const logEntry = JSON.parse(line);
                if (logEntry.html) {
                    const html = logEntry.html;
                    
                    // Check for AI-related content patterns
                    const contentMatches = this.checkAIContent(html);
                    if (contentMatches.length > 0) {
                        results.evidence.dom.push({
                            type: 'ai_content',
                            frameId: logEntry.frameId,
                            url: logEntry.url,
                            matches: contentMatches,
                            confidence: Math.min(0.5 + (contentMatches.length * 0.1), 0.9)
                        });
                    }
                    
                    // Check for AI function calls in inline scripts
                    const functionMatches = this.checkAIFunctions(html);
                    if (functionMatches.length > 0) {
                        results.evidence.dom.push({
                            type: 'ai_functions',
                            frameId: logEntry.frameId,
                            url: logEntry.url,
                            functions: functionMatches,
                            confidence: 0.8
                        });
                    }
                }
            } catch (error) {
                continue;
            }
        }
    }
    
    /**
     * Analyze debug.log for AI-related JavaScript execution
     */
    async analyzeDebugLogs(siteDataDir, results) {
        const debugLogPath = path.join(siteDataDir, 'debug.log');
        if (!fs.existsSync(debugLogPath)) return;
        
        const logContent = fs.readFileSync(debugLogPath, 'utf8');
        const lines = logContent.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const logEntry = JSON.parse(line);
                if (logEntry.event === 'scriptParsed' && logEntry.url) {
                    const scriptUrl = logEntry.url;
                    
                    // Check if script URL indicates AI usage
                    const aiMatch = this.checkAIDomains(scriptUrl) || this.checkAIPatterns(scriptUrl, 'endpoints');
                    if (aiMatch) {
                        results.evidence.javascript.push({
                            type: 'ai_script',
                            scriptId: logEntry.scriptId,
                            url: scriptUrl,
                            match: aiMatch,
                            timestamp: logEntry.timestamp,
                            confidence: 0.7
                        });
                    }
                }
            } catch (error) {
                continue;
            }
        }
    }
    
    /**
     * Analyze responses.log for AI service responses
     */
    async analyzeResponseLogs(siteDataDir, results) {
        const responsesLogPath = path.join(siteDataDir, 'responses.log');
        if (!fs.existsSync(responsesLogPath)) return;
        
        const logContent = fs.readFileSync(responsesLogPath, 'utf8');
        const lines = logContent.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const logEntry = JSON.parse(line);
                if (logEntry.event === 'responseReceived' && logEntry.response) {
                    const response = logEntry.response;
                    const url = response.url;
                    const headers = response.headers || {};
                    
                    // Check response URL
                    const domainMatch = this.checkAIDomains(url);
                    if (domainMatch) {
                        results.evidence.network.push({
                            type: 'ai_response',
                            url: url,
                            domain: domainMatch,
                            status: response.status,
                            mimeType: response.mimeType,
                            timestamp: logEntry.timestamp,
                            confidence: 0.9
                        });
                    }
                    
                    // Check response headers for AI indicators
                    const headerMatch = this.checkAIHeaders(headers);
                    if (headerMatch) {
                        results.evidence.network.push({
                            type: 'ai_response_headers',
                            url: url,
                            headers: headerMatch,
                            status: response.status,
                            timestamp: logEntry.timestamp,
                            confidence: 0.7
                        });
                    }
                }
            } catch (error) {
                continue;
            }
        }
    }
    
    /**
     * Analyze interactions.log for AI-related interactions
     */
    async analyzeInteractionLogs(siteDataDir, results) {
        const interactionsLogPath = path.join(siteDataDir, 'interactions.log');
        if (!fs.existsSync(interactionsLogPath)) return;
        
        const logContent = fs.readFileSync(interactionsLogPath, 'utf8');
        const lines = logContent.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const logEntry = JSON.parse(line);
                
                // Check chatbot detection events
                if (logEntry.event === 'chatbotDetectedInFrame') {
                    results.evidence.interactions.push({
                        type: 'chatbot_detected',
                        frameId: logEntry.frameId,
                        url: logEntry.url,
                        indicators: logEntry.indicators,
                        timestamp: logEntry.timestamp,
                        confidence: 0.6
                    });
                }
                
                // Check potential interaction requests
                if (logEntry.event === 'potentialInteractionRequest') {
                    const url = logEntry.url;
                    const aiMatch = this.checkAIDomains(url) || this.checkAIPatterns(url, 'endpoints');
                    if (aiMatch) {
                        results.evidence.interactions.push({
                            type: 'ai_interaction_request',
                            requestId: logEntry.requestId,
                            url: url,
                            method: logEntry.method,
                            match: aiMatch,
                            timestamp: logEntry.ts,
                            confidence: 0.8
                        });
                    }
                }
            } catch (error) {
                continue;
            }
        }
    }
    
    /**
     * Helper methods for pattern matching
     */
    checkAIDomains(url) {
        for (const domain of this.aiDomains) {
            if (url.includes(domain)) {
                return domain;
            }
        }
        return null;
    }
    
    checkAIPatterns(text, category) {
        const patterns = this.aiPatterns[category] || [];
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                return pattern.source;
            }
        }
        return null;
    }
    
    checkAIHeaders(headers) {
        const matches = [];
        for (const [key, value] of Object.entries(headers)) {
            const headerString = `${key}: ${value}`;
            for (const pattern of this.aiPatterns.headers) {
                if (pattern.test(headerString)) {
                    matches.push({ key, value, pattern: pattern.source });
                }
            }
        }
        return matches.length > 0 ? matches : null;
    }
    
    checkAIContent(html) {
        const matches = [];
        for (const pattern of this.aiPatterns.content) {
            const match = html.match(pattern);
            if (match) {
                matches.push({
                    pattern: pattern.source,
                    match: match[0],
                    count: (html.match(new RegExp(pattern.source, 'gi')) || []).length
                });
            }
        }
        return matches;
    }
    
    checkAIFunctions(html) {
        const matches = [];
        for (const func of this.aiFunctions) {
            if (html.includes(func)) {
                matches.push(func);
            }
        }
        return matches;
    }
    
    checkRequestPatterns(url) {
        for (const pattern of this.aiPatterns.requestPatterns) {
            if (pattern.test(url)) {
                return pattern.source;
            }
        }
        return null;
    }
    
    /**
     * Calculate overall confidence score
     */
    calculateConfidence(results) {
        let totalScore = 0;
        let evidenceCount = 0;
        
        // Weight different types of evidence
        const weights = {
            network: 1.0,
            dom: 0.7,
            javascript: 0.8,
            interactions: 0.6
        };
        
        for (const [category, evidence] of Object.entries(results.evidence)) {
            for (const item of evidence) {
                totalScore += (item.confidence || 0.5) * (weights[category] || 0.5);
                evidenceCount++;
            }
        }
        
        if (evidenceCount > 0) {
            results.confidence = Math.min(totalScore / evidenceCount, 1.0);
            results.aiDetected = results.confidence > 0.3;
        }
        
        results.summary.totalEvidence = evidenceCount;
        results.summary.networkEvidence = results.evidence.network.length;
        results.summary.domEvidence = results.evidence.dom.length;
        results.summary.jsEvidence = results.evidence.javascript.length;
        results.summary.interactionEvidence = results.evidence.interactions.length;
    }
    
    /**
     * Categorize detected AI activity
     */
    categorizeActivity(results) {
        const categoryScores = {};
        
        // Initialize category scores
        for (const category of Object.keys(this.aiCategories)) {
            categoryScores[category] = 0;
        }
        
        // Score based on evidence
        for (const evidenceList of Object.values(results.evidence)) {
            for (const evidence of evidenceList) {
                const text = JSON.stringify(evidence).toLowerCase();
                
                for (const [category, keywords] of Object.entries(this.aiCategories)) {
                    for (const keyword of keywords) {
                        if (text.includes(keyword.toLowerCase())) {
                            categoryScores[category] += (evidence.confidence || 0.5);
                        }
                    }
                }
            }
        }
        
        // Select top categories
        results.categories = Object.entries(categoryScores)
            .filter(([_, score]) => score > 0.2)
            .sort(([_, a], [__, b]) => b - a)
            .map(([category, score]) => ({ category, score: Math.min(score, 1.0) }));
    }
    
    /**
     * Generate detailed report
     */
    generateReport(results) {
        const report = {
            site: results.site,
            timestamp: results.timestamp,
            aiDetected: results.aiDetected,
            confidence: Math.round(results.confidence * 100),
            summary: results.summary,
            categories: results.categories,
            topEvidence: this.getTopEvidence(results),
            recommendations: this.generateRecommendations(results)
        };
        
        return report;
    }
    
    getTopEvidence(results) {
        const allEvidence = [];
        
        for (const [type, evidenceList] of Object.entries(results.evidence)) {
            for (const evidence of evidenceList) {
                allEvidence.push({ ...evidence, evidenceType: type });
            }
        }
        
        return allEvidence
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
            .slice(0, 10);
    }
    
    generateRecommendations(results) {
        const recommendations = [];
        
        if (results.aiDetected) {
            recommendations.push('AI activity detected - consider deeper analysis of network traffic');
            
            if (results.evidence.network.length > 0) {
                recommendations.push('Monitor API usage patterns and rate limiting');
            }
            
            if (results.evidence.dom.length > 0) {
                recommendations.push('Analyze client-side AI integration patterns');
            }
            
            if (results.categories.some(cat => cat.category === 'chatbot')) {
                recommendations.push('Investigate chatbot implementation and data handling');
            }
        } else {
            recommendations.push('No significant AI activity detected in current logs');
            recommendations.push('Consider expanding detection patterns or longer crawl duration');
        }
        
        return recommendations;
    }
}

module.exports = { AIActivityDetector };
