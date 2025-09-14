#!/usr/bin/env node
// cleanup_logs.js
// Script to remove large log files from CDP crawler data directories
// Usage: node cleanup_logs.js [data_directory_path]

const fs = require('fs');
const path = require('path');

// Log files to remove (these can get very large)
const LOG_FILES_TO_REMOVE = [
    'console.log',
    'debug.log', 
    'terminal.log',
    'interactions.log'
];

// Get data directory path from command line or use default
const dataDir = process.argv[2] || path.join(__dirname, 'data');

console.log(`🧹 Starting log cleanup in: ${dataDir}`);
console.log(`📋 Files to remove: ${LOG_FILES_TO_REMOVE.join(', ')}`);

let totalFilesRemoved = 0;
let totalSpaceFreed = 0;
let directoriesProcessed = 0;

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function cleanupDirectory(dirPath) {
    try {
        const entries = fs.readdirSync(dirPath);
        
        // Only process directories (skip files in root data folder)
        const subdirs = entries.filter(entry => {
            const fullPath = path.join(dirPath, entry);
            return fs.statSync(fullPath).isDirectory();
        });

        console.log(`\n📁 Found ${subdirs.length} site directories to process`);

        for (const subdir of subdirs) {
            const subdirPath = path.join(dirPath, subdir);
            directoriesProcessed++;
            
            console.log(`\n🔍 Processing: ${subdir}`);
            
            let dirFilesRemoved = 0;
            let dirSpaceFreed = 0;

            for (const logFile of LOG_FILES_TO_REMOVE) {
                const logFilePath = path.join(subdirPath, logFile);
                
                if (fs.existsSync(logFilePath)) {
                    try {
                        const stats = fs.statSync(logFilePath);
                        const fileSize = stats.size;
                        
                        fs.unlinkSync(logFilePath);
                        
                        console.log(`  ✅ Removed ${logFile} (${formatBytes(fileSize)})`);
                        
                        totalFilesRemoved++;
                        dirFilesRemoved++;
                        totalSpaceFreed += fileSize;
                        dirSpaceFreed += fileSize;
                        
                    } catch (error) {
                        console.log(`  ❌ Failed to remove ${logFile}: ${error.message}`);
                    }
                } else {
                    console.log(`  ⏭️  ${logFile} not found (skipping)`);
                }
            }
            
            if (dirFilesRemoved > 0) {
                console.log(`  📊 Directory summary: ${dirFilesRemoved} files, ${formatBytes(dirSpaceFreed)} freed`);
            } else {
                console.log(`  📊 No log files found to remove`);
            }
        }

    } catch (error) {
        console.error(`❌ Error processing directory ${dirPath}: ${error.message}`);
        process.exit(1);
    }
}

// Main execution
function main() {
    // Check if data directory exists
    if (!fs.existsSync(dataDir)) {
        console.error(`❌ Data directory not found: ${dataDir}`);
        console.log(`💡 Usage: node cleanup_logs.js [data_directory_path]`);
        process.exit(1);
    }

    // Check if it's actually a directory
    if (!fs.statSync(dataDir).isDirectory()) {
        console.error(`❌ Path is not a directory: ${dataDir}`);
        process.exit(1);
    }

    const startTime = Date.now();
    
    // Perform cleanup
    cleanupDirectory(dataDir);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Final summary
    console.log(`\n🎉 Cleanup completed!`);
    console.log(`📊 Final Summary:`);
    console.log(`   • Directories processed: ${directoriesProcessed}`);
    console.log(`   • Files removed: ${totalFilesRemoved}`);
    console.log(`   • Space freed: ${formatBytes(totalSpaceFreed)}`);
    console.log(`   • Time taken: ${duration.toFixed(2)} seconds`);
    
    if (totalFilesRemoved === 0) {
        console.log(`\n💡 No log files were found to remove. This could mean:`);
        console.log(`   • The directories are already clean`);
        console.log(`   • The log files have different names`);
        console.log(`   • The directory structure is different than expected`);
    }
}

// Run the script
main();
