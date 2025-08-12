const viewports = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1680, height: 1050 }
];

// Validated real browser user agents - all combinations exist and are feasible
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0"
];


// Generic regex patterns for chatbot detection (instead of hardcoded exact matches)
const chatbotPatterns = [
    /chat/i,           // matches anything containing "chat"
    /support/i,        // matches anything containing "support"
    /help/i,           // matches anything containing "help"
    /assistant/i,      // matches anything containing "assistant"
    /bot/i,            // matches anything containing "bot"
    /message/i,        // matches anything containing "message"
    /converse/i,       // matches anything containing "converse"
    /discuss/i,        // matches anything containing "discuss"
    /consult/i,        // matches anything containing "consult"
    /inquire/i         // matches anything containing "inquire"
];

// Generic chatbot detection patterns (instead of hardcoded providers)
const genericChatbotDetection = {
  // Network patterns - look for these in URLs/domains
  networkPatterns: [
    /chat/i, /widget/i, /support/i, /help/i, /bot/i, /assistant/i,
    /intercom/i, /zendesk/i, /drift/i, /crisp/i, /freshchat/i, /olark/i,
    /livechat/i, /tidio/i, /hubspot/i, /messenger/i, /chatlio/i
  ],
  
  // DOM patterns - look for these in selectors/classes/ids
  domPatterns: [
    /chat/i, /widget/i, /launcher/i, /support/i, /help/i, /bot/i,
    /message/i, /conversation/i, /assistant/i, /contact/i
  ],
  
  // Text patterns - look for these in visible text
  textPatterns: [
    /chat with us/i, /need help/i, /contact support/i, /ask a question/i,
    /talk to us/i, /get help/i, /live chat/i, /customer support/i
  ]
};

// Generic search detection patterns (instead of exact matches)
const genericSearchDetection = {
  // Search patterns for element attributes
  searchPatterns: [
    /search/i,         // matches anything containing "search"
    /find/i,           // matches anything containing "find"
    /query/i,          // matches anything containing "query"
    /lookup/i          // matches anything containing "lookup"
  ]
};

// Legacy exact keywords for backward compatibility
const chatbotKeywords = [
    'chat widget',
    "let's chat",
    'drift-widget', 
    'chat now',
    'chatbot'
];

// static_data.js
const chatbotProviders = {
  intercom:    /intercom\.io/,
  livechat:    /livechatinc\.com/,
  drift:       /drift\.com\/api-client\//,          // catch Drift’s REST calls
  hubspot:     /api\.hubapi\.com\/conversations\//, // catch HubSpot convo API
  hubspotSocket: /websocket\.hubapi\.com/           // if they use WS for replies
};


// 1) All your known launchers
const chatLaunchers = [
    // Drift
    '.drift-open-chat',            // “Let’s chat” button
    '.drift-widget-launcher',      // alternate Drift class

    // Intercom
    '.intercom-launcher-frame',    // iframe wrapper
    'button.intercom-launcher',    // actual launcher button

    // LiveChat
    '#livechat-full-view',         // full view container (clickable)
    '.lc-1j3b8yg.e1kes29v1',       // auto-generated class may change

    // HubSpot Messages
    'button#hs-messages-launcher', // hubspot launcher
    '.hubspot-messages-iframe-container button',

    // Tidio
    '#tidio-chat-iframe',          // iframe itself (you’d then click inside)
    '.tidio-chat-button',          // pure JS button

    // Zendesk Chat (Zopim)
    '#zopim',                      // global container
    '.zopim .zopim-launcher',

    // Crisp
    '#crisp-chatbox',              // Crisp container
    '.crisp-client .launcher',

  // Freshchat
  '.freshchat-launcher',         // official freshchat toggle

  // Olark
  '.olark-launcher',

  // Generic regex patterns for search detection (instead of exact matches)
  /search/i,         // matches anything containing "search"
  /find/i,           // matches anything containing "find"
  /query/i,          // matches anything containing "query"
  /lookup/i          // matches anything containing "lookup"
];

const searchBarSelectors = [
  // Attribute-based (broad match, case-insensitive)
  'input[type="search"]',
  'input[type="text"]',
  'input[name*="search"]',
  'input[id*="search"]',
  'input[name*=search i]',
  'input[id*=search i]',
  'input[class*=search i]',
  'input[placeholder*=search i]',
  'input[aria-label*=search i]',
  // Variants for "searchbox"
  'input[id*=searchbox i]',
  'input[name*=searchbox i]',
  'input[class*=searchbox i]',
  'input[id*=search-box i]',
  'input[name*=search-box i]',
  'input[class*=search-box i]',
  'input[id*=search_box i]',
  'input[name*=search_box i]',
  'input[class*=search_box i]',
  'input[class*=searchbox_input i]',
  'input[id*=searchbox_input i]',
  'input[name*=searchbox_input i]',
  // Forms and wrappers
  'form[role="search"]',
  'form.search',
  '.search-form',
  '.search-input',
  // Also, the bare ID (as on DuckDuckGo)
  '#searchbox_input',
  '.shop-blue-assist-2BM4L',          // Best Buy’s help/chatbot class
  '[title*="help" i]',                 // generic
  '[alt*="help" i]'
];

const helpLaunchers = [
  'button[aria-label*="help" i]',
  'button[title*="help" i]',
  'a[aria-label*="help" i]',
  'a[title*="help" i]',
  '[class*="help" i]',
  '[id*="help" i]',
  '[data-testid*="help" i]',
  'button[aria-label*="support" i]',
  'button[title*="support" i]',
  '[class*="support" i]',
  '[id*="support" i]',
  '[data-testid*="support" i]',
  'button[aria-label*="assistant" i]',
  'button[title*="assistant" i]',
  '[class*="assistant" i]',
  '[id*="assistant" i]',
  '[data-testid*="assistant" i]',
];

module.exports = { 
  chatbotProviders, 
  genericChatbotDetection,
  genericSearchDetection,
  chatbotPatterns,
  viewports, 
  userAgents, 
  chatbotKeywords,
  chatLaunchers,
  searchBarSelectors,
  helpLaunchers
};