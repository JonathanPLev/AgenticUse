// ml_ai_pattern_learner.js
// Machine learning enhancement for adaptive AI pattern recognition

const fs = require('fs');
const path = require('path');

class MLAIPatternLearner {
    constructor() {
        this.trainingData = [];
        this.learnedPatterns = new Map();
        this.confidenceThreshold = 0.6;
        this.patternFrequency = new Map();
        this.falsePositives = new Set();
        this.modelVersion = '1.0.0';
    }
    
    /**
     * Train on detection results to learn new patterns
     */
    trainOnDetectionResults(detectionResults) {
        console.log(`🧠 Training ML model on ${detectionResults.length} detection results...`);
        
        detectionResults.forEach(result => {
            this.extractFeaturesFromResult(result);
        });
        
        this.updatePatternWeights();
        this.generateNewPatterns();
        
        console.log(`✅ Training complete. Learned ${this.learnedPatterns.size} new patterns`);
    }
    
    /**
     * Extract features from detection result
     */
    extractFeaturesFromResult(result) {
        const features = {
            site: result.site,
            confidence: result.confidence,
            categories: result.categories || [],
            evidence: result.evidence || [],
            timestamp: new Date().toISOString()
        };
        
        // Extract URL patterns
        if (result.evidence) {
            result.evidence.forEach(item => {
                if (item.type === 'network_request' && item.url) {
                    this.learnURLPattern(item.url, result.confidence);
                }
                
                if (item.type === 'dom_content' && item.content) {
                    this.learnContentPattern(item.content, result.confidence);
                }
                
                if (item.type === 'function_call' && item.function) {
                    this.learnFunctionPattern(item.function, result.confidence);
                }
            });
        }
        
        this.trainingData.push(features);
    }
    
    /**
     * Learn URL patterns from successful detections
     */
    learnURLPattern(url, confidence) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            const path = urlObj.pathname;
            const params = urlObj.searchParams;
            
            // Learn domain patterns
            if (confidence > this.confidenceThreshold) {
                this.incrementPatternFrequency('domain', domain, confidence);
                
                // Learn subdomain patterns
                const subdomains = domain.split('.');
                if (subdomains.length > 2) {
                    const subdomain = subdomains[0];
                    if (subdomain.includes('api') || subdomain.includes('ai')) {
                        this.incrementPatternFrequency('subdomain', subdomain, confidence);
                    }
                }
                
                // Learn path patterns
                const pathSegments = path.split('/').filter(s => s.length > 0);
                pathSegments.forEach(segment => {
                    if (this.isAIRelatedSegment(segment)) {
                        this.incrementPatternFrequency('path_segment', segment, confidence);
                    }
                });
                
                // Learn parameter patterns
                for (const [key, value] of params.entries()) {
                    if (this.isAIRelatedParam(key, value)) {
                        this.incrementPatternFrequency('url_param', `${key}=${value}`, confidence);
                    }
                }
            }
        } catch (error) {
            // Invalid URL, skip
        }
    }
    
    /**
     * Learn content patterns from DOM analysis
     */
    learnContentPattern(content, confidence) {
        if (confidence < this.confidenceThreshold) return;
        
        // Extract potential AI-related terms
        const aiTerms = this.extractAITerms(content);
        aiTerms.forEach(term => {
            this.incrementPatternFrequency('content_term', term.toLowerCase(), confidence);
        });
        
        // Learn JavaScript patterns
        const jsPatterns = this.extractJSPatterns(content);
        jsPatterns.forEach(pattern => {
            this.incrementPatternFrequency('js_pattern', pattern, confidence);
        });
    }
    
    /**
     * Learn function call patterns
     */
    learnFunctionPattern(functionCall, confidence) {
        if (confidence < this.confidenceThreshold) return;
        
        // Extract function name and parameters
        const funcMatch = functionCall.match(/(\w+(?:\.\w+)*)\s*\(/);
        if (funcMatch) {
            const funcName = funcMatch[1];
            this.incrementPatternFrequency('function_name', funcName, confidence);
            
            // Learn method chains
            if (funcName.includes('.')) {
                const parts = funcName.split('.');
                for (let i = 0; i < parts.length - 1; i++) {
                    const chain = parts.slice(0, i + 2).join('.');
                    this.incrementPatternFrequency('method_chain', chain, confidence);
                }
            }
        }
    }
    
    /**
     * Increment pattern frequency with weighted confidence
     */
    incrementPatternFrequency(type, pattern, confidence) {
        const key = `${type}:${pattern}`;
        const current = this.patternFrequency.get(key) || { count: 0, totalConfidence: 0 };
        
        current.count++;
        current.totalConfidence += confidence;
        current.avgConfidence = current.totalConfidence / current.count;
        
        this.patternFrequency.set(key, current);
    }
    
    /**
     * Check if URL segment is AI-related
     */
    isAIRelatedSegment(segment) {
        const aiSegments = [
            'ai', 'api', 'v1', 'chat', 'completions', 'generate', 'inference',
            'models', 'embeddings', 'assistant', 'bot', 'gpt', 'llm'
        ];
        
        return aiSegments.some(ai => segment.toLowerCase().includes(ai));
    }
    
    /**
     * Check if URL parameter is AI-related
     */
    isAIRelatedParam(key, value) {
        const aiKeys = ['model', 'prompt', 'temperature', 'max_tokens', 'stream'];
        const aiValues = ['gpt', 'claude', 'llama', 'palm', 'true', 'false'];
        
        return aiKeys.includes(key.toLowerCase()) || 
               aiValues.some(ai => value.toLowerCase().includes(ai));
    }
    
    /**
     * Extract AI-related terms from content
     */
    extractAITerms(content) {
        const aiTermRegex = /\b(?:AI|artificial intelligence|machine learning|ML|neural network|deep learning|GPT|Claude|LLaMA|BERT|transformer|chatbot|assistant|completion|generation|inference|embedding|vector|token|prompt|model)\b/gi;
        
        const matches = content.match(aiTermRegex) || [];
        return [...new Set(matches)]; // Remove duplicates
    }
    
    /**
     * Extract JavaScript patterns from content
     */
    extractJSPatterns(content) {
        const patterns = [];
        
        // API call patterns
        const apiCalls = content.match(/(?:fetch|axios|request)\s*\(\s*['"`]([^'"`]+)['"`]/g) || [];
        apiCalls.forEach(call => {
            const urlMatch = call.match(/['"`]([^'"`]+)['"`]/);
            if (urlMatch && this.containsAIIndicators(urlMatch[1])) {
                patterns.push(`api_call:${urlMatch[1]}`);
            }
        });
        
        // Object method calls
        const methodCalls = content.match(/\w+\.\w+\s*\([^)]*\)/g) || [];
        methodCalls.forEach(call => {
            if (this.containsAIIndicators(call)) {
                patterns.push(`method_call:${call}`);
            }
        });
        
        return patterns;
    }
    
    /**
     * Check if text contains AI indicators
     */
    containsAIIndicators(text) {
        const indicators = ['ai', 'gpt', 'claude', 'completion', 'generate', 'chat', 'assistant'];
        return indicators.some(indicator => text.toLowerCase().includes(indicator));
    }
    
    /**
     * Update pattern weights based on frequency and confidence
     */
    updatePatternWeights() {
        for (const [pattern, stats] of this.patternFrequency.entries()) {
            if (stats.count >= 2 && stats.avgConfidence > this.confidenceThreshold) {
                // Calculate pattern weight
                const weight = Math.min(
                    stats.avgConfidence * (1 + Math.log(stats.count) / 10),
                    0.95
                );
                
                this.learnedPatterns.set(pattern, {
                    weight,
                    frequency: stats.count,
                    avgConfidence: stats.avgConfidence,
                    learnedAt: new Date().toISOString()
                });
            }
        }
    }
    
    /**
     * Generate new detection patterns
     */
    generateNewPatterns() {
        const newPatterns = {
            domains: [],
            urlPatterns: [],
            contentPatterns: [],
            functionPatterns: []
        };
        
        for (const [pattern, stats] of this.learnedPatterns.entries()) {
            const [type, value] = pattern.split(':', 2);
            
            switch (type) {
                case 'domain':
                    if (stats.frequency >= 3) {
                        newPatterns.domains.push(value);
                    }
                    break;
                    
                case 'path_segment':
                    if (stats.frequency >= 2) {
                        newPatterns.urlPatterns.push(`/${value}/`);
                    }
                    break;
                    
                case 'content_term':
                    if (stats.frequency >= 3) {
                        newPatterns.contentPatterns.push(value);
                    }
                    break;
                    
                case 'function_name':
                    if (stats.frequency >= 2) {
                        newPatterns.functionPatterns.push(value);
                    }
                    break;
            }
        }
        
        return newPatterns;
    }
    
    /**
     * Predict AI probability for new detection
     */
    predictAIProbability(features) {
        let score = 0;
        let matchCount = 0;
        
        // Check learned patterns
        for (const [pattern, stats] of this.learnedPatterns.entries()) {
            if (this.featureMatchesPattern(features, pattern)) {
                score += stats.weight;
                matchCount++;
            }
        }
        
        // Normalize score
        const probability = matchCount > 0 ? Math.min(score / matchCount, 1.0) : 0;
        
        return {
            probability,
            matchedPatterns: matchCount,
            confidence: probability > 0.7 ? 'high' : probability > 0.4 ? 'medium' : 'low'
        };
    }
    
    /**
     * Check if features match a learned pattern
     */
    featureMatchesPattern(features, pattern) {
        const [type, value] = pattern.split(':', 2);
        
        switch (type) {
            case 'domain':
                return features.url && features.url.includes(value);
            case 'content_term':
                return features.content && features.content.toLowerCase().includes(value);
            case 'function_name':
                return features.functions && features.functions.some(f => f.includes(value));
            default:
                return false;
        }
    }
    
    /**
     * Mark false positive to improve accuracy
     */
    markFalsePositive(detectionId, reason) {
        this.falsePositives.add(detectionId);
        console.log(`❌ Marked false positive: ${detectionId} (${reason})`);
        
        // Adjust pattern weights for false positives
        this.adjustPatternsForFalsePositive(detectionId);
    }
    
    /**
     * Adjust pattern weights based on false positive feedback
     */
    adjustPatternsForFalsePositive(detectionId) {
        // Reduce weights of patterns that contributed to false positive
        for (const [pattern, stats] of this.learnedPatterns.entries()) {
            if (stats.weight > 0.1) {
                stats.weight *= 0.9; // Reduce weight by 10%
            }
        }
    }
    
    /**
     * Export learned model
     */
    exportModel(filePath) {
        const model = {
            version: this.modelVersion,
            timestamp: new Date().toISOString(),
            learnedPatterns: Object.fromEntries(this.learnedPatterns),
            patternFrequency: Object.fromEntries(this.patternFrequency),
            trainingDataCount: this.trainingData.length,
            falsePositiveCount: this.falsePositives.size,
            generatedPatterns: this.generateNewPatterns()
        };
        
        fs.writeFileSync(filePath, JSON.stringify(model, null, 2));
        console.log(`🤖 ML model exported to: ${filePath}`);
        
        return model;
    }
    
    /**
     * Load previously trained model
     */
    loadModel(filePath) {
        if (fs.existsSync(filePath)) {
            const model = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            this.learnedPatterns = new Map(Object.entries(model.learnedPatterns || {}));
            this.patternFrequency = new Map(Object.entries(model.patternFrequency || {}));
            this.modelVersion = model.version || '1.0.0';
            
            console.log(`📚 Loaded ML model from: ${filePath}`);
            console.log(`   Patterns: ${this.learnedPatterns.size}`);
            console.log(`   Training data: ${model.trainingDataCount || 0}`);
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Get model statistics
     */
    getModelStats() {
        return {
            version: this.modelVersion,
            learnedPatterns: this.learnedPatterns.size,
            trainingDataPoints: this.trainingData.length,
            falsePositives: this.falsePositives.size,
            patternTypes: this.getPatternTypeDistribution(),
            accuracy: this.calculateAccuracy()
        };
    }
    
    /**
     * Get distribution of pattern types
     */
    getPatternTypeDistribution() {
        const distribution = {};
        
        for (const pattern of this.learnedPatterns.keys()) {
            const type = pattern.split(':', 1)[0];
            distribution[type] = (distribution[type] || 0) + 1;
        }
        
        return distribution;
    }
    
    /**
     * Calculate model accuracy estimate
     */
    calculateAccuracy() {
        const totalDetections = this.trainingData.length;
        const falsePositives = this.falsePositives.size;
        
        if (totalDetections === 0) return 0;
        
        return Math.max(0, (totalDetections - falsePositives) / totalDetections);
    }
}

module.exports = { MLAIPatternLearner };
