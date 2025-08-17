const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { promisify } = require('util');
const fsPromises = fs.promises;

const TRANCO_LIST = path.join(__dirname, '../tranco_3N2WL.csv');
const DATA_DIR = path.join(__dirname, 'data');
const TARGET_DIR = path.join(__dirname, 'top_10k_data');
const TOP_N = 10000;

async function moveTopSites() {
  // Create target directory if it doesn't exist
  if (!fs.existsSync(TARGET_DIR)) {
    await fsPromises.mkdir(TARGET_DIR, { recursive: true });
    console.log(`Created target directory: ${TARGET_DIR}`);
  }

  const fileStream = fs.createReadStream(TRANCO_LIST);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  const moved = [];
  const notFound = [];

  console.log(`Processing top ${TOP_N} sites from ${TRANCO_LIST}...`);

  for await (const line of rl) {
    if (count >= TOP_N) break;
    
    // Parse the CSV line (format: rank,domain)
    const domain = line.split(',')[1]?.trim();
    if (!domain) continue;

    // Create the same slug format used by the crawler
    const slug = domain
      .replace(/(^\w+:|^)\//, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
      
    const sourceDir = path.join(DATA_DIR, slug);
    const targetDir = path.join(TARGET_DIR, slug);

    try {
      if (fs.existsSync(sourceDir)) {
        // Check if already moved
        if (!fs.existsSync(targetDir)) {
          await fsPromises.rename(sourceDir, targetDir);
          moved.push(domain);
        } else {
          console.log(`Skipping (already in target): ${domain}`);
        }
      } else {
        notFound.push(domain);
      }
      
      count++;
      if (count % 1000 === 0) {
        console.log(`Processed ${count} sites...`);
      }
    } catch (error) {
      console.error(`Error processing ${domain}:`, error.message);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total processed: ${count}`);
  console.log(`Successfully moved: ${moved.length}`);
  console.log(`Not found in data directory: ${notFound.length}`);
  
  // Save the lists for reference
  await saveList('moved_domains.txt', moved);
  await saveList('not_found_domains.txt', notFound);
  
  console.log(`\nDone! Moved data to: ${TARGET_DIR}`);
}

async function saveList(filename, items) {
  if (items.length === 0) return;
  const filepath = path.join(__dirname, filename);
  await fsPromises.writeFile(filepath, items.join('\n'));
  console.log(`Saved ${items.length} items to ${filename}`);
}

// Run the script
moveTopSites().catch(console.error);
