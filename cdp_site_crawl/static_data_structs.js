const chatbotKeywords = [
    'chat widget',
    "let's chat",
    'drift-widget',
    'chat now',
    'chatbot',
    // TODO: …add more as you discover them
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

    // Generic “chat” keywords
    '.chat-widget',
    '#chat-widget',
    '.chat-toggle',
    '.open-chat',
    '[aria-label*="chat"]',
    'button[data-qa="chat-launcher"]',
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
];



module.exports = {
    chatbotKeywords,
    chatbotProviders,
    chatLaunchers,
    searchBarSelectors
}