const MODEL_OPTIONS = {
  openai: [
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ],
};

document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('api-provider');
  const modelSelect = document.getElementById('ai-model');
  const apiKeyInput = document.getElementById('api-key');
  const backgroundInput = document.getElementById('user-background');
  const saveBtn = document.getElementById('save-btn');
  const saveStatusEl = document.getElementById('save-status');
  const hintOpenAI = document.getElementById('hint-openai');
  const hintAnthropic = document.getElementById('hint-anthropic');
  const statusBanner = document.getElementById('status-banner');
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');

  // Load saved settings
  const { apiKey, apiProvider, aiModel, userBackground } = await chrome.storage.sync.get([
    'apiKey',
    'apiProvider',
    'aiModel',
    'userBackground',
  ]);

  if (apiProvider) providerSelect.value = apiProvider;
  if (apiKey) apiKeyInput.value = apiKey;
  if (userBackground) backgroundInput.value = userBackground;

  updateHint();
  populateModels(aiModel);
  updateStatusBanner(apiKey);

  // Toggle hints and models based on provider
  providerSelect.addEventListener('change', () => {
    updateHint();
    populateModels();
  });

  function updateHint() {
    if (providerSelect.value === 'openai') {
      hintOpenAI.classList.remove('hidden');
      hintAnthropic.classList.add('hidden');
    } else {
      hintOpenAI.classList.add('hidden');
      hintAnthropic.classList.remove('hidden');
    }
  }

  function populateModels(savedModel) {
    const models = MODEL_OPTIONS[providerSelect.value] || [];
    modelSelect.innerHTML = models
      .map((m) => `<option value="${m.value}">${m.label}</option>`)
      .join('');
    if (savedModel && models.some((m) => m.value === savedModel)) {
      modelSelect.value = savedModel;
    }
  }

  function updateStatusBanner(key) {
    statusBanner.classList.remove('hidden');
    if (key) {
      statusBanner.className = 'status-banner configured';
      statusIcon.textContent = '\u2713';
      statusText.textContent = 'API key configured — ready to use on LinkedIn profiles';
    } else {
      statusBanner.className = 'status-banner not-configured';
      statusIcon.textContent = '!';
      statusText.textContent = 'API key not set — add your key below to get started';
    }
  }

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const background = backgroundInput.value.trim();

    if (!key) {
      showSaveStatus('Please enter an API key.', 'error');
      return;
    }

    await chrome.storage.sync.set({
      apiKey: key,
      apiProvider: provider,
      aiModel: model,
      userBackground: background,
    });

    showSaveStatus('Settings saved!', 'success');
    updateStatusBanner(key);
  });

  function showSaveStatus(message, type) {
    saveStatusEl.textContent = message;
    saveStatusEl.className = `save-status ${type}`;
    saveStatusEl.classList.remove('hidden');

    setTimeout(() => {
      saveStatusEl.classList.add('hidden');
    }, 3000);
  }
});
