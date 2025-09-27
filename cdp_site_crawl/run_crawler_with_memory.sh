#!/bin/bash

# Run CDP site crawler with increased Node.js memory limits
# This prevents "JavaScript heap out of memory" errors

echo "Starting CDP site crawler with increased memory limits..."
echo "Memory limit: 8GB (8192MB)"
echo "Max old space size: 8192MB"
echo "Max semi space size: 512MB"

# Run with increased memory limits
node --max-old-space-size=8192 --max-semi-space-size=512 cdp_site_crawler_fixed.cjs

echo "Crawler finished."
