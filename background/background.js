// Background service worker for LinkedIn Message Helper

// Open options page on install if no API key is configured
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const { apiKey } = await chrome.storage.sync.get(['apiKey']);
    if (!apiKey) {
      chrome.runtime.openOptionsPage();
    }
  }
});

// Handle messages from content script — execute code in page's MAIN world
// (bypasses CSP restrictions that block blob: and inline script injection)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'lmh-exec-main-world') return false;

  (async () => {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: 'MAIN',
        func: (code) => {
          // eslint-disable-next-line no-eval
          return eval(code);
        },
        args: [msg.code],
      });
      sendResponse({ ok: true, result: results?.[0]?.result });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true; // keep sendResponse channel open for async
});
