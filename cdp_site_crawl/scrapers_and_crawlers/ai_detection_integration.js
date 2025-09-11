// ai_detection_integration.js
// Integration module to embed AI detection directly into the CDP crawler

const { AIActivityDetector } = require('./ai_activity_detector');

class CrawlerAIIntegration {
    constructor() {
        this.detector = new AIActivityDetector();
        this.realTimeDetections = new Map();
        this.alertThreshold = 0.7; // Alert for high-confidence detections
    }
    
    /**
     * Real-time detection during crawling
     */
    async processNetworkEvent(event, siteUrl) {
        if (event.event === 'requestWillBeSent' && event.request) {
            const url = event.request.url;
            const headers = event.request.headers || {};
            
            // Quick AI domain check
            const aiDomain = this.detector.checkAIDomains(url);
            if (aiDomain) {
                this.recordDetection(siteUrl, {
                    type: 'ai_request',
                    url: url,
                    domain: aiDomain,
                    timestamp: event.timestamp,
                    confidence: 0.9
                });
                
                console.log(`🤖 AI API detected: ${aiDomain} on ${siteUrl}`);
                return true;
            }
            
            // Check for AI patterns in URL
            const pattern = this.detector.checkAIPatterns(url, 'endpoints');
            if (pattern) {
                this.recordDetection(siteUrl, {
                    type: 'ai_pattern',
                    url: url,
                    pattern: pattern,
                    timestamp: event.timestamp,
                    confidence: 0.8
                });
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Process response events for AI indicators
     */
    async processResponseEvent(event, siteUrl) {
        if (event.event === 'responseReceived' && event.response) {
            const response = event.response;
            const url = response.url;
            
            // Check if this is an AI service response
            const aiDomain = this.detector.checkAIDomains(url);
            if (aiDomain && response.status === 200) {
                this.recordDetection(siteUrl, {
                    type: 'ai_response',
                    url: url,
                    domain: aiDomain,
                    status: response.status,
                    mimeType: response.mimeType,
                    timestamp: event.timestamp,
                    confidence: 0.95
                });
                
                console.log(`🎯 AI Response received: ${response.status} from ${aiDomain}`);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Analyze DOM content for AI indicators
     */
    async analyzeDOMContent(html, frameUrl, siteUrl) {
        const contentMatches = this.detector.checkAIContent(html);
        const functionMatches = this.detector.checkAIFunctions(html);
        
        if (contentMatches.length > 0 || functionMatches.length > 0) {
            this.recordDetection(siteUrl, {
                type: 'ai_content',
                frameUrl: frameUrl,
                contentMatches: contentMatches,
                functionMatches: functionMatches,
                confidence: Math.min(0.5 + (contentMatches.length * 0.1), 0.9)
            });
            
            if (contentMatches.length > 5) {
                console.log(`📄 High AI content density detected on ${siteUrl}`);
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Record detection for site
     */
    recordDetection(siteUrl, detection) {
        if (!this.realTimeDetections.has(siteUrl)) {
            this.realTimeDetections.set(siteUrl, []);
        }
        
        this.realTimeDetections.get(siteUrl).push({
            ...detection,
            detectedAt: new Date().toISOString()
        });
        
        // Check if we should alert
        if (detection.confidence >= this.alertThreshold) {
            this.triggerAlert(siteUrl, detection);
        }
    }
    
    /**
     * Trigger alert for high-confidence detection
     */
    triggerAlert(siteUrl, detection) {
        console.log(`🚨 HIGH CONFIDENCE AI DETECTION:`);
        console.log(`   Site: ${siteUrl}`);
        console.log(`   Type: ${detection.type}`);
        console.log(`   Confidence: ${Math.round(detection.confidence * 100)}%`);
        console.log(`   Details: ${detection.url || detection.domain || detection.pattern || 'N/A'}`);
    }
    
    /**
     * Get real-time detection summary for site
     */
    getSiteDetectionSummary(siteUrl) {
        const detections = this.realTimeDetections.get(siteUrl) || [];
        
        if (detections.length === 0) {
            return { aiDetected: false, confidence: 0, detections: [] };
        }
        
        const avgConfidence = detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length;
        const categories = this.categorizeDetections(detections);
        
        return {
            aiDetected: avgConfidence > 0.3,
            confidence: Math.round(avgConfidence * 100),
            detectionCount: detections.length,
            categories: categories,
            detections: detections.slice(-5) // Last 5 detections
        };
    }
    
    /**
     * Categorize detections
     */
    categorizeDetections(detections) {
        const categories = new Set();
        
        detections.forEach(detection => {
            const text = JSON.stringify(detection).toLowerCase();
            
            if (text.includes('chat') || text.includes('bot')) categories.add('chatbot');
            if (text.includes('completion') || text.includes('generate')) categories.add('text_generation');
            if (text.includes('image') || text.includes('dall-e')) categories.add('image_generation');
            if (text.includes('speech') || text.includes('audio')) categories.add('speech_processing');
            if (text.includes('api') || text.includes('sdk')) categories.add('api_integration');
            if (text.includes('embed') || text.includes('vector')) categories.add('embedding');
        });
        
        return Array.from(categories);
    }
    
    /**
     * Generate real-time report
     */
    generateRealTimeReport() {
        const report = {
            timestamp: new Date().toISOString(),
            totalSites: this.realTimeDetections.size,
            sitesWithAI: 0,
            totalDetections: 0,
            sites: {}
        };
        
        for (const [siteUrl, detections] of this.realTimeDetections.entries()) {
            const summary = this.getSiteDetectionSummary(siteUrl);
            report.sites[siteUrl] = summary;
            
            if (summary.aiDetected) {
                report.sitesWithAI++;
            }
            
            report.totalDetections += detections.length;
        }
        
        return report;
    }
    
    /**
     * Clear detections for site (when crawl completes)
     */
    clearSiteDetections(siteUrl) {
        this.realTimeDetections.delete(siteUrl);
    }
    
    /**
     * Export detections to JSON file
     */
    exportDetections(filePath) {
        const fs = require('fs');
        const report = this.generateRealTimeReport();
        fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
        console.log(`Real-time detections exported to: ${filePath}`);
    }
}

/**
 * Integration hooks for the CDP crawler
 */
class CrawlerHooks {
    constructor(aiIntegration) {
        this.ai = aiIntegration;
    }
    
    /**
     * Hook into network request monitoring
     */
    onNetworkRequest(event, siteUrl) {
        return this.ai.processNetworkEvent(event, siteUrl);
    }
    
    /**
     * Hook into network response monitoring
     */
    onNetworkResponse(event, siteUrl) {
        return this.ai.processResponseEvent(event, siteUrl);
    }
    
    /**
     * Hook into DOM content analysis
     */
    onDOMContent(html, frameUrl, siteUrl) {
        return this.ai.analyzeDOMContent(html, frameUrl, siteUrl);
    }
    
    /**
     * Hook into site crawl completion
     */
    onSiteComplete(siteUrl) {
        const summary = this.ai.getSiteDetectionSummary(siteUrl);
        
        if (summary.aiDetected) {
            console.log(`\n✅ Site crawl complete: ${siteUrl}`);
            console.log(`   AI Detected: YES (${summary.confidence}% confidence)`);
            console.log(`   Categories: ${summary.categories.join(', ')}`);
            console.log(`   Detections: ${summary.detectionCount}`);
        }
        
        return summary;
    }
    
    /**
     * Hook into crawler shutdown
     */
    onCrawlerShutdown() {
        const report = this.ai.generateRealTimeReport();
        console.log(`\n📊 CRAWLER SESSION SUMMARY:`);
        console.log(`   Total Sites: ${report.totalSites}`);
        console.log(`   Sites with AI: ${report.sitesWithAI}`);
        console.log(`   Total Detections: ${report.totalDetections}`);
        
        // Export final report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.ai.exportDetections(`ai_detections_${timestamp}.json`);
        
        return report;
    }
}

module.exports = { CrawlerAIIntegration, CrawlerHooks };
