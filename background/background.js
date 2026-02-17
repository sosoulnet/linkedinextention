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
