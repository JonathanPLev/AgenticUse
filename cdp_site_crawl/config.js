// config.js
// Centralized configuration system for the CDP site crawler

const path = require('path');

const CONFIG = {
  // Input/Output paths
  INPUT_CSV: '../top-1m.csv',
  OUTPUT_DIR: 'data',
  
  // Timing configurations
  FLUSH_INTERVAL_MS: 5000,
  PROTOCOL_TIMEOUT: 120000,
  NAVIGATION_TIMEOUT: 60000,
  INTERACTION_TIMEOUT: 30000,
  IDLE_AFTER_OPEN_MS: 1000,
  
  // Retry and limits
  MAX_RETRIES: 3,
  MAX_INTERACTIONS_PER_PAGE: 5,
  BODY_PREVIEW_LIMIT: 1_000_000,
  BIG_BODY_HARD_CAP: 10_000_000,
  
  // Browser settings
  BROWSER_ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-iframe-blocking',
    '--disable-features=IsolateOrigins,site-per-process'
  ],
  
  // Feature flags
  FEATURES: {
    enableFunctionTracking: true,
    enableNetworkTracing: true,
    enableResponseStreaming: true,
    enableBotMitigation: true,
    enableConsentHandling: true,
    logMitigation: false,
    logActions: false,
    finalFreshOriginal: true,
    closeSubmissionTabs: true
  },
  
  // Test inputs for interaction
  TEST_INPUTS: [
    'Where do I find the help center and help support',
    'help center',
    'support',
    'customer service',
    'contact support',
    'Are you a bot?'
  ],
  
  // Navigation strategies (ordered by preference)
  NAVIGATION_STRATEGIES: [
    { waitUntil: 'domcontentloaded', timeout: 15000 },
    { waitUntil: 'networkidle2', timeout: 20000 },
    { waitUntil: 'load', timeout: 10000 },
    { waitUntil: 'networkidle0', timeout: 25000 }
  ],
  
  // File requirements for complete crawl
  REQUIRED_FILES: ['network.log', 'dom.log', 'console.log'],
  MIN_CRAWL_SIZE_BYTES: 5000
};

// Environment-specific overrides
const ENVIRONMENT = process.env.NODE_ENV || 'development';

if (ENVIRONMENT === 'production') {
  CONFIG.FEATURES.logMitigation = false;
  CONFIG.FEATURES.logActions = false;
  CONFIG.MAX_INTERACTIONS_PER_PAGE = 10;
} else if (ENVIRONMENT === 'development') {
  CONFIG.FEATURES.logMitigation = true;
  CONFIG.FEATURES.logActions = true;
  CONFIG.MAX_INTERACTIONS_PER_PAGE = 3;
}

// Helper functions
function getOutputPath(filename = '') {
  return path.join(CONFIG.OUTPUT_DIR, filename);
}

function createUrlSlug(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .replace(/[^a-zA-Z0-9\-_.]/g, '_')
    .substring(0, 100);
}

function isBinaryContent(contentType = '') {
  return /octet-stream|zip|image|pdf|font|video|audio|wasm/i.test(contentType);
}

module.exports = {
  CONFIG,
  ENVIRONMENT,
  getOutputPath,
  createUrlSlug,
  isBinaryContent
};
