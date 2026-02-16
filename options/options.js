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
  const languageSelect = document.getElementById('default-language');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');
  const hintOpenAI = document.getElementById('hint-openai');
  const hintAnthropic = document.getElementById('hint-anthropic');

  // Load saved settings
  const { apiKey, apiProvider, aiModel, userBackground, defaultLanguage } = await chrome.storage.sync.get([
    'apiKey',
    'apiProvider',
    'aiModel',
    'userBackground',
    'defaultLanguage',
  ]);

  if (apiProvider) providerSelect.value = apiProvider;
  if (apiKey) apiKeyInput.value = apiKey;
  if (userBackground) backgroundInput.value = userBackground;
  if (defaultLanguage) languageSelect.value = defaultLanguage;

  updateHint();
  populateModels(aiModel);

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

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const background = backgroundInput.value.trim();
    const language = languageSelect.value;

    if (!key) {
      showStatus('Please enter an API key.', 'error');
      return;
    }

    await chrome.storage.sync.set({
      apiKey: key,
      apiProvider: provider,
      aiModel: model,
      userBackground: background,
      defaultLanguage: language,
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
