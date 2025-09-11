// ai_detection_runner.js
// Runner script to analyze all crawled sites for AI activity

const fs = require('fs');
const path = require('path');
const { AIActivityDetector } = require('./ai_activity_detector');

async function analyzeSite(siteDir, detector) {
    console.log(`\n=== Analyzing ${path.basename(siteDir)} ===`);
    
    const results = await detector.detectAIActivity(siteDir);
    const report = detector.generateReport(results);
    
    console.log(`AI Detected: ${report.aiDetected ? 'YES' : 'NO'}`);
    console.log(`Confidence: ${report.confidence}%`);
    
    if (report.aiDetected) {
        console.log(`Categories: ${report.categories.map(c => `${c.category} (${Math.round(c.score * 100)}%)`).join(', ')}`);
        console.log(`Evidence: ${report.summary.totalEvidence} items`);
        
        if (report.topEvidence.length > 0) {
            console.log('\nTop Evidence:');
            report.topEvidence.slice(0, 3).forEach((evidence, i) => {
                console.log(`  ${i + 1}. ${evidence.type}: ${evidence.url || evidence.pattern || evidence.match || 'N/A'}`);
            });
        }
    }
    
    return { site: path.basename(siteDir), report, fullResults: results };
}

async function main() {
    const detector = new AIActivityDetector();
    const dataDir = path.join(__dirname, 'cdp_site_crawl', 'data');
    
    if (!fs.existsSync(dataDir)) {
        console.error('Data directory not found:', dataDir);
        process.exit(1);
    }
    
    const siteDirs = fs.readdirSync(dataDir)
        .map(name => path.join(dataDir, name))
        .filter(dir => fs.statSync(dir).isDirectory());
    
    console.log(`Found ${siteDirs.length} sites to analyze`);
    
    const allResults = [];
    
    for (const siteDir of siteDirs) {
        try {
            const result = await analyzeSite(siteDir, detector);
            allResults.push(result);
        } catch (error) {
            console.error(`Error analyzing ${path.basename(siteDir)}:`, error.message);
        }
    }
    
    // Generate summary report
    console.log('\n=== SUMMARY REPORT ===');
    const aiSites = allResults.filter(r => r.report.aiDetected);
    console.log(`Sites with AI activity: ${aiSites.length}/${allResults.length}`);
    
    if (aiSites.length > 0) {
        console.log('\nAI-Enabled Sites:');
        aiSites.forEach(result => {
            console.log(`- ${result.site}: ${result.report.confidence}% confidence`);
            if (result.report.categories.length > 0) {
                console.log(`  Categories: ${result.report.categories.map(c => c.category).join(', ')}`);
            }
        });
    }
    
    // Save detailed results
    const outputFile = path.join(__dirname, 'ai_detection_results.json');
    fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
    console.log(`\nDetailed results saved to: ${outputFile}`);
    
    return allResults;
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
