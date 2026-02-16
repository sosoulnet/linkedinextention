document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('api-provider');
  const apiKeyInput = document.getElementById('api-key');
  const backgroundInput = document.getElementById('user-background');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');
  const hintOpenAI = document.getElementById('hint-openai');
  const hintAnthropic = document.getElementById('hint-anthropic');

  // Load saved settings
  const { apiKey, apiProvider, userBackground } = await chrome.storage.sync.get([
    'apiKey',
    'apiProvider',
    'userBackground',
  ]);

  if (apiProvider) providerSelect.value = apiProvider;
  if (apiKey) apiKeyInput.value = apiKey;
  if (userBackground) backgroundInput.value = userBackground;

  updateHint();

  // Toggle hints based on provider
  providerSelect.addEventListener('change', updateHint);

  function updateHint() {
    if (providerSelect.value === 'openai') {
      hintOpenAI.classList.remove('hidden');
      hintAnthropic.classList.add('hidden');
    } else {
      hintOpenAI.classList.add('hidden');
      hintAnthropic.classList.remove('hidden');
    }
  }

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const provider = providerSelect.value;
    const background = backgroundInput.value.trim();

    if (!key) {
      showStatus('Please enter an API key.', 'error');
      return;
    }

    await chrome.storage.sync.set({
      apiKey: key,
      apiProvider: provider,
      userBackground: background,
    });

    showStatus('Settings saved successfully!', 'success');
  });

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.classList.remove('hidden');

    setTimeout(() => {
      statusEl.classList.add('hidden');
    }, 3000);
  }
});
