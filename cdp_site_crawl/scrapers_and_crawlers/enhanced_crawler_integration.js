// enhanced_crawler_integration.js
// Complete integration of AI detection system with CDP crawler

const { CrawlerAIIntegration, CrawlerHooks } = require('./ai_detection_integration');
const { StreamingAIDetector } = require('./streaming_ai_detector');
const { MLAIPatternLearner } = require('./ml_ai_pattern_learner');
const { AIDetectionDatabase } = require('./ai_detection_database');

class EnhancedCrawlerAISystem {
    constructor(options = {}) {
        this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Initialize core components
        this.aiIntegration = new CrawlerAIIntegration();
        this.streamingDetector = new StreamingAIDetector();
        this.mlLearner = new MLAIPatternLearner();
        this.database = new AIDetectionDatabase(options.dbPath);
        
        // Initialize hooks
        this.hooks = new CrawlerHooks(this.aiIntegration);
        
        // Configuration
        this.config = {
            enableRealTimeDetection: options.enableRealTime !== false,
            enableStreamingDetection: options.enableStreaming !== false,
            enableMLLearning: options.enableML !== false,
            enableDatabase: options.enableDatabase !== false,
            alertThreshold: options.alertThreshold || 0.7,
            ...options
        };
        
        this.setupEventHandlers();
        this.initializeSession();
    }
    
    /**
     * Setup event handlers for cross-component communication
     */
    setupEventHandlers() {
        // Streaming detection events
        this.streamingDetector.on('aiDetected', (detection) => {
            this.handleStreamingDetection(detection);
        });
        
        this.streamingDetector.on('streamComplete', (streamData) => {
            this.handleStreamComplete(streamData);
        });
        
        // Real-time alerts
        this.aiIntegration.on('highConfidenceDetection', (detection) => {
            this.handleHighConfidenceAlert(detection);
        });
    }
    
    /**
     * Initialize crawl session
     */
    async initializeSession() {
        if (this.config.enableDatabase) {
            await this.database.createCrawlSession(this.sessionId, '2.0.0');
        }
        
        // Load existing ML model if available
        if (this.config.enableMLLearning) {
            this.mlLearner.loadModel('./ai_detection_model.json');
        }
        
        console.log(`🚀 Enhanced AI Detection System initialized (Session: ${this.sessionId})`);
    }
    
    /**
     * Process network event with full AI detection pipeline
     */
    async processNetworkEvent(event, siteUrl) {
        const detections = [];
        
        // Real-time detection
        if (this.config.enableRealTimeDetection) {
            const detected = await this.hooks.onNetworkRequest(event, siteUrl);
            if (detected) {
                detections.push({ type: 'network', confidence: 0.8 });
            }
        }
        
        // Streaming detection for SSE/WebSocket
        if (this.config.enableStreamingDetection && event.response) {
            const streamId = this.streamingDetector.monitorHTTPResponse(
                event.response, siteUrl, event.request?.url
            );
            if (streamId) {
                detections.push({ type: 'streaming', streamId });
            }
        }
        
        return detections;
    }
    
    /**
     * Process response event with enhanced analysis
     */
    async processResponseEvent(event, siteUrl) {
        const detections = [];
        
        // Standard response detection
        const detected = await this.hooks.onNetworkResponse(event, siteUrl);
        if (detected) {
            detections.push({ type: 'response', confidence: 0.9 });
        }
        
        // ML-enhanced prediction
        if (this.config.enableMLLearning && event.response) {
            const features = this.extractResponseFeatures(event.response);
            const prediction = this.mlLearner.predictAIProbability(features);
            
            if (prediction.probability > 0.6) {
                detections.push({ 
                    type: 'ml_prediction', 
                    confidence: prediction.probability,
                    matchedPatterns: prediction.matchedPatterns
                });
            }
        }
        
        return detections;
    }
    
    /**
     * Process DOM content with comprehensive analysis
     */
    async processDOMContent(html, frameUrl, siteUrl) {
        const detections = [];
        
        // Standard DOM analysis
        const detected = await this.hooks.onDOMContent(html, frameUrl, siteUrl);
        if (detected) {
            detections.push({ type: 'dom_content', confidence: 0.7 });
        }
        
        // ML-enhanced content analysis
        if (this.config.enableMLLearning) {
            const features = this.extractContentFeatures(html);
            const prediction = this.mlLearner.predictAIProbability(features);
            
            if (prediction.probability > 0.5) {
                detections.push({ 
                    type: 'ml_content', 
                    confidence: prediction.probability 
                });
            }
        }
        
        return detections;
    }
    
    /**
     * Handle streaming detection event
     */
    async handleStreamingDetection(detection) {
        console.log(`🔴 STREAMING AI DETECTED: ${detection.pattern} on ${detection.siteUrl}`);
        
        if (this.config.enableDatabase) {
            await this.database.storeStreamingDetection(detection);
        }
        
        // Trigger alert if high confidence
        if (detection.confidence >= this.config.alertThreshold) {
            this.triggerRealTimeAlert('streaming', detection);
        }
    }
    
    /**
     * Handle stream completion
     */
    async handleStreamComplete(streamData) {
        if (streamData.aiDetected && this.config.enableDatabase) {
            await this.database.storeStreamingDetection({
                ...streamData,
                confidence: 0.8
            });
        }
    }
    
    /**
     * Handle high confidence detection alert
     */
    handleHighConfidenceAlert(detection) {
        this.triggerRealTimeAlert('high_confidence', detection);
    }
    
    /**
     * Trigger real-time alert
     */
    triggerRealTimeAlert(alertType, detection) {
        const alert = {
            type: alertType,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            ...detection
        };
        
        console.log(`🚨 REAL-TIME ALERT: ${JSON.stringify(alert, null, 2)}`);
        
        // In production, this could send to monitoring systems, webhooks, etc.
        this.saveAlert(alert);
    }
    
    /**
     * Save alert to file system
     */
    saveAlert(alert) {
        const fs = require('fs');
        const alertsFile = './ai_detection_alerts.jsonl';
        
        fs.appendFileSync(alertsFile, JSON.stringify(alert) + '\n');
    }
    
    /**
     * Complete site analysis
     */
    async completeSiteAnalysis(siteUrl) {
        const summary = this.hooks.onSiteComplete(siteUrl);
        
        // Store in database
        if (this.config.enableDatabase && summary.aiDetected) {
            const detectionResult = {
                site: siteUrl,
                aiDetected: summary.aiDetected,
                confidence: summary.confidence,
                categories: summary.categories,
                evidence: summary.detections
            };
            
            await this.database.storeDetection(detectionResult, this.sessionId);
        }
        
        // Train ML model
        if (this.config.enableMLLearning && summary.aiDetected) {
            this.mlLearner.trainOnDetectionResults([{
                site: siteUrl,
                confidence: summary.confidence,
                categories: summary.categories,
                evidence: summary.detections
            }]);
        }
        
        return summary;
    }
    
    /**
     * Generate comprehensive session report
     */
    async generateSessionReport() {
        const report = this.hooks.onCrawlerShutdown();
        
        // Add enhanced statistics
        if (this.config.enableDatabase) {
            const dbStats = await this.database.getDatabaseStats();
            report.databaseStats = dbStats;
        }
        
        if (this.config.enableMLLearning) {
            const mlStats = this.mlLearner.getModelStats();
            report.mlStats = mlStats;
            
            // Export updated model
            this.mlLearner.exportModel('./ai_detection_model.json');
        }
        
        if (this.config.enableStreamingDetection) {
            const streamingStats = this.streamingDetector.getActiveStreamsSummary();
            report.streamingStats = streamingStats;
        }
        
        // Update session in database
        if (this.config.enableDatabase) {
            await this.database.updateCrawlSession(this.sessionId, {
                totalSites: report.totalSites,
                sitesWithAI: report.sitesWithAI,
                totalDetections: report.totalDetections
            });
        }
        
        console.log(`\n📊 ENHANCED SESSION REPORT:`);
        console.log(`   Session ID: ${this.sessionId}`);
        console.log(`   Total Sites: ${report.totalSites}`);
        console.log(`   AI Sites: ${report.sitesWithAI} (${((report.sitesWithAI/report.totalSites)*100).toFixed(1)}%)`);
        console.log(`   Total Detections: ${report.totalDetections}`);
        
        if (report.mlStats) {
            console.log(`   ML Patterns Learned: ${report.mlStats.learnedPatterns}`);
            console.log(`   Model Accuracy: ${(report.mlStats.accuracy * 100).toFixed(1)}%`);
        }
        
        if (report.streamingStats) {
            console.log(`   Streaming Sessions: ${report.streamingStats.totalStreams}`);
            console.log(`   AI Streams: ${report.streamingStats.aiStreams}`);
        }
        
        return report;
    }
    
    /**
     * Extract features from HTTP response for ML analysis
     */
    extractResponseFeatures(response) {
        return {
            url: response.url,
            status: response.status,
            headers: response.headers,
            mimeType: response.mimeType,
            contentLength: response.headers['content-length'] || 0
        };
    }
    
    /**
     * Extract features from DOM content for ML analysis
     */
    extractContentFeatures(html) {
        return {
            content: html,
            length: html.length,
            functions: this.extractJavaScriptFunctions(html),
            hasAITerms: this.containsAITerms(html)
        };
    }
    
    /**
     * Extract JavaScript functions from HTML
     */
    extractJavaScriptFunctions(html) {
        const functionRegex = /function\s+(\w+)\s*\(/g;
        const functions = [];
        let match;
        
        while ((match = functionRegex.exec(html)) !== null) {
            functions.push(match[1]);
        }
        
        return functions;
    }
    
    /**
     * Check if content contains AI terms
     */
    containsAITerms(content) {
        const aiTerms = ['ai', 'artificial intelligence', 'machine learning', 'gpt', 'claude', 'chatbot'];
        const lowerContent = content.toLowerCase();
        
        return aiTerms.some(term => lowerContent.includes(term));
    }
    
    /**
     * Cleanup and close connections
     */
    async cleanup() {
        if (this.config.enableDatabase) {
            this.database.close();
        }
        
        console.log(`🧹 Enhanced AI Detection System cleanup complete`);
    }
    
    /**
     * Get real-time system status
     */
    getSystemStatus() {
        return {
            sessionId: this.sessionId,
            components: {
                realTimeDetection: this.config.enableRealTimeDetection,
                streamingDetection: this.config.enableStreamingDetection,
                mlLearning: this.config.enableMLLearning,
                database: this.config.enableDatabase
            },
            activeStreams: this.streamingDetector.getActiveStreamsSummary(),
            mlStats: this.config.enableMLLearning ? this.mlLearner.getModelStats() : null
        };
    }
}

module.exports = { EnhancedCrawlerAISystem };
