const chatbotKeywords = [
    'chat widget',
    "let's chat",
    'drift-widget',
    'chat now',
    'chatbot',
    // TODO: …add more as you discover them
  ];

const chatbotProviders = {
    Drift:    /js\.driftcdn\.com/,
    Intercom: /widget\.intercom\.io/,
    LiveChat: /livechatinc\.com/,
    HubSpot:  /js\.hs-scripts\.com/,
    Tidio:    /code\.tidio\.co/,
    // …add yours as you discover them
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

module.exports = {
    chatbotKeywords,
    chatbotProviders,
    chatLaunchers,
    

}