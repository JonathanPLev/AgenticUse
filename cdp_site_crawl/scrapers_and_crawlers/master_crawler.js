const InsidrCrawler = require('./insidr_crawler');
const FuturepediaCrawler = require('./futurepedia_crawler');
const SaasAiToolsCrawler = require('./saasai_crawler');
const A16ZCrawler = require('./a16z_crawler');
const RapidAPICrawler = require('./rapidapi_crawler');
const AIToolsConsolidator = require('./ai_tools_consolidator');

class MasterCrawler {
    constructor() {
        this.crawlers = [
            { name: 'Insidr.ai', crawler: InsidrCrawler, enabled: true },
            { name: 'Futurepedia', crawler: FuturepediaCrawler, enabled: true },
            { name: 'SaasAiTools', crawler: SaasAiToolsCrawler, enabled: true },
            { name: 'A16Z', crawler: A16ZCrawler, enabled: true },
            { name: 'RapidAPI', crawler: RapidAPICrawler, enabled: true }
        ];
        this.results = {};
        this.startTime = Date.now();
    }

    async runAllCrawlers() {
        console.log('🚀 Starting Master AI Tools Crawler');
        console.log(`Running ${this.crawlers.filter(c => c.enabled).length} crawlers...\n`);

        // Run each crawler
        for (const crawlerConfig of this.crawlers) {
            if (!crawlerConfig.enabled) {
                console.log(`⏭️  Skipping ${crawlerConfig.name} (disabled)`);
                continue;
            }

            await this.runSingleCrawler(crawlerConfig);
            
            // Wait between crawlers to be respectful
            console.log('⏳ Waiting 5 seconds before next crawler...\n');
            await this.delay(5000);
        }

        // Consolidate all data
        await this.consolidateData();

        // Generate final report
        this.generateFinalReport();
    }

    async runSingleCrawler(crawlerConfig) {
        const startTime = Date.now();
        console.log(`🔄 Starting ${crawlerConfig.name} crawler...`);

        try {
            const crawler = new crawlerConfig.crawler();
            await crawler.crawl();
            
            const duration = Date.now() - startTime;
            this.results[crawlerConfig.name] = {
                status: 'success',
                duration: duration,
                message: `Completed successfully in ${(duration / 1000).toFixed(1)}s`
            };
            
            console.log(`✅ ${crawlerConfig.name} completed successfully (${(duration / 1000).toFixed(1)}s)\n`);
            
        } catch (error) {
            const duration = Date.now() - startTime;
            this.results[crawlerConfig.name] = {
                status: 'error',
                duration: duration,
                error: error.message,
                message: `Failed after ${(duration / 1000).toFixed(1)}s: ${error.message}`
            };
            
            console.error(`❌ ${crawlerConfig.name} failed: ${error.message}\n`);
        }
    }

    async consolidateData() {
        console.log('🔗 Starting data consolidation...');
        
        try {
            const consolidator = new AIToolsConsolidator();
            await consolidator.consolidate();
            
            this.results['Consolidation'] = {
                status: 'success',
                message: 'Data consolidation completed successfully'
            };
            
            console.log('✅ Data consolidation completed\n');
            
        } catch (error) {
            this.results['Consolidation'] = {
                status: 'error',
                error: error.message,
                message: `Consolidation failed: ${error.message}`
            };
            
            console.error(`❌ Data consolidation failed: ${error.message}\n`);
        }
    }

    generateFinalReport() {
        const totalDuration = Date.now() - this.startTime;
        
        console.log('📊 MASTER CRAWLER FINAL REPORT');
        console.log('=' .repeat(50));
        console.log(`Total execution time: ${(totalDuration / 1000 / 60).toFixed(1)} minutes\n`);
        
        // Status summary
        const successful = Object.values(this.results).filter(r => r.status === 'success').length;
        const failed = Object.values(this.results).filter(r => r.status === 'error').length;
        
        console.log(`✅ Successful: ${successful}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📈 Success rate: ${((successful / (successful + failed)) * 100).toFixed(1)}%\n`);
        
        // Detailed results
        console.log('Detailed Results:');
        Object.entries(this.results).forEach(([name, result]) => {
            const icon = result.status === 'success' ? '✅' : '❌';
            const duration = result.duration ? ` (${(result.duration / 1000).toFixed(1)}s)` : '';
            console.log(`${icon} ${name}${duration}: ${result.message}`);
        });
        
        console.log('\n📁 Output Files Generated:');
        console.log('Individual crawler outputs:');
        console.log('  - insidr_ai_tools.json/csv');
        console.log('  - futurepedia_tools.json/csv');
        console.log('  - saasai_tools.json/csv');
        console.log('  - a16z_ai_apps.json/csv');
        console.log('  - rapidapi_ai_tools.json/csv');
        
        console.log('\nConsolidated outputs:');
        console.log('  - consolidated_ai_tools.json');
        console.log('  - consolidated_ai_tools.csv');
        console.log('  - high_confidence_ai_tools.json');
        console.log('  - consolidation_stats.json');
        
        console.log('\nDetection-ready files:');
        console.log('  - all_ai_tool_names.txt');
        console.log('  - high_confidence_tool_names.txt');
        console.log('  - ai_tool_domains.txt');
        console.log('  - ai_tools_by_category.json');
        
        console.log('\n🎯 Next Steps:');
        console.log('1. Run the comprehensive AI detector on your CDP logs:');
        console.log('   node comprehensive_ai_detector.js ./logs_stealth ./results');
        console.log('2. Review the consolidated AI tools data for quality');
        console.log('3. Use the detection-ready files in your log analysis pipeline');
        
        console.log('\n🏁 Master crawler execution completed!');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('Master AI Tools Crawler');
        console.log('Usage: node master_crawler.js [options]');
        console.log('');
        console.log('Options:');
        console.log('  --help, -h     Show this help message');
        console.log('  --skip-rapid   Skip RapidAPI crawler (slow)');
        console.log('  --consolidate-only  Only run consolidation (skip crawlers)');
        console.log('');
        console.log('This script runs all AI tool crawlers in sequence and consolidates the results.');
        return;
    }
    
    const masterCrawler = new MasterCrawler();
    
    // Handle command line options
    if (args.includes('--skip-rapid')) {
        masterCrawler.crawlers.find(c => c.name === 'RapidAPI').enabled = false;
        console.log('⏭️  RapidAPI crawler disabled');
    }
    
    if (args.includes('--consolidate-only')) {
        console.log('🔗 Running consolidation only...');
        await masterCrawler.consolidateData();
        return;
    }
    
    try {
        await masterCrawler.runAllCrawlers();
    } catch (error) {
        console.error('❌ Master crawler failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = MasterCrawler;
