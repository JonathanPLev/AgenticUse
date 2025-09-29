#!/usr/bin/env node
// move_data.js
// Efficient script to rename folders from prefixed names (www_drift_com) to clean domain names (drift.com)
// Uses move/rename operations instead of copy to save disk space

const fs = require('fs');
const path = require('path');

const DATA_DIR = './data';

// Function to create clean domain-based slugs (same as in crawler)
function createCleanUrlSlug(url) {
  try {
    // Remove protocol and www prefix, extract clean domain
    let cleanUrl = url
      .replace(/^https?:\/\//, '')  // Remove protocol
      .replace(/^www\./, '')        // Remove www prefix
      .split('/')[0]                // Get just the domain part
      .split('?')[0]                // Remove query parameters
      .split('#')[0];               // Remove fragments
    
    // Keep dots for domains, only replace truly unsafe characters
    cleanUrl = cleanUrl
      .replace(/[^a-zA-Z0-9\-_.]/g, '_')  // Replace unsafe chars but keep dots
      .substring(0, 100);                  // Limit length
    
    return cleanUrl;
  } catch (error) {
    // Fallback to old method if parsing fails
    return url
      .replace(/(^\w+:|^)\//, '')
      .replace(/[^a-zA-Z0-9\-_.]/g, '_')
      .substring(0, 100);
  }
}

// Function to guess the original URL from a folder name
function guessOriginalUrl(folderName) {
  // Convert underscores back to dots for common patterns
  let guessedUrl = folderName
    .replace(/_com$/, '.com')
    .replace(/_org$/, '.org')
    .replace(/_net$/, '.net')
    .replace(/_io$/, '.io')
    .replace(/_co_/, '.co.')
    .replace(/_ru$/, '.ru')
    .replace(/_uk$/, '.uk')
    .replace(/_de$/, '.de')
    .replace(/_fr$/, '.fr')
    .replace(/_jp$/, '.jp')
    .replace(/_cn$/, '.cn');
  
  // Handle www prefixes
  if (guessedUrl.startsWith('www_')) {
    guessedUrl = 'www.' + guessedUrl.substring(4);
  }
  
  return guessedUrl;
}

// Function to get directory size
function getDirectorySize(dirPath) {
  let totalSize = 0;
  
  if (!fs.existsSync(dirPath)) {
    return 0;
  }
  
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        totalSize += getDirectorySize(itemPath);
      } else {
        totalSize += stat.size;
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not read directory ${dirPath}: ${error.message}`);
  }
  
  return totalSize;
}

async function moveData() {
  console.log('Starting data folder renaming...');
  
  if (!fs.existsSync(DATA_DIR)) {
    console.log('Data directory does not exist.');
    return;
  }
  
  const folders = fs.readdirSync(DATA_DIR).filter(item => {
    const itemPath = path.join(DATA_DIR, item);
    return fs.statSync(itemPath).isDirectory() && 
           !item.includes('_archived_') && 
           !item.includes('_backup_') &&
           item !== 'crawl_errors.log';
  });
  
  console.log(`Found ${folders.length} folders to process.`);
  
  const renamePairs = [];
  
  // First pass: identify folders that need renaming
  for (const folder of folders) {
    const guessedUrl = guessOriginalUrl(folder);
    const cleanSlug = createCleanUrlSlug(guessedUrl);
    
    // If the clean slug is different from the folder name, we need to rename
    if (cleanSlug !== folder) {
      const sourcePath = path.join(DATA_DIR, folder);
      const targetPath = path.join(DATA_DIR, cleanSlug);
      const sourceSize = getDirectorySize(sourcePath);
      
      // Check if target already exists
      if (fs.existsSync(targetPath)) {
        const targetSize = getDirectorySize(targetPath);
        console.log(`Conflict: ${folder} -> ${cleanSlug}`);
        console.log(`  Source: ${(sourceSize / 1024).toFixed(1)} KB`);
        console.log(`  Target exists: ${(targetSize / 1024).toFixed(1)} KB`);
        
        if (sourceSize > targetSize) {
          console.log(`  Will replace target with source (source is larger)`);
          renamePairs.push({
            source: folder,
            target: cleanSlug,
            action: 'replace',
            sourceSize,
            targetSize
          });
        } else {
          console.log(`  Will keep target, archive source (target is larger or equal)`);
          renamePairs.push({
            source: folder,
            target: folder + '_archived_' + Date.now(),
            action: 'archive',
            sourceSize,
            targetSize
          });
        }
      } else {
        console.log(`Will rename: ${folder} -> ${cleanSlug} (${(sourceSize / 1024).toFixed(1)} KB)`);
        renamePairs.push({
          source: folder,
          target: cleanSlug,
          action: 'rename',
          sourceSize
        });
      }
    }
  }
  
  if (renamePairs.length === 0) {
    console.log('No folders need renaming.');
    return;
  }
  
  // Second pass: perform the renames
  console.log(`\nPerforming ${renamePairs.length} operations...`);
  
  for (const pair of renamePairs) {
    const sourcePath = path.join(DATA_DIR, pair.source);
    const targetPath = path.join(DATA_DIR, pair.target);
    
    try {
      if (pair.action === 'replace') {
        // Backup existing target first
        const backupPath = targetPath + '_backup_' + Date.now();
        console.log(`  Backing up ${pair.target} -> ${path.basename(backupPath)}`);
        fs.renameSync(targetPath, backupPath);
      }
      
      console.log(`  ${pair.action}: ${pair.source} -> ${pair.target}`);
      fs.renameSync(sourcePath, targetPath);
      
    } catch (error) {
      console.error(`  Error processing ${pair.source}: ${error.message}`);
    }
  }
  
  console.log('\n✅ Data folder renaming complete!');
  
  // Show final directory structure
  console.log('\nFinal directory structure:');
  const finalFolders = fs.readdirSync(DATA_DIR).filter(item => {
    const itemPath = path.join(DATA_DIR, item);
    return fs.statSync(itemPath).isDirectory() && 
           !item.includes('_archived_') && 
           !item.includes('_backup_') &&
           item !== 'crawl_errors.log';
  });
  
  for (const folder of finalFolders.sort()) {
    const folderPath = path.join(DATA_DIR, folder);
    const size = getDirectorySize(folderPath);
    console.log(`  ${folder} (${(size / 1024).toFixed(1)} KB)`);
  }
}

// Run the move operation
moveData().catch(console.error);
