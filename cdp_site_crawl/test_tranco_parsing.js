#!/usr/bin/env node

/**
 * Test script to verify Tranco CSV parsing works correctly
 */

const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const TRANCO_CSV = '../tranco_3N2WL.csv';

console.log('🔍 Testing Tranco CSV parsing...\n');

async function testTrancoParser() {
  const urls = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(TRANCO_CSV)
      .pipe(csv({ headers: false })) // Tranco has no headers
      .on('data', row => { 
        // Tranco format: [id, domain] - we want the domain (index 1)
        const domain = row[1];
        if (domain && domain.trim()) {
          urls.push(domain.trim());
        }
      })
      .on('end', () => {
        console.log(`✅ Successfully parsed ${urls.length} domains from Tranco list`);
        console.log('\n📋 First 10 domains:');
        urls.slice(0, 10).forEach((domain, index) => {
          console.log(`   ${index + 1}. ${domain}`);
        });
        
        console.log('\n📋 Last 10 domains:');
        urls.slice(-10).forEach((domain, index) => {
          console.log(`   ${urls.length - 9 + index}. ${domain}`);
        });
        
        console.log(`\n🎯 Total domains ready for crawling: ${urls.length}`);
        resolve(urls);
      })
      .on('error', reject);
  });
}

if (require.main === module) {
  testTrancoParser().catch(console.error);
}

module.exports = { testTrancoParser };
