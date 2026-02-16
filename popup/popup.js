const MODEL_OPTIONS = {
  openai: [
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ],
};

const DEFAULT_TONES = [
  {
    value: 'friendly',
    label: 'Friendly',
    description: 'Friendly and warm - casual, approachable, like reaching out to a friend',
  },
  {
    value: 'professional',
    label: 'Professional',
    description: 'Professional and formal - business-oriented, polished, respectful of their time',
  },
  {
    value: 'question',
    label: 'Question',
    description: 'Asking an engaging question - curiosity-driven, opens dialogue by asking something relevant',
  },
  {
    value: 'complimentary',
    label: 'Complimentary',
    description: 'Complimentary - genuinely praises their work or achievements, not over-the-top',
  },
  {
    value: 'networking',
    label: 'Networking',
    description: 'Networking-focused - building mutual connections, finding common ground',
  },
  {
    value: 'collaboration',
    label: 'Collaboration',
    description: 'Collaboration-oriented - proposing to work together on something specific',
  },
];

document.addEventListener('DOMContentLoaded', async () => {
  // ── Settings tab elements ──────────────────────────────────────
  const providerSelect = document.getElementById('api-provider');
  const modelSelect = document.getElementById('ai-model');
  const apiKeyInput = document.getElementById('api-key');
  const backgroundInput = document.getElementById('user-background');
  const languageSelect = document.getElementById('default-language');
  const saveBtn = document.getElementById('save-btn');
  const saveStatusEl = document.getElementById('save-status');
  const hintOpenAI = document.getElementById('hint-openai');
  const hintAnthropic = document.getElementById('hint-anthropic');
  const statusBanner = document.getElementById('status-banner');
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');

  // ── Tones tab elements ─────────────────────────────────────────
  const tonesList = document.getElementById('tones-list');
  const addToneBtn = document.getElementById('add-tone-btn');
  const toneForm = document.getElementById('tone-form');
  const toneFormTitle = document.getElementById('tone-form-title');
  const toneLabelInput = document.getElementById('tone-label');
  const toneDescInput = document.getElementById('tone-description');
  const toneSaveBtn = document.getElementById('tone-save-btn');
  const toneCancelBtn = document.getElementById('tone-cancel-btn');
  const resetTonesBtn = document.getElementById('reset-tones-btn');

  // ── State ──────────────────────────────────────────────────────
  let tones = [];
  let editingToneIndex = -1; // -1 = adding new, >= 0 = editing existing

  // ── Load saved settings ────────────────────────────────────────
  const { apiKey, apiProvider, aiModel, userBackground, defaultLanguage, customTones } =
    await chrome.storage.sync.get([
      'apiKey',
      'apiProvider',
      'aiModel',
      'userBackground',
      'defaultLanguage',
      'customTones',
    ]);

  if (apiProvider) providerSelect.value = apiProvider;
  if (apiKey) apiKeyInput.value = apiKey;
  if (userBackground) backgroundInput.value = userBackground;
  if (defaultLanguage) languageSelect.value = defaultLanguage;

  tones = customTones && customTones.length > 0 ? customTones : [...DEFAULT_TONES];

  updateHint();
  populateModels(aiModel);
  updateStatusBanner(apiKey);
  renderTones();

  // ── Tab switching ──────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // ── Provider / model logic ─────────────────────────────────────
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

  // ── Save settings ──────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const background = backgroundInput.value.trim();
    const language = languageSelect.value;

    if (!key) {
      showSaveStatus('Please enter an API key.', 'error');
      return;
    }

    await chrome.storage.sync.set({
      apiKey: key,
      apiProvider: provider,
      aiModel: model,
      userBackground: background,
      defaultLanguage: language,
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

  // ── Tones management ───────────────────────────────────────────

  function renderTones() {
    tonesList.innerHTML = '';
    tones.forEach((tone, index) => {
      const card = document.createElement('div');
      card.className = 'tone-card';
      card.innerHTML = `
        <div class="tone-card-header">
          <span class="tone-card-name">${escapeHTML(tone.label)}</span>
          <div class="tone-card-actions">
            <button class="tone-card-btn edit" data-index="${index}">Edit</button>
            <button class="tone-card-btn delete" data-index="${index}">Delete</button>
          </div>
        </div>
        <div class="tone-card-desc">${escapeHTML(tone.description)}</div>
      `;
      tonesList.appendChild(card);
    });

    // Bind edit/delete buttons
    tonesList.querySelectorAll('.tone-card-btn.edit').forEach((btn) => {
      btn.addEventListener('click', () => startEditTone(parseInt(btn.dataset.index)));
    });
    tonesList.querySelectorAll('.tone-card-btn.delete').forEach((btn) => {
      btn.addEventListener('click', () => deleteTone(parseInt(btn.dataset.index)));
    });
  }

  function startEditTone(index) {
    editingToneIndex = index;
    toneFormTitle.textContent = 'Edit Tone';
    toneLabelInput.value = tones[index].label;
    toneDescInput.value = tones[index].description;
    toneForm.classList.remove('hidden');
    addToneBtn.classList.add('hidden');
    toneLabelInput.focus();
  }

  function startAddTone() {
    editingToneIndex = -1;
    toneFormTitle.textContent = 'Add New Tone';
    toneLabelInput.value = '';
    toneDescInput.value = '';
    toneForm.classList.remove('hidden');
    addToneBtn.classList.add('hidden');
    toneLabelInput.focus();
  }

  async function saveTone() {
    const label = toneLabelInput.value.trim();
    const description = toneDescInput.value.trim();

    if (!label) {
      toneLabelInput.focus();
      return;
    }
    if (!description) {
      toneDescInput.focus();
      return;
    }

    const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    if (editingToneIndex >= 0) {
      // Editing existing
      tones[editingToneIndex] = { value, label, description };
    } else {
      // Adding new
      tones.push({ value, label, description });
    }

    await persistTones();
    closeToneForm();
    renderTones();
  }

  async function deleteTone(index) {
    if (tones.length <= 1) return; // Keep at least one tone
    tones.splice(index, 1);
    await persistTones();
    closeToneForm();
    renderTones();
  }

  async function resetTones() {
    tones = [...DEFAULT_TONES];
    await persistTones();
    closeToneForm();
    renderTones();
  }

  function closeToneForm() {
    toneForm.classList.add('hidden');
    addToneBtn.classList.remove('hidden');
    editingToneIndex = -1;
    toneLabelInput.value = '';
    toneDescInput.value = '';
  }

  async function persistTones() {
    await chrome.storage.sync.set({ customTones: tones });
  }

  // ── Tone event listeners ───────────────────────────────────────
  addToneBtn.addEventListener('click', startAddTone);
  toneSaveBtn.addEventListener('click', saveTone);
  toneCancelBtn.addEventListener('click', closeToneForm);
  resetTonesBtn.addEventListener('click', resetTones);

  // ── Utility ────────────────────────────────────────────────────
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
