// offline_ai_runner.js
// Runner for offline AI detection with enhanced data storage and quantification

const { OfflineAIDetector } = require('./offline_ai_detector');
const { AIDetectionDatabase } = require('./ai_detection_database');
const fs = require('fs');
const path = require('path');

class OfflineAIRunner {
    constructor(options = {}) {
        this.detector = new OfflineAIDetector();
        this.database = options.enableDatabase ? new AIDetectionDatabase(options.dbPath) : null;
        this.outputDir = options.outputDir || './ai_detection_results';
        this.sessionId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }
    
    /**
     * Run offline detection on all crawled sites
     */
    async runDetection(dataDir = './cdp_site_crawl/data') {
        console.log(`🔍 Starting offline AI detection analysis...`);
        console.log(`   Data directory: ${dataDir}`);
        console.log(`   Session ID: ${this.sessionId}`);
        
        if (!fs.existsSync(dataDir)) {
            throw new Error(`Data directory not found: ${dataDir}`);
        }
        
        // Initialize session
        if (this.database) {
            await this.database.createCrawlSession(this.sessionId, '2.0.0-offline');
        }
        
        const siteDirs = fs.readdirSync(dataDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        console.log(`   Found ${siteDirs.length} sites to analyze`);
        
        const results = [];
        let sitesWithAI = 0;
        let totalDetections = 0;
        
        for (let i = 0; i < siteDirs.length; i++) {
            const siteDir = siteDirs[i];
            const sitePath = path.join(dataDir, siteDir);
            
            console.log(`\n[${i + 1}/${siteDirs.length}] Analyzing: ${siteDir}`);
            
            try {
                const result = await this.detector.analyzeLogFiles(sitePath);
                results.push(result);
                
                if (result.aiDetected) {
                    sitesWithAI++;
                    console.log(`   ✅ AI DETECTED - Score: ${result.aiUsageScore}, Confidence: ${result.confidence}%`);
                    console.log(`   📊 Categories: ${result.categories.join(', ')}`);
                    console.log(`   🔍 Evidence: ${result.totalEvidence} items`);
                    
                    if (result.falsePositiveRisk > 50) {
                        console.log(`   ⚠️  HIGH FALSE POSITIVE RISK: ${result.falsePositiveRisk}%`);
                    }
                } else {
                    console.log(`   ❌ No AI detected`);
                }
                
                totalDetections += result.totalEvidence;
                
                // Store in database
                if (this.database) {
                    await this.database.storeDetection(result, this.sessionId);
                }
                
            } catch (error) {
                console.error(`   ❌ Error analyzing ${siteDir}: ${error.message}`);
                results.push({
                    site: siteDir,
                    error: error.message,
                    aiDetected: false,
                    confidence: 0
                });
            }
        }
        
        // Generate comprehensive report
        const report = await this.generateComprehensiveReport(results, {
            totalSites: siteDirs.length,
            sitesWithAI,
            totalDetections
        });
        
        // Update session
        if (this.database) {
            await this.database.updateCrawlSession(this.sessionId, {
                totalSites: siteDirs.length,
                sitesWithAI,
                totalDetections
            });
        }
        
        console.log(`\n📊 OFFLINE DETECTION COMPLETE`);
        console.log(`   Total Sites: ${siteDirs.length}`);
        console.log(`   Sites with AI: ${sitesWithAI} (${((sitesWithAI/siteDirs.length)*100).toFixed(1)}%)`);
        console.log(`   Total Evidence: ${totalDetections}`);
        console.log(`   Average AI Usage Score: ${report.averageUsageScore.toFixed(1)}`);
        
        return report;
    }
    
    /**
     * Generate comprehensive report with detailed analysis
     */
    async generateComprehensiveReport(results, stats) {
        const aiSites = results.filter(r => r.aiDetected);
        const noAiSites = results.filter(r => !r.aiDetected && !r.error);
        
        const report = {
            metadata: {
                sessionId: this.sessionId,
                timestamp: new Date().toISOString(),
                totalSites: stats.totalSites,
                sitesWithAI: stats.sitesWithAI,
                sitesWithoutAI: noAiSites.length,
                errorSites: results.filter(r => r.error).length,
                detectionRate: ((stats.sitesWithAI / stats.totalSites) * 100).toFixed(1)
            },
            
            quantificationMetrics: {
                averageUsageScore: aiSites.length > 0 ? 
                    aiSites.reduce((sum, site) => sum + site.aiUsageScore, 0) / aiSites.length : 0,
                averageConfidence: aiSites.length > 0 ?
                    aiSites.reduce((sum, site) => sum + site.confidence, 0) / aiSites.length : 0,
                totalApiCalls: aiSites.reduce((sum, site) => 
                    sum + site.quantificationMetrics.apiCallCount, 0),
                totalUniqueAIDomains: new Set(
                    aiSites.flatMap(site => site.quantificationMetrics.uniqueAIDomains)
                ).size,
                totalFunctionCalls: aiSites.reduce((sum, site) => 
                    sum + site.quantificationMetrics.functionCallCount, 0),
                totalStreamingIndicators: aiSites.reduce((sum, site) => 
                    sum + site.quantificationMetrics.streamingIndicators, 0)
            },
            
            falsePositiveAnalysis: {
                highRiskSites: aiSites.filter(site => site.falsePositiveRisk > 50).length,
                averageRisk: aiSites.length > 0 ?
                    aiSites.reduce((sum, site) => sum + site.falsePositiveRisk, 0) / aiSites.length : 0,
                contextBreakdown: {
                    newsContext: aiSites.filter(site => site.contextAnalysis.newsContext).length,
                    educationalContext: aiSites.filter(site => site.contextAnalysis.educationalContext).length,
                    marketingContext: aiSites.filter(site => site.contextAnalysis.marketingContext).length,
                    realUsageContext: aiSites.filter(site => site.contextAnalysis.realUsageContext).length
                }
            },
            
            categoryDistribution: this.calculateCategoryDistribution(aiSites),
            
            topAISites: aiSites
                .sort((a, b) => b.aiUsageScore - a.aiUsageScore)
                .slice(0, 10)
                .map(site => ({
                    site: site.site,
                    aiUsageScore: site.aiUsageScore,
                    confidence: site.confidence,
                    categories: site.categories,
                    evidenceCount: site.totalEvidence,
                    falsePositiveRisk: site.falsePositiveRisk
                })),
            
            detailedResults: results,
            
            recommendations: this.generateRecommendations(results, stats)
        };
        
        // Save detailed JSON report
        const jsonPath = path.join(this.outputDir, `detailed_results_${this.sessionId}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
        
        // Save human-readable summary
        const summaryPath = path.join(this.outputDir, `summary_${this.sessionId}.md`);
        fs.writeFileSync(summaryPath, this.generateMarkdownSummary(report));
        
        // Save high-risk sites for manual review
        const highRiskSites = aiSites.filter(site => site.falsePositiveRisk > 50);
        if (highRiskSites.length > 0) {
            const reviewPath = path.join(this.outputDir, `manual_review_required_${this.sessionId}.json`);
            fs.writeFileSync(reviewPath, JSON.stringify({
                message: "These sites have high false positive risk and should be manually reviewed",
                sites: highRiskSites.map(site => ({
                    site: site.site,
                    falsePositiveRisk: site.falsePositiveRisk,
                    contextAnalysis: site.contextAnalysis,
                    topEvidence: site.detailedEvidence.slice(0, 5)
                }))
            }, null, 2));
            
            console.log(`\n⚠️  ${highRiskSites.length} sites require manual review (high false positive risk)`);
            console.log(`   Review file: ${reviewPath}`);
        }
        
        console.log(`\n📄 Reports generated:`);
        console.log(`   Detailed JSON: ${jsonPath}`);
        console.log(`   Summary: ${summaryPath}`);
        
        return report;
    }
    
    /**
     * Calculate category distribution
     */
    calculateCategoryDistribution(aiSites) {
        const distribution = {};
        
        aiSites.forEach(site => {
            site.categories.forEach(category => {
                distribution[category] = (distribution[category] || 0) + 1;
            });
        });
        
        return distribution;
    }
    
    /**
     * Generate recommendations based on analysis
     */
    generateRecommendations(results, stats) {
        const recommendations = [];
        const aiSites = results.filter(r => r.aiDetected);
        
        // Detection rate recommendations
        if (stats.sitesWithAI / stats.totalSites < 0.1) {
            recommendations.push({
                type: 'detection_coverage',
                priority: 'medium',
                message: 'Low AI detection rate suggests either limited AI adoption or need for enhanced detection patterns'
            });
        }
        
        // False positive recommendations
        const highRiskCount = aiSites.filter(site => site.falsePositiveRisk > 50).length;
        if (highRiskCount > 0) {
            recommendations.push({
                type: 'false_positive_risk',
                priority: 'high',
                message: `${highRiskCount} sites have high false positive risk and require manual review`
            });
        }
        
        // Usage score recommendations
        const avgUsageScore = aiSites.length > 0 ? 
            aiSites.reduce((sum, site) => sum + site.aiUsageScore, 0) / aiSites.length : 0;
        
        if (avgUsageScore < 20) {
            recommendations.push({
                type: 'usage_intensity',
                priority: 'low',
                message: 'Low average AI usage scores suggest limited AI integration depth'
            });
        }
        
        // Context analysis recommendations
        const newsContextCount = aiSites.filter(site => site.contextAnalysis.newsContext).length;
        if (newsContextCount > aiSites.length * 0.3) {
            recommendations.push({
                type: 'context_filtering',
                priority: 'medium',
                message: 'High proportion of news context detections - consider enhancing false positive filtering'
            });
        }
        
        return recommendations;
    }
    
    /**
     * Generate markdown summary report
     */
    generateMarkdownSummary(report) {
        const md = `# AI Detection Analysis Summary

## Overview
- **Session ID**: ${report.metadata.sessionId}
- **Analysis Date**: ${new Date(report.metadata.timestamp).toLocaleString()}
- **Total Sites Analyzed**: ${report.metadata.totalSites}
- **Sites with AI**: ${report.metadata.sitesWithAI} (${report.metadata.detectionRate}%)
- **Sites without AI**: ${report.metadata.sitesWithoutAI}

## AI Usage Quantification
- **Average AI Usage Score**: ${report.quantificationMetrics.averageUsageScore.toFixed(1)}/100
- **Average Confidence**: ${report.quantificationMetrics.averageConfidence.toFixed(1)}%
- **Total API Calls Detected**: ${report.quantificationMetrics.totalApiCalls}
- **Unique AI Domains**: ${report.quantificationMetrics.totalUniqueAIDomains}
- **Function Calls**: ${report.quantificationMetrics.totalFunctionCalls}
- **Streaming Indicators**: ${report.quantificationMetrics.totalStreamingIndicators}

## False Positive Analysis
- **High Risk Sites**: ${report.falsePositiveAnalysis.highRiskSites}
- **Average False Positive Risk**: ${report.falsePositiveAnalysis.averageRisk.toFixed(1)}%

### Context Breakdown
- **News Context**: ${report.falsePositiveAnalysis.contextBreakdown.newsContext} sites
- **Educational Context**: ${report.falsePositiveAnalysis.contextBreakdown.educationalContext} sites
- **Marketing Context**: ${report.falsePositiveAnalysis.contextBreakdown.marketingContext} sites
- **Real Usage Context**: ${report.falsePositiveAnalysis.contextBreakdown.realUsageContext} sites

## Top AI Sites by Usage Score

${report.topAISites.map((site, i) => 
`${i + 1}. **${site.site}**
   - AI Usage Score: ${site.aiUsageScore}/100
   - Confidence: ${site.confidence}%
   - Categories: ${site.categories.join(', ')}
   - Evidence Items: ${site.evidenceCount}
   - False Positive Risk: ${site.falsePositiveRisk}%`
).join('\n\n')}

## Category Distribution
${Object.entries(report.categoryDistribution).map(([category, count]) => 
`- **${category}**: ${count} sites`).join('\n')}

## Recommendations
${report.recommendations.map(rec => 
`- **${rec.type}** (${rec.priority} priority): ${rec.message}`).join('\n')}

---
*Generated by Offline AI Detection System v2.0*
`;
        
        return md;
    }
    
    /**
     * Get sites requiring manual review
     */
    async getSitesForManualReview(minRisk = 50) {
        // This would typically query the database
        // For now, return structure for manual review
        return {
            criteria: {
                falsePositiveRisk: `>= ${minRisk}%`,
                contextFlags: ['newsContext', 'educationalContext']
            },
            reviewGuidelines: {
                checkFor: [
                    'Actual API calls vs content mentions',
                    'Technical implementation vs news articles',
                    'Authentication headers and tokens',
                    'JavaScript function calls and imports',
                    'Response patterns from AI services'
                ],
                confidenceAdjustment: {
                    realUsage: 'Increase confidence by 30%',
                    newsArticle: 'Decrease confidence by 60%',
                    educational: 'Decrease confidence by 40%'
                }
            }
        };
    }
    
    /**
     * Export results for external analysis
     */
    async exportResults(format = 'json') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        if (this.database) {
            const exportPath = path.join(this.outputDir, `database_export_${timestamp}.json`);
            await this.database.exportToJSON(exportPath);
            console.log(`📤 Database exported to: ${exportPath}`);
        }
        
        return {
            exportPath: this.outputDir,
            files: fs.readdirSync(this.outputDir)
        };
    }
    
    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.database) {
            this.database.close();
        }
    }
}

// CLI execution
if (require.main === module) {
    const runner = new OfflineAIRunner({
        enableDatabase: true,
        outputDir: './ai_detection_results'
    });
    
    runner.runDetection()
        .then(report => {
            console.log('\n✅ Analysis complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Analysis failed:', error.message);
            process.exit(1);
        });
}

module.exports = { OfflineAIRunner };
