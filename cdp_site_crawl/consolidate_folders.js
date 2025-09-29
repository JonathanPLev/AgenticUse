#!/usr/bin/env node
// consolidate_folders.js
// Script to consolidate data from weird slug folders into existing properly named folders
// Moves all files from source folders into target folders, then deletes empty source folders

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const DATA_DIR = './data';

// Function to extract clean domain from URL
function extractDomain(url) {
  try {
    let cleanUrl = url;
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    
    const urlObj = new URL(cleanUrl);
    let domain = urlObj.hostname;
    
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    
    return domain;
  } catch (error) {
    let domain = url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0];
    
    return domain;
  }
}

// Function to guess domain from weird slug folder name
function guessDomainFromSlug(folderName) {
  let guessed = folderName;
  
  // Remove protocol prefixes
  guessed = guessed
    .replace(/^https?___/, '')
    .replace(/^www_/, '');
  
  // Convert common patterns back to domain format
  guessed = guessed
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
    .replace(/_cn$/, '.cn')
    .replace(/_ai$/, '.ai')
    .replace(/_ly$/, '.ly')
    .replace(/_me$/, '.me')
    .replace(/_tv$/, '.tv')
    .replace(/_cc$/, '.cc')
    .replace(/_in$/, '.in')
    .replace(/_ca$/, '.ca')
    .replace(/_au$/, '.au')
    .replace(/_br$/, '.br')
    .replace(/_mx$/, '.mx')
    .replace(/_es$/, '.es')
    .replace(/_it$/, '.it')
    .replace(/_pl$/, '.pl')
    .replace(/_nl$/, '.nl')
    .replace(/_se$/, '.se')
    .replace(/_no$/, '.no')
    .replace(/_dk$/, '.dk')
    .replace(/_fi$/, '.fi');
  
  // Remove trailing underscores and clean up
  guessed = guessed
    .replace(/_+$/, '')
    .replace(/_+/g, '.')
    .toLowerCase();
  
  return guessed;
}

// Function to calculate similarity between two domain strings
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

// Levenshtein distance calculation
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
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

// Function to move all files from source to target directory
function moveDirectoryContents(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return { moved: 0, errors: [] };
  }
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  const items = fs.readdirSync(sourceDir);
  let moved = 0;
  const errors = [];
  
  for (const item of items) {
    const sourcePath = path.join(sourceDir, item);
    const targetPath = path.join(targetDir, item);
    
    try {
      // If target exists, create a unique name
      let finalTargetPath = targetPath;
      let counter = 1;
      
      while (fs.existsSync(finalTargetPath)) {
        const ext = path.extname(item);
        const name = path.basename(item, ext);
        finalTargetPath = path.join(targetDir, `${name}_${counter}${ext}`);
        counter++;
      }
      
      fs.renameSync(sourcePath, finalTargetPath);
      moved++;
      
      if (finalTargetPath !== targetPath) {
        console.log(`    Renamed to avoid conflict: ${item} -> ${path.basename(finalTargetPath)}`);
      }
      
    } catch (error) {
      errors.push(`${item}: ${error.message}`);
    }
  }
  
  return { moved, errors };
}

// Function to read domains from CSV file
async function readDomainsFromCSV(csvPath) {
  return new Promise((resolve, reject) => {
    const domains = new Set();
    
    if (!fs.existsSync(csvPath)) {
      reject(new Error(`CSV file not found: ${csvPath}`));
      return;
    }
    
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        const possibleUrlColumns = ['url', 'URL', 'domain', 'Domain', 'website', 'Website', 'link', 'Link'];
        let url = null;
        
        for (const col of possibleUrlColumns) {
          if (row[col]) {
            url = row[col];
            break;
          }
        }
        
        if (!url) {
          for (const [key, value] of Object.entries(row)) {
            if (value && (value.includes('.com') || value.includes('.org') || value.includes('.net') || 
                         value.includes('http') || value.includes('www.'))) {
              url = value;
              break;
            }
          }
        }
        
        if (url) {
          const domain = extractDomain(url);
          if (domain && domain.includes('.')) {
            domains.add(domain);
          }
        }
      })
      .on('end', () => {
        console.log(`Loaded ${domains.size} domains from CSV`);
        resolve(Array.from(domains));
      })
      .on('error', reject);
  });
}

// Main consolidation function
async function consolidateFolders(csvPath) {
  console.log('Starting folder consolidation...');
  
  if (!fs.existsSync(DATA_DIR)) {
    console.log('Data directory does not exist.');
    return;
  }
  
  // Read domains from CSV
  let csvDomains = [];
  try {
    csvDomains = await readDomainsFromCSV(csvPath);
  } catch (error) {
    console.error(`Error reading CSV: ${error.message}`);
    console.log('Proceeding with folder name guessing only...');
  }
  
  // Get existing folders
  const folders = fs.readdirSync(DATA_DIR).filter(item => {
    const itemPath = path.join(DATA_DIR, item);
    return fs.statSync(itemPath).isDirectory() && 
           !item.includes('_archived_') && 
           !item.includes('_backup_') &&
           item !== 'crawl_errors.log';
  });
  
  console.log(`Found ${folders.length} folders to analyze.`);
  
  // Separate weird slug folders from properly named folders
  const weirdSlugFolders = [];
  const properFolders = [];
  
  for (const folder of folders) {
    // A folder is "weird" if it has underscores, protocol prefixes, or other non-domain patterns
    if (folder.includes('_') || folder.includes('---') || 
        folder.startsWith('https') || folder.startsWith('http') ||
        !folder.includes('.') || folder.includes('index.php') ||
        folder.includes('standard-product') || folder.includes('hslang')) {
      weirdSlugFolders.push(folder);
    } else {
      properFolders.push(folder);
    }
  }
  
  console.log(`\nFound ${weirdSlugFolders.length} weird slug folders and ${properFolders.length} properly named folders.`);
  
  if (weirdSlugFolders.length === 0) {
    console.log('No weird slug folders to consolidate.');
    return;
  }
  
  const consolidationPairs = [];
  
  // For each weird slug folder, find the best matching proper folder
  for (const weirdFolder of weirdSlugFolders) {
    const weirdPath = path.join(DATA_DIR, weirdFolder);
    const weirdSize = getDirectorySize(weirdPath);
    
    if (weirdSize === 0) {
      console.log(`Skipping empty folder: ${weirdFolder}`);
      continue;
    }
    
    const guessedDomain = guessDomainFromSlug(weirdFolder);
    let bestMatch = null;
    let bestScore = 0;
    
    // First, try to match against existing proper folders
    for (const properFolder of properFolders) {
      const similarity = calculateSimilarity(guessedDomain, properFolder);
      
      // Also check if domains are related (one contains the other)
      const containsMatch = guessedDomain.includes(properFolder) || properFolder.includes(guessedDomain);
      
      if (similarity > bestScore || (containsMatch && similarity > 0.3)) {
        bestScore = similarity;
        bestMatch = properFolder;
      }
    }
    
    // If no good match in existing folders, try CSV domains
    if (bestScore < 0.7 && csvDomains.length > 0) {
      for (const csvDomain of csvDomains) {
        const similarity = calculateSimilarity(guessedDomain, csvDomain);
        const containsMatch = guessedDomain.includes(csvDomain) || csvDomain.includes(guessedDomain);
        
        if (similarity > bestScore || (containsMatch && similarity > 0.5)) {
          bestScore = similarity;
          bestMatch = csvDomain;
        }
      }
    }
    
    if (bestMatch && bestScore > 0.5) {
      consolidationPairs.push({
        source: weirdFolder,
        target: bestMatch,
        score: bestScore,
        sourceSize: weirdSize,
        guessedDomain
      });
    } else {
      console.log(`⚠️  No good match found for: ${weirdFolder} (guessed: ${guessedDomain})`);
    }
  }
  
  if (consolidationPairs.length === 0) {
    console.log('No consolidation pairs found.');
    return;
  }
  
  // Show consolidation plan
  console.log(`\n📋 Consolidation Plan:`);
  for (const pair of consolidationPairs) {
    console.log(`${pair.source} (${(pair.sourceSize / 1024).toFixed(1)} KB)`);
    console.log(`  -> ${pair.target} (${(pair.score * 100).toFixed(1)}% match)`);
    console.log(`  Guessed domain: ${pair.guessedDomain}`);
  }
  
  // Perform consolidations
  console.log(`\n🔄 Performing ${consolidationPairs.length} consolidations...`);
  
  for (const pair of consolidationPairs) {
    const sourcePath = path.join(DATA_DIR, pair.source);
    const targetPath = path.join(DATA_DIR, pair.target);
    
    console.log(`\n📁 Consolidating: ${pair.source} -> ${pair.target}`);
    
    try {
      const result = moveDirectoryContents(sourcePath, targetPath);
      
      if (result.moved > 0) {
        console.log(`  ✅ Moved ${result.moved} files`);
        
        // Delete the now-empty source directory
        try {
          fs.rmdirSync(sourcePath);
          console.log(`  🗑️  Deleted empty folder: ${pair.source}`);
        } catch (deleteError) {
          console.log(`  ⚠️  Could not delete folder (may not be empty): ${deleteError.message}`);
        }
      } else {
        console.log(`  ⚠️  No files moved`);
      }
      
      if (result.errors.length > 0) {
        console.log(`  ❌ Errors:`);
        result.errors.forEach(error => console.log(`    ${error}`));
      }
      
    } catch (error) {
      console.error(`  ❌ Error consolidating ${pair.source}: ${error.message}`);
    }
  }
  
  console.log('\n✅ Folder consolidation complete!');
  
  // Show final directory structure
  console.log('\n📂 Final directory structure:');
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

// Command line usage
if (require.main === module) {
  const csvPath = process.argv[2];
  
  if (!csvPath) {
    console.log('Usage: node consolidate_folders.js <path_to_csv_file>');
    console.log('Example: node consolidate_folders.js ./datasets/FINAL_LIST.csv');
    process.exit(1);
  }
  
  consolidateFolders(csvPath).catch(console.error);
}

module.exports = { consolidateFolders };
