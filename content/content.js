// ── Constants ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert LinkedIn marketer and you now help to create a few options of messages to send to the current user. The messages should sound natural and motivate the users to respond.`;

const DEFAULT_TONES = [
  { value: 'friendly', label: 'Friendly', description: 'Friendly and warm - casual, approachable, like reaching out to a friend' },
  { value: 'professional', label: 'Professional', description: 'Professional and formal - business-oriented, polished, respectful of their time' },
  { value: 'question', label: 'Question', description: 'Asking an engaging question - curiosity-driven, opens dialogue by asking something relevant' },
  { value: 'complimentary', label: 'Complimentary', description: 'Complimentary - genuinely praises their work or achievements, not over-the-top' },
  { value: 'networking', label: 'Networking', description: 'Networking-focused - building mutual connections, finding common ground' },
  { value: 'collaboration', label: 'Collaboration', description: 'Collaboration-oriented - proposing to work together on something specific' },
];

// Active tones (loaded from storage or defaults)
let activeTones = [...DEFAULT_TONES];

async function loadTones() {
  const { customTones } = await chrome.storage.sync.get(['customTones']);
  activeTones = customTones && customTones.length > 0 ? customTones : [...DEFAULT_TONES];
}

// ── State ──────────────────────────────────────────────────────────
let panelOpen = false;
let menuOpen = false;
let profileData = null;
let lastPrompts = null; // { system, user, mutualRaw } — stored for QA inspection

// ── Inject UI on load ──────────────────────────────────────────────
createFloatingButton();

// ── Listen for messages from popup (still support insert) ──────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'insertMessage') {
    insertMessage(message.text);
    sendResponse({ success: true });
  }
  return true;
});

// ── Floating Action Button ─────────────────────────────────────────
function createFloatingButton() {
  const fab = document.createElement('div');
  fab.id = 'lmh-fab';
  fab.title = 'LinkedIn Message Helper';
  fab.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white"/>
      <path d="M9 11H7V9H9V11ZM13 11H11V9H13V11ZM17 11H15V9H17V11Z" fill="#0a66c2"/>
    </svg>
  `;
  fab.addEventListener('click', toggleMenu);
  document.body.appendChild(fab);
}

// ── FAB Menu ──────────────────────────────────────────────────────
function toggleMenu() {
  if (menuOpen) {
    closeMenu();
  } else {
    openMenu();
  }
}

function openMenu() {
  closeMenu(); // remove stale menu
  if (panelOpen) closePanel();

  const menu = document.createElement('div');
  menu.id = 'lmh-fab-menu';
  menu.innerHTML = `
    <button class="lmh-fab-menu-item" data-action="suggest">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="currentColor"/></svg>
      Suggest Messages
    </button>
    <button class="lmh-fab-menu-item" data-action="mutual">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="currentColor"/></svg>
      Mutual Friends
    </button>
  `;

  document.body.appendChild(menu);
  menuOpen = true;
  document.getElementById('lmh-fab').classList.add('lmh-fab-active');

  // Animate in
  requestAnimationFrame(() => menu.classList.add('lmh-fab-menu-visible'));

  // Handle menu item clicks
  menu.querySelector('[data-action="suggest"]').addEventListener('click', () => {
    closeMenu();
    openPanel();
  });
  menu.querySelector('[data-action="mutual"]').addEventListener('click', () => {
    closeMenu();
    openMutualFriendsModal();
  });

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', handleMenuOutsideClick);
  }, 0);
}

function handleMenuOutsideClick(e) {
  const menu = document.getElementById('lmh-fab-menu');
  const fab = document.getElementById('lmh-fab');
  if (menu && !menu.contains(e.target) && !fab.contains(e.target)) {
    closeMenu();
  }
}

function closeMenu() {
  document.removeEventListener('click', handleMenuOutsideClick);
  const menu = document.getElementById('lmh-fab-menu');
  if (menu) menu.remove();
  menuOpen = false;
  if (!panelOpen) {
    document.getElementById('lmh-fab')?.classList.remove('lmh-fab-active');
  }
}

// ── Panel ──────────────────────────────────────────────────────────

async function openPanel() {
  // Load custom tones from storage
  await loadTones();

  // Extract profile data from page
  profileData = extractProfileData();

  const panel = document.createElement('div');
  panel.id = 'lmh-panel';
  panel.innerHTML = buildPanelHTML(profileData);

  document.body.appendChild(panel);
  panelOpen = true;

  // Add the opened class to FAB for visual feedback
  document.getElementById('lmh-fab').classList.add('lmh-fab-active');

  // Load default language from settings
  chrome.storage.sync.get(['defaultLanguage'], ({ defaultLanguage }) => {
    const langSelect = panel.querySelector('#lmh-language');
    if (langSelect && defaultLanguage) langSelect.value = defaultLanguage;
  });

  // Bind panel events
  bindPanelEvents(panel);

  // Animate in
  requestAnimationFrame(() => panel.classList.add('lmh-panel-visible'));

  // Background: scrape the full mutual-connections list via Voyager API
  // so it's ready for the AI prompt when the user clicks Generate.
  if (profileData.mutualConnections?.count > 0) {
    scrapeFullMutualConnections().then(({ names: fullNames, nameToUrn, debug }) => {
      profileData.mutualConnections.fetchDebug = debug;
      if (fullNames && fullNames.length > 0) {
        profileData.mutualConnections.names = fullNames;
      }
      if (nameToUrn) {
        profileData.mutualConnections.nameToUrn = nameToUrn;
      }
    });
  }
}

function closePanel() {
  const panel = document.getElementById('lmh-panel');
  if (panel) {
    panel.classList.remove('lmh-panel-visible');
    panel.addEventListener('transitionend', () => panel.remove(), { once: true });
    // Fallback removal if transition doesn't fire
    setTimeout(() => panel.remove(), 350);
  }
  panelOpen = false;
  document.getElementById('lmh-fab')?.classList.remove('lmh-fab-active');
}

function buildPanelHTML(profile) {
  const firstToneValue = activeTones.length > 0 ? activeTones[0].value : '';
  const toneCheckboxes = activeTones.map(
    (t) => `
    <label class="lmh-tone-option">
      <input type="checkbox" name="lmh-tone" value="${t.value}" ${t.value === firstToneValue ? 'checked' : ''}>
      <span class="lmh-tone-label">${t.label}</span>
    </label>`
  ).join('');

  return `
    <div class="lmh-panel-header">
      <span class="lmh-panel-title">Message Helper</span>
      <button class="lmh-close-btn" id="lmh-close-btn">&times;</button>
    </div>

    <div class="lmh-panel-body">
      <div class="lmh-section">
        <div class="lmh-section-label">Profile</div>
        <div class="lmh-profile-card">
          <div class="lmh-profile-name">${escapeHTML(profile.name || 'Unknown')}</div>
          <div class="lmh-profile-headline">${escapeHTML(profile.headline || '')}</div>
          <div class="lmh-profile-location">${escapeHTML(profile.location || '')}</div>
        </div>
      </div>

      <div class="lmh-section">
        <div class="lmh-section-label">Tone</div>
        <div class="lmh-tone-grid">${toneCheckboxes}</div>
      </div>

      <div class="lmh-section">
        <div class="lmh-section-label">Language</div>
        <select id="lmh-language" class="lmh-select">
          <option value="english">English</option>
          <option value="hebrew">Hebrew</option>
        </select>
      </div>

      <button id="lmh-generate-btn" class="lmh-generate-btn">Generate Messages</button>

      <div id="lmh-loading" class="lmh-loading lmh-hidden">
        <div class="lmh-spinner"></div>
        <span>Generating...</span>
      </div>

      <div id="lmh-error" class="lmh-error lmh-hidden">
        <span id="lmh-error-msg"></span>
      </div>
    </div>
  `;
}

function bindPanelEvents(panel) {
  panel.querySelector('#lmh-close-btn').addEventListener('click', closePanel);

  panel.querySelector('#lmh-generate-btn').addEventListener('click', async () => {
    const selectedTones = Array.from(
      panel.querySelectorAll('input[name="lmh-tone"]:checked')
    ).map((el) => el.value);

    if (selectedTones.length === 0) {
      showPanelError('Please select at least one tone.');
      return;
    }

    const language = panel.querySelector('#lmh-language').value;

    // Get API settings
    const { apiKey, apiProvider, aiModel, userBackground } = await chrome.storage.sync.get([
      'apiKey',
      'apiProvider',
      'aiModel',
      'userBackground',
    ]);

    if (!apiKey) {
      showPanelError('API key not configured. Click the extension toolbar icon to set it up.');
      return;
    }

    const generateBtn = panel.querySelector('#lmh-generate-btn');
    const loadingEl = panel.querySelector('#lmh-loading');
    const errorEl = panel.querySelector('#lmh-error');

    generateBtn.disabled = true;
    loadingEl.classList.remove('lmh-hidden');
    errorEl.classList.add('lmh-hidden');

    try {
      const messages = await generateMessages({
        profileData,
        tones: selectedTones,
        apiKey,
        apiProvider: apiProvider || 'openai',
        aiModel: aiModel || '',
        userBackground: userBackground || '',
        language: language || 'english',
      });
      displayMessagesInPanel(null, messages);
    } catch (err) {
      showPanelError(err.message || 'Failed to generate messages.');
    } finally {
      generateBtn.disabled = false;
      loadingEl.classList.add('lmh-hidden');
    }
  });
}

function showPanelError(msg) {
  const errorEl = document.getElementById('lmh-error');
  const errorMsg = document.getElementById('lmh-error-msg');
  if (errorEl && errorMsg) {
    errorMsg.textContent = msg;
    errorEl.classList.remove('lmh-hidden');
  }
}

function displayMessagesInPanel(_container, messages) {
  // Remove any existing modal
  document.getElementById('lmh-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'lmh-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'lmh-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'lmh-modal-header';
  header.innerHTML = `
    <span class="lmh-modal-title">Choose a Message</span>
    <div class="lmh-modal-header-actions">
      <button class="lmh-qa-btn" title="Show the prompt sent to the AI">QA</button>
      <button class="lmh-modal-close">&times;</button>
    </div>
  `;
  modal.appendChild(header);

  // Body with message cards
  const body = document.createElement('div');
  body.className = 'lmh-modal-body';

  messages.forEach((msg) => {
    const card = document.createElement('div');
    card.className = 'lmh-message-card';

    const tag = document.createElement('span');
    tag.className = 'lmh-message-tag';
    tag.textContent = msg.tone;

    const text = document.createElement('div');
    text.className = 'lmh-message-text';
    text.textContent = msg.text;

    const actions = document.createElement('div');
    actions.className = 'lmh-message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'lmh-copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(msg.text);
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('lmh-copied');
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('lmh-copied');
      }, 2000);
    });

    const useBtn = document.createElement('button');
    useBtn.className = 'lmh-use-btn';
    useBtn.textContent = 'Insert in Chat';
    useBtn.addEventListener('click', () => {
      insertMessage(msg.text);
    });

    actions.appendChild(copyBtn);
    actions.appendChild(useBtn);
    card.appendChild(tag);
    card.appendChild(text);
    card.appendChild(actions);
    body.appendChild(card);
  });

  // QA prompt viewer (hidden by default)
  const qaPanel = document.createElement('div');
  qaPanel.className = 'lmh-qa-panel lmh-hidden';
  if (lastPrompts) {
    const mutualRaw = lastPrompts.mutualRaw || { count: 0, names: [] };
    // Separate fetchDebug from the display data
    const { fetchDebug, ...mutualDisplay } = mutualRaw;
    const mutualDebug = JSON.stringify(mutualDisplay, null, 2);
    const fetchDebugStr = fetchDebug ? JSON.stringify(fetchDebug, null, 2) : 'N/A (not attempted)';
    qaPanel.innerHTML = `
      <div class="lmh-qa-section">
        <div class="lmh-qa-label-row">
          <span class="lmh-qa-label">Mutual Connections (scraped)</span>
          <button class="lmh-qa-copy-btn" data-copy="mutual">Copy</button>
        </div>
        <pre class="lmh-qa-pre lmh-qa-pre-scroll">${escapeHTML(mutualDebug)}</pre>
      </div>
      <div class="lmh-qa-section">
        <div class="lmh-qa-label-row">
          <span class="lmh-qa-label">Fetch Debug (full list scraping)</span>
          <button class="lmh-qa-copy-btn" data-copy="fetchDebug">Copy</button>
        </div>
        <pre class="lmh-qa-pre lmh-qa-pre-scroll">${escapeHTML(fetchDebugStr)}</pre>
      </div>
      <div class="lmh-qa-section">
        <div class="lmh-qa-label-row">
          <span class="lmh-qa-label">System Prompt</span>
          <button class="lmh-qa-copy-btn" data-copy="system">Copy</button>
        </div>
        <pre class="lmh-qa-pre">${escapeHTML(lastPrompts.system)}</pre>
      </div>
      <div class="lmh-qa-section">
        <div class="lmh-qa-label-row">
          <span class="lmh-qa-label">User Prompt</span>
          <button class="lmh-qa-copy-btn" data-copy="user">Copy</button>
        </div>
        <pre class="lmh-qa-pre">${escapeHTML(lastPrompts.user)}</pre>
      </div>
    `;

    // Bind copy buttons
    const copyData = { mutual: mutualDebug, fetchDebug: fetchDebugStr, system: lastPrompts.system, user: lastPrompts.user };
    qaPanel.querySelectorAll('.lmh-qa-copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(copyData[btn.dataset.copy]);
        btn.textContent = 'Copied!';
        btn.classList.add('lmh-qa-copy-done');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('lmh-qa-copy-done');
        }, 2000);
      });
    });
  }

  modal.appendChild(qaPanel);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Drag support via header
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  header.style.cursor = 'grab';

  header.addEventListener('mousedown', (e) => {
    // Ignore clicks on buttons inside the header
    if (e.target.closest('button')) return;
    isDragging = true;
    header.style.cursor = 'grabbing';

    // Switch modal from flex-centered to absolute positioning on first drag
    if (!modal.style.position || modal.style.position !== 'absolute') {
      const rect = modal.getBoundingClientRect();
      modal.style.position = 'absolute';
      modal.style.left = rect.left + 'px';
      modal.style.top = rect.top + 'px';
      modal.style.margin = '0';
    }

    dragOffsetX = e.clientX - modal.getBoundingClientRect().left;
    dragOffsetY = e.clientY - modal.getBoundingClientRect().top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    modal.style.left = (e.clientX - dragOffsetX) + 'px';
    modal.style.top = (e.clientY - dragOffsetY) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'grab';
    }
  });

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('lmh-modal-visible'));

  // QA toggle
  const qaBtn = header.querySelector('.lmh-qa-btn');
  qaBtn.addEventListener('click', () => {
    const isVisible = !qaPanel.classList.contains('lmh-hidden');
    qaPanel.classList.toggle('lmh-hidden');
    body.classList.toggle('lmh-hidden');
    qaBtn.classList.toggle('lmh-qa-btn-active', !isVisible);
  });

  // Close handlers
  function closeModal() {
    overlay.classList.remove('lmh-modal-visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    setTimeout(() => overlay.remove(), 350);
  }

  header.querySelector('.lmh-modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

// ── Mutual Friends modal ───────────────────────────────────────────
async function openMutualFriendsModal() {
  // Extract profile data if not already done
  if (!profileData) profileData = extractProfileData();

  // Show loading overlay while scraping
  document.getElementById('lmh-mutual-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'lmh-mutual-overlay';

  const modal = document.createElement('div');
  modal.className = 'lmh-modal';

  const header = document.createElement('div');
  header.className = 'lmh-modal-header';
  header.innerHTML = `
    <span class="lmh-modal-title">Mutual Friends — ${escapeHTML(profileData.name || 'Profile')}</span>
    <button class="lmh-modal-close">&times;</button>
  `;
  modal.appendChild(header);

  const body = document.createElement('div');
  body.className = 'lmh-modal-body';
  body.innerHTML = `
    <div class="lmh-loading">
      <div class="lmh-spinner"></div>
      <span>Loading mutual connections...</span>
    </div>
  `;
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('lmh-modal-visible'));

  // Close handlers
  function closeMutualModal() {
    overlay.classList.remove('lmh-modal-visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    setTimeout(() => overlay.remove(), 350);
  }

  header.querySelector('.lmh-modal-close').addEventListener('click', closeMutualModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeMutualModal();
  });

  // Drag support
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  header.style.cursor = 'grab';

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    header.style.cursor = 'grabbing';
    if (!modal.style.position || modal.style.position !== 'absolute') {
      const rect = modal.getBoundingClientRect();
      modal.style.position = 'absolute';
      modal.style.left = rect.left + 'px';
      modal.style.top = rect.top + 'px';
      modal.style.margin = '0';
    }
    dragOffsetX = e.clientX - modal.getBoundingClientRect().left;
    dragOffsetY = e.clientY - modal.getBoundingClientRect().top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    modal.style.left = (e.clientX - dragOffsetX) + 'px';
    modal.style.top = (e.clientY - dragOffsetY) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) { isDragging = false; header.style.cursor = 'grab'; }
  });

  // Scrape mutual connections — always call the API if the current list
  // is shorter than the total count (the DOM text only shows 2-3 names).
  let names = profileData.mutualConnections?.names || [];
  const totalCount = profileData.mutualConnections?.count || 0;
  if (names.length < totalCount || (names.length === 0 && totalCount > 0)) {
    body.innerHTML = `<div id="lmh-loading-progress" class="lmh-loading" style="padding:24px;text-align:center;">Loading mutual connections… (page 1)</div>`;
    const loadingEl = body.querySelector('#lmh-loading-progress');
    const result = await scrapeFullMutualConnections((count, page) => {
      if (loadingEl) loadingEl.textContent = `Loading mutual connections… ${count} found (page ${page})`;
    });
    console.log('[LMH] scrapeFullMutualConnections result:', result.debug);
    if (result.names && result.names.length > 0) {
      names = result.names;
      profileData.mutualConnections.names = names;
    }
    if (result.nameToUrn) {
      profileData.mutualConnections.nameToUrn = result.nameToUrn;
    }
  }

  if (names.length === 0) {
    body.innerHTML = `
      <div class="lmh-error">No mutual connections found for this profile.</div>
    `;
    return;
  }

  // Render friend list with checkboxes
  const profileName = profileData.name || 'this person';
  const profileUrl = window.location.href.split('?')[0];
  const defaultMessage = `Hey [friend], I'd love your help with an intro to ${profileName}(${profileUrl}). I think Kai can be highly relevant for them.`;

  body.innerHTML = `
    <div class="lmh-mutual-toolbar">
      <label class="lmh-mutual-select-all">
        <input type="checkbox" id="lmh-mutual-select-all"> Select all
      </label>
      <span class="lmh-mutual-count"><span id="lmh-mutual-selected-count">0</span> / ${names.length} selected</span>
    </div>
    <div class="lmh-mutual-list">
      ${names.map((name, i) => `
        <label class="lmh-mutual-item">
          <input type="checkbox" class="lmh-mutual-cb" data-index="${i}" data-name="${escapeHTML(name)}">
          <span class="lmh-mutual-name">${escapeHTML(name)}</span>
        </label>
      `).join('')}
    </div>
    <div id="lmh-tagged-section" class="lmh-tagged-section lmh-hidden">
      <div class="lmh-section-label">Tagged friends</div>
      <div id="lmh-tagged-list" class="lmh-tagged-list"></div>
    </div>
    <div class="lmh-mutual-message-section">
      <div class="lmh-section-label">Intro request message <span class="lmh-optional">— use [friend] as placeholder</span></div>
      <textarea id="lmh-mutual-message" class="lmh-textarea" rows="3">${escapeHTML(defaultMessage)}</textarea>
    </div>
    <button id="lmh-propagate-btn" class="lmh-generate-btn lmh-propagate-btn" disabled style="margin-top:8px">Propagate Messages</button>
    <div id="lmh-propagated-section" class="lmh-propagated-section lmh-hidden">
      <div class="lmh-propagated-header">
        <div class="lmh-section-label">Personalized messages</div>
        <button id="lmh-send-all-btn" class="lmh-send-all-btn" disabled>Send All</button>
      </div>
      <div id="lmh-propagated-list" class="lmh-propagated-list"></div>
    </div>
  `;

  const checkboxes = body.querySelectorAll('.lmh-mutual-cb');
  const selectAllCb = body.querySelector('#lmh-mutual-select-all');
  const selectedCountEl = body.querySelector('#lmh-mutual-selected-count');
  const propagateBtn = body.querySelector('#lmh-propagate-btn');
  const messageTextarea = body.querySelector('#lmh-mutual-message');
  const taggedSection = body.querySelector('#lmh-tagged-section');
  const taggedList = body.querySelector('#lmh-tagged-list');
  const propagatedSection = body.querySelector('#lmh-propagated-section');
  const propagatedList = body.querySelector('#lmh-propagated-list');
  const sendAllBtn = body.querySelector('#lmh-send-all-btn');

  function getSelectedNames() {
    return [...body.querySelectorAll('.lmh-mutual-cb:checked')].map((cb) => cb.dataset.name);
  }

  function updateTaggedList() {
    const selected = getSelectedNames();
    selectedCountEl.textContent = selected.length;
    propagateBtn.disabled = selected.length === 0 || !messageTextarea.value.trim();

    if (selected.length === 0) {
      taggedSection.classList.add('lmh-hidden');
      return;
    }

    taggedSection.classList.remove('lmh-hidden');
    taggedList.innerHTML = selected.map((name) => `
      <span class="lmh-tag-chip" data-name="${escapeHTML(name)}">
        ${escapeHTML(name)}
        <span class="lmh-tag-remove" title="Remove">&times;</span>
      </span>
    `).join('');

    // Remove chip → uncheck the corresponding checkbox
    taggedList.querySelectorAll('.lmh-tag-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chipName = btn.parentElement.dataset.name;
        const cb = body.querySelector(`.lmh-mutual-cb[data-name="${CSS.escape(chipName)}"]`);
        if (cb) { cb.checked = false; }
        selectAllCb.checked = false;
        updateTaggedList();
      });
    });
  }

  checkboxes.forEach((cb) => cb.addEventListener('change', () => {
    updateTaggedList();
    selectAllCb.checked = body.querySelectorAll('.lmh-mutual-cb:checked').length === checkboxes.length;
  }));

  selectAllCb.addEventListener('change', () => {
    checkboxes.forEach((cb) => { cb.checked = selectAllCb.checked; });
    updateTaggedList();
  });

  messageTextarea.addEventListener('input', () => {
    const selected = getSelectedNames();
    propagateBtn.disabled = selected.length === 0 || !messageTextarea.value.trim();
  });

  // Propagate: generate personalized messages for each selected friend
  propagateBtn.addEventListener('click', () => {
    const selected = getSelectedNames();
    const messageTemplate = messageTextarea.value.trim();
    if (selected.length === 0 || !messageTemplate) return;

    propagatedSection.classList.remove('lmh-hidden');
    propagatedList.innerHTML = selected.map((name) => {
      const firstName = name.split(' ')[0];
      const personalizedMessage = messageTemplate.replace(/\[friend\]/gi, firstName);
      return `
        <div class="lmh-propagated-row" data-name="${escapeHTML(name)}" data-status="pending">
          <div class="lmh-propagated-row-header">
            <span class="lmh-propagated-name">${escapeHTML(name)}</span>
            <button class="lmh-propagated-send-btn" title="Send to ${escapeHTML(name)}">Send</button>
          </div>
          <textarea class="lmh-propagated-textarea" rows="2">${escapeHTML(personalizedMessage)}</textarea>
        </div>
      `;
    }).join('');

    sendAllBtn.disabled = false;
    propagatedSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Bind individual Send buttons
    propagatedList.querySelectorAll('.lmh-propagated-send-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.lmh-propagated-row');
        if (row.dataset.status === 'sent') return;
        const friendName = row.dataset.name;
        const message = row.querySelector('.lmh-propagated-textarea').value.trim();
        if (!message) return;

        btn.disabled = true;
        btn.textContent = 'Sending…';
        row.dataset.status = 'sending';

        try {
          await sendLinkedInMessage(friendName, message);
          row.dataset.status = 'sent';
          btn.textContent = 'Sent';
          btn.classList.add('lmh-sent');
          row.querySelector('.lmh-propagated-textarea').readOnly = true;
          updateSendAllState();
        } catch (err) {
          console.error(`Failed to send to ${friendName}:`, err);
          row.dataset.status = 'error';
          btn.textContent = 'Retry';
          btn.title = err.message; // show error on hover
          btn.disabled = false;
          btn.classList.add('lmh-error-btn');
          // Show error below the textarea
          let errEl = row.querySelector('.lmh-send-error');
          if (!errEl) {
            errEl = document.createElement('div');
            errEl.className = 'lmh-send-error';
            errEl.style.cssText = 'color:#e74c3c;font-size:11px;margin-top:4px;word-break:break-all;';
            row.appendChild(errEl);
          }
          errEl.textContent = err.message;
        }
      });
    });
  });

  function updateSendAllState() {
    const pending = propagatedList.querySelectorAll('.lmh-propagated-row:not([data-status="sent"])');
    sendAllBtn.disabled = pending.length === 0;
    if (pending.length === 0) {
      sendAllBtn.textContent = 'All Sent';
      sendAllBtn.classList.add('lmh-sent');
    }
  }

  // Send All: send every unsent message
  sendAllBtn.addEventListener('click', async () => {
    const rows = [...propagatedList.querySelectorAll('.lmh-propagated-row:not([data-status="sent"])')];
    if (rows.length === 0) return;

    sendAllBtn.disabled = true;
    sendAllBtn.textContent = `Sending 0 / ${rows.length}…`;

    let sent = 0;
    for (const row of rows) {
      const friendName = row.dataset.name;
      const message = row.querySelector('.lmh-propagated-textarea').value.trim();
      const btn = row.querySelector('.lmh-propagated-send-btn');
      if (!message || row.dataset.status === 'sent') continue;

      btn.disabled = true;
      btn.textContent = 'Sending…';
      row.dataset.status = 'sending';

      try {
        await sendLinkedInMessage(friendName, message);
        row.dataset.status = 'sent';
        btn.textContent = 'Sent';
        btn.classList.add('lmh-sent');
        row.querySelector('.lmh-propagated-textarea').readOnly = true;
        sent++;
      } catch (err) {
        console.error(`Failed to send to ${friendName}:`, err);
        row.dataset.status = 'error';
        btn.textContent = 'Retry';
        btn.disabled = false;
        btn.classList.add('lmh-error-btn');
      }

      sendAllBtn.textContent = `Sending ${sent} / ${rows.length}…`;
    }

    showNotification(`Intro request sent to ${sent} friend(s)!`);
    updateSendAllState();
  });
}

// ── Send LinkedIn message via Voyager API ─────────────────────────
async function sendLinkedInMessage(recipientName, messageText) {
  console.log(`[LMH] sendLinkedInMessage: to="${recipientName}"`);
  const csrfToken = getCsrfToken();
  if (!csrfToken) throw new Error('No CSRF token found');

  // 1. Resolve the member ID for the recipient
  let memberId = null;

  // 1a. Try stored URN from mutual connections scrape
  const storedUrn = profileData?.mutualConnections?.nameToUrn?.get(recipientName) || null;
  console.log(`[LMH] Stored URN for "${recipientName}":`, storedUrn);
  if (storedUrn) {
    const m = storedUrn.match(/fsd_profile:([A-Za-z0-9_-]+)/);
    if (m) memberId = m[1];
  }

  // 1b. Fallback: search by name and regex the entire response for an fsd_profile URN
  if (!memberId) {
    console.log(`[LMH] No stored URN, searching for "${recipientName}"…`);
    const searchUrl = `https://www.linkedin.com/voyager/api/search/dash/clusters`
      + `?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-175`
      + `&origin=GLOBAL_SEARCH_HEADER&q=all`
      + `&query=(keywords:${encodeURIComponent(recipientName)},flagshipSearchIntent:SEARCH_SRP,queryParameters:(resultType:List(PEOPLE),network:List(F)))`
      + `&count=1&start=0`;

    const searchResp = await fetch(searchUrl, {
      headers: {
        'csrf-token': csrfToken,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version': '2.0.0',
      },
      credentials: 'include',
    });

    if (!searchResp.ok) throw new Error(`Search failed: ${searchResp.status}`);

    const searchStr = await searchResp.text();
    console.log(`[LMH] Search response length: ${searchStr.length}`);
    // Find the first fsd_profile URN in the response
    const m = searchStr.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/);
    if (m) {
      memberId = m[1];
      console.log(`[LMH] Search found memberId: ${memberId}`);
    } else {
      console.log(`[LMH] No fsd_profile URN in search response, first 500 chars:`, searchStr.slice(0, 500));
    }
  }

  if (!memberId) throw new Error('Could not find profile for: ' + recipientName);
  console.log(`[LMH] Resolved memberId="${memberId}" for "${recipientName}"`);

  // 2. Send the message — try legacy conversations endpoint first (most reliable)
  const errors = [];

  // 2a. Legacy messaging API
  try {
    console.log('[LMH] Trying legacy /messaging/conversations …');
    const legacyResp = await fetch('https://www.linkedin.com/voyager/api/messaging/conversations', {
      method: 'POST',
      headers: {
        'csrf-token': csrfToken,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'content-type': 'application/json; charset=UTF-8',
        'x-restli-protocol-version': '2.0.0',
      },
      credentials: 'include',
      body: JSON.stringify({
        keyVersion: 'LEGACY_INBOX',
        conversationCreate: {
          eventCreate: {
            value: {
              'com.linkedin.voyager.messaging.create.MessageCreate': {
                body: messageText,
                attachments: [],
              },
            },
          },
          recipients: [memberId],
          subtype: 'MEMBER_TO_MEMBER',
        },
      }),
    });

    if (legacyResp.ok || legacyResp.status === 201) {
      console.log('[LMH] Message sent via legacy API!');
      return;
    }
    const errText = await legacyResp.text();
    errors.push(`legacy ${legacyResp.status}: ${errText.slice(0, 300)}`);
    console.warn(`[LMH] Legacy API failed: ${legacyResp.status}`, errText.slice(0, 300));
  } catch (e) {
    errors.push(`legacy error: ${e.message}`);
    console.warn('[LMH] Legacy API error:', e);
  }

  // 2b. Dash messaging API
  try {
    console.log('[LMH] Trying dash messaging API …');
    const dashResp = await fetch('https://www.linkedin.com/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage', {
      method: 'POST',
      headers: {
        'csrf-token': csrfToken,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'content-type': 'application/json; charset=UTF-8',
        'x-restli-protocol-version': '2.0.0',
      },
      credentials: 'include',
      body: JSON.stringify({
        dedupeByClientGeneratedToken: false,
        message: {
          body: { text: messageText },
          renderContentUnions: [],
        },
        hostRecipientUrns: [`urn:li:fsd_profile:${memberId}`],
      }),
    });

    if (dashResp.ok || dashResp.status === 201) {
      console.log('[LMH] Message sent via dash API!');
      return;
    }
    const errText = await dashResp.text();
    errors.push(`dash ${dashResp.status}: ${errText.slice(0, 300)}`);
    console.warn(`[LMH] Dash API failed: ${dashResp.status}`, errText.slice(0, 300));
  } catch (e) {
    errors.push(`dash error: ${e.message}`);
    console.warn('[LMH] Dash API error:', e);
  }

  throw new Error(`Send failed: ${errors.join(' | ')}`);
}

// ── Profile extraction ─────────────────────────────────────────────
function extractProfileData() {
  const name =
    document.querySelector('.text-heading-xlarge')?.textContent?.trim() ||
    document.querySelector('h1')?.textContent?.trim() ||
    '';

  const headline =
    document.querySelector('.text-body-medium.break-words')?.textContent?.trim() ||
    document.querySelector('[data-generated-suggestion-target]')?.textContent?.trim() ||
    '';

  const location =
    document.querySelector('.text-body-small.inline.t-black--light.break-words')
      ?.textContent?.trim() || '';

  const about =
    document.querySelector('#about ~ .display-flex .inline-show-more-text')
      ?.textContent?.trim() ||
    document
      .querySelector(
        '[data-generated-suggestion-target="urn:li:fsu_profileActionDelegate"]'
      )
      ?.textContent?.trim() ||
    '';

  const experienceItems = [];
  const expSection = document.getElementById('experience');
  if (expSection) {
    const expContainer = expSection.closest('section');
    if (expContainer) {
      expContainer.querySelectorAll('.artdeco-list__item').forEach((item) => {
        const title =
          item.querySelector('.mr1.t-bold span[aria-hidden="true"]')?.textContent?.trim() || '';
        const company =
          item.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim() || '';
        if (title || company) experienceItems.push({ title, company });
      });
    }
  }

  const educationItems = [];
  const eduSection = document.getElementById('education');
  if (eduSection) {
    const eduContainer = eduSection.closest('section');
    if (eduContainer) {
      eduContainer.querySelectorAll('.artdeco-list__item').forEach((item) => {
        const school =
          item.querySelector('.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]')?.textContent?.trim() || '';
        const degree =
          item.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim() || '';
        if (school) educationItems.push({ school, degree });
      });
    }
  }

  const skills = [];
  const skillSection = document.getElementById('skills');
  if (skillSection) {
    const skillContainer = skillSection.closest('section');
    if (skillContainer) {
      skillContainer.querySelectorAll('.mr1.t-bold span[aria-hidden="true"]').forEach((item) => {
        const skill = item.textContent?.trim();
        if (skill) skills.push(skill);
      });
    }
  }

  // ── Mutual connections ───────────────────────────────────────────
  const mutualConnections = extractMutualConnections();

  return {
    name,
    headline,
    location,
    about,
    experience: experienceItems.slice(0, 3),
    education: educationItems.slice(0, 2),
    skills: skills.slice(0, 10),
    mutualConnections,
  };
}

function extractMutualConnections() {
  const result = { count: 0, names: [] };

  // Get the full visible page text — this is the most reliable way to
  // find the mutual connections line regardless of DOM structure.
  const pageText = document.body.innerText || '';

  // Find the line containing "mutual connection" — LinkedIn shows:
  // "Roi Sagiv, Elik Rozenboim, and 377 other mutual connections"
  // or: "42 mutual connections"
  const lines = pageText.split('\n');
  let mutualLine = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (/mutual\s+connection/i.test(trimmed)) {
      mutualLine = trimmed;
      break;
    }
  }

  if (!mutualLine) return result;

  // Store the raw line for debugging
  result.rawLine = mutualLine;

  // Pattern A: "Name1, Name2, and 377 other mutual connections"
  const multiNameMatch = mutualLine.match(/(.+?),?\s+and\s+(\d+)\s+other\s+mutual\s+connection/i);
  if (multiNameMatch) {
    const namesPart = multiNameMatch[1];
    const otherCount = parseInt(multiNameMatch[2], 10);
    const names = namesPart.split(/,\s*/).map((n) => n.trim()).filter((n) => n.length > 1);
    result.names = [...new Set(names)].slice(0, 5);
    result.count = otherCount + result.names.length;
    return result;
  }

  // Pattern B: "Name and 52 other mutual connections"
  const singleNameMatch = mutualLine.match(/(.+?)\s+and\s+(\d+)\s+other\s+mutual\s+connection/i);
  if (singleNameMatch) {
    const name = singleNameMatch[1].trim();
    const otherCount = parseInt(singleNameMatch[2], 10);
    if (name.length > 1) result.names.push(name);
    result.count = otherCount + result.names.length;
    return result;
  }

  // Pattern C: "42 mutual connections" (no names)
  const directMatch = mutualLine.match(/(\d+)\s+mutual\s+connection/i);
  if (directMatch) {
    result.count = parseInt(directMatch[1], 10);
    return result;
  }

  return result;
}

// ── Full mutual-connections scraping (LinkedIn Voyager API) ────────
// Returns { names: string[] | null, debug: object }
async function scrapeFullMutualConnections(onProgress) {
  const debug = { step: 'init' };

  // 1. Find the mutual connections link to extract the profile URN
  const link = [...document.querySelectorAll('a')].find(
    (a) => a.href && /mutual\s+connection/i.test(a.textContent)
  );

  if (!link?.href) {
    debug.step = 'no-link-found';
    console.log('[LMH] scrapeFullMutualConnections: no mutual connection link found');
    return { names: null, debug };
  }

  debug.href = link.href;

  // 2. Extract the profile URN from the URL (facetConnectionOf param)
  const urnMatch = link.href.match(/facetConnectionOf=%22([^%"&]+)%22/)
    || link.href.match(/facetConnectionOf=([^&"]+)/);

  if (!urnMatch) {
    debug.step = 'no-urn-in-url';
    return { names: null, debug };
  }

  let profileUrn = decodeURIComponent(urnMatch[1]).replace(/"/g, '');
  // Ensure we have the full URN — the dash API needs urn:li:fsd_profile: prefix
  if (!profileUrn.startsWith('urn:')) {
    profileUrn = `urn:li:fsd_profile:${profileUrn}`;
  }
  debug.profileUrn = profileUrn;

  // 3. Get CSRF token (needed for Voyager API calls)
  const csrfToken = getCsrfToken();
  debug.hasCsrfToken = !!csrfToken;

  if (!csrfToken) {
    debug.step = 'no-csrf-token';
    debug.cookieNames = document.cookie.split(';').map((c) => c.trim().split('=')[0]);
    return { names: null, debug };
  }

  // 4. Call LinkedIn Voyager search API with pagination to get ALL results.
  //
  // The dash API query format is undocumented — the parameter names and URN
  // format vary between LinkedIn versions.  We probe several variations
  // with count=1, compare the returned paging.total to the expected mutual
  // connection count, and pick the best match.
  const PAGE_SIZE = 49;
  const nameToUrn = new Map(); // name → profile URN
  let start = 0;
  let pagingTotal = 0;
  debug.pages = 0;

  // Extract raw ID (without urn: prefix) for variations that need it
  const rawId = profileUrn.replace(/^urn:li:fsd_profile:/, '');
  const encodedUrn = encodeURIComponent(profileUrn);
  const expectedCount = profileData?.mutualConnections?.count || 0;

  // Probe multiple query parameter variations to find the one that
  // actually filters to mutual connections (paging total ≈ expected count).
  const baseUrl = 'https://www.linkedin.com/voyager/api/search/dash/clusters'
    + '?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-175'
    + '&origin=MEMBER_PROFILE_CANNED_SEARCH&q=all';
  const queryVariations = [
    { label: 'facet+rawId',      qp: `facetConnectionOf:List(${rawId}),facetNetwork:List(F),resultType:List(PEOPLE)` },
    { label: 'facet+urn',        qp: `facetConnectionOf:List(${encodedUrn}),facetNetwork:List(F),resultType:List(PEOPLE)` },
    { label: 'noFacet+rawId',    qp: `connectionOf:List(${rawId}),network:List(F),resultType:List(PEOPLE)` },
    { label: 'noFacet+urn',      qp: `connectionOf:List(${encodedUrn}),network:List(F),resultType:List(PEOPLE)` },
  ];

  let bestVariation = queryVariations[0]; // fallback
  try {
    console.log(`[LMH] Probing ${queryVariations.length} query variations (expected ~${expectedCount} mutual connections)…`);
    const probeResults = await Promise.all(queryVariations.map(async (v) => {
      const url = `${baseUrl}&query=(flagshipSearchIntent:SEARCH_SRP,queryParameters:(${v.qp}))&count=1&start=0`;
      try {
        const r = await fetch(url, {
          headers: { 'csrf-token': csrfToken, 'accept': 'application/vnd.linkedin.normalized+json+2.1', 'x-restli-protocol-version': '2.0.0' },
          credentials: 'include',
        });
        if (!r.ok) return { ...v, total: -1, status: r.status };
        const d = await r.json();
        const total = d.data?.paging?.total ?? d.paging?.total ?? -1;
        return { ...v, total, status: r.status };
      } catch (e) {
        return { ...v, total: -1, error: e.message };
      }
    }));
    for (const pr of probeResults) {
      console.log(`[LMH]   ${pr.label}: total=${pr.total} (status=${pr.status})`);
    }
    debug.probeResults = probeResults.map(p => ({ label: p.label, total: p.total }));

    // Pick the variation whose total is closest to expectedCount (and > 0)
    if (expectedCount > 0) {
      let bestDiff = Infinity;
      for (const pr of probeResults) {
        if (pr.total <= 0) continue;
        const diff = Math.abs(pr.total - expectedCount);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestVariation = pr;
        }
      }
    }
    console.log(`[LMH] Best variation: ${bestVariation.label} (total=${bestVariation.total})`);
  } catch (probeErr) {
    console.warn('[LMH] Probe failed, using default variation:', probeErr);
  }

  try {
    do {
      const apiUrl = `${baseUrl}`
        + `&query=(flagshipSearchIntent:SEARCH_SRP,queryParameters:(${bestVariation.qp}))`
        + `&count=${PAGE_SIZE}&start=${start}`;

      if (start === 0) {
        debug.apiUrl = apiUrl;
        debug.queryVariation = bestVariation.label;
        console.log('[LMH] API URL:', apiUrl);
      }

      console.log(`[LMH] Fetching page ${debug.pages + 1}, start=${start}, names so far=${nameToUrn.size}`);
      if (onProgress) onProgress(nameToUrn.size, debug.pages + 1);

      const resp = await fetch(apiUrl, {
        headers: {
          'csrf-token': csrfToken,
          'accept': 'application/vnd.linkedin.normalized+json+2.1',
          'x-restli-protocol-version': '2.0.0',
        },
        credentials: 'include',
      });

      debug.status = resp.status;

      if (!resp.ok) {
        debug.step = 'api-error';
        const errText = await resp.text();
        debug.errorBody = errText.slice(0, 1000);
        console.warn(`[LMH] API error on page ${debug.pages + 1}: ${resp.status}`);
        if (nameToUrn.size > 0) break;
        return { names: null, debug };
      }

      const data = await resp.json();
      debug.hasIncluded = Array.isArray(data.included);
      debug.pages++;

      // Get paging total from first page
      if (debug.pages === 1 && data.data?.paging?.total) {
        pagingTotal = data.data.paging.total;
        debug.pagingTotal = pagingTotal;
        const expectedCount = profileData?.mutualConnections?.count || '?';
        console.log(`[LMH] Paging total: ${pagingTotal} (expected ~${expectedCount} mutual connections)`);
      }

      // Log first page structure for debugging
      if (debug.pages === 1) {
        if (Array.isArray(data.included) && data.included.length > 0) {
          // Collect all unique $type values to understand entity types
          const types = {};
          for (const item of data.included) {
            const t = item.$type || item['$recipeType'] || 'unknown';
            types[t] = (types[t] || 0) + 1;
          }
          console.log('[LMH] ENTITY TYPES:', JSON.stringify(types));

          // Dump one item of each type
          const seenTypes = new Set();
          for (const item of data.included) {
            const t = item.$type || item['$recipeType'] || 'unknown';
            if (!seenTypes.has(t)) {
              seenTypes.add(t);
              console.log(`[LMH] SAMPLE ${t}:`, JSON.stringify(item).slice(0, 2000));
            }
          }
        }
        // Dump first element from data.data.elements
        const elems = data?.data?.elements;
        if (Array.isArray(elems) && elems.length > 0) {
          console.log('[LMH] ELEMENT 0:', JSON.stringify(elems[0]).slice(0, 3000));
        }
      }

      const prevSize = nameToUrn.size;

      // ── Extract names + profile URNs from LinkedIn's normalized JSON ──
      // The response has two parts:
      //   data.included[] — flat entity store (profiles, text, images, etc.)
      //   data.data.elements[] — search result clusters referencing included entities

      if (Array.isArray(data.included)) {
        // Build entity map: entityUrn → entity
        const entityMap = {};
        for (const item of data.included) {
          const key = item.entityUrn || item['$id'];
          if (key) entityMap[key] = item;
        }

        // Helper: extract fsd_profile URN from an entity
        function extractProfileUrn(item) {
          if (!item) return null;
          // Check all string values on the item for an fsd_profile URN
          for (const val of Object.values(item)) {
            if (typeof val === 'string') {
              const m = val.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/);
              if (m) return `urn:li:fsd_profile:${m[1]}`;
            }
          }
          // Deep check: stringify the item and regex for fsd_profile
          const str = JSON.stringify(item);
          const m = str.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/);
          if (m) return `urn:li:fsd_profile:${m[1]}`;
          return null;
        }

        // Strategy 1: Direct firstName + lastName on included items
        for (const item of data.included) {
          let name = null;
          if (item.firstName && item.lastName) name = `${item.firstName} ${item.lastName}`;
          else if (item.localizedFirstName && item.localizedLastName) name = `${item.localizedFirstName} ${item.localizedLastName}`;
          if (name) {
            const urn = extractProfileUrn(item);
            nameToUrn.set(name, urn || nameToUrn.get(name) || null);
          }
        }

        // Strategy 2: Find EntityResult items → resolve title → get text + URN
        for (const item of data.included) {
          const type = item.$type || item['$recipeType'] || '';
          if (/EntityResult|SearchResult/i.test(type)) {
            let name = null;
            if (item.title?.text) name = item.title.text;
            else if (item['*title'] && entityMap[item['*title']]) name = entityMap[item['*title']].text;
            else if (item.title && typeof item.title === 'string') name = item.title;

            if (name && typeof name === 'string' && name.trim().length > 1) {
              name = name.trim();
              const urn = extractProfileUrn(item);
              nameToUrn.set(name, urn || nameToUrn.get(name) || null);
            }
          }
        }

        // Strategy 3: Walk data.data.elements for names embedded in the result tree
        const clusters = data?.data?.elements || [];
        for (const cluster of clusters) {
          const items = cluster.items || [];
          for (const entry of items) {
            const result = entry.item?.entityResult || entry.entityResult || entry;
            let name = null;
            if (result?.title?.text) name = result.title.text.trim();
            else if (result?.['*title'] && entityMap[result['*title']]) name = entityMap[result['*title']].text?.trim();

            if (name && name.length > 1) {
              const urn = extractProfileUrn(result);
              nameToUrn.set(name, urn || nameToUrn.get(name) || null);
            }
          }
        }

        // Strategy 4: If still nothing, items with /in/ nav URL + title.text
        if (nameToUrn.size === prevSize) {
          for (const item of data.included) {
            const navUrl = item.navigationUrl || item.url || '';
            if (navUrl.includes('/in/') && item.title?.text) {
              const name = item.title.text.trim();
              const urn = extractProfileUrn(item);
              nameToUrn.set(name, urn || nameToUrn.get(name) || null);
            }
          }
        }
      }

      const newNames = nameToUrn.size - prevSize;
      const withUrns = [...nameToUrn.values()].filter(Boolean).length;
      console.log(`[LMH] Page ${debug.pages}: +${newNames} names (total: ${nameToUrn.size}, ${withUrns} with URNs)`);
      // On first page, log a sample entry
      if (debug.pages === 1 && nameToUrn.size > 0) {
        const [sampleName, sampleUrn] = [...nameToUrn.entries()][0];
        console.log(`[LMH] Sample: "${sampleName}" → ${sampleUrn}`);
      }

      start += PAGE_SIZE;

      // Safety cap
      if (debug.pages >= 40) {
        console.log('[LMH] Hit safety cap of 40 pages');
        break;
      }

    } while (start < pagingTotal);

    debug.step = 'done';
    debug.namesFound = nameToUrn.size;
    const urnCount = [...nameToUrn.values()].filter(Boolean).length;
    console.log(`[LMH] Done: ${nameToUrn.size} names (${urnCount} with URNs) across ${debug.pages} pages`);

    return { names: nameToUrn.size > 0 ? [...nameToUrn.keys()] : null, nameToUrn, debug };
  } catch (e) {
    debug.step = 'error';
    debug.error = e.message;
    console.error('[LMH] scrapeFullMutualConnections error:', e);
    if (nameToUrn.size > 0) {
      debug.namesFound = nameToUrn.size;
      return { names: [...nameToUrn.keys()], nameToUrn, debug };
    }
    return { names: null, debug };
  }
}

/** Extract CSRF token from meta tag or JSESSIONID cookie. */
function getCsrfToken() {
  // Try meta tag first (most reliable)
  const meta = document.querySelector('meta[name="csrf-token"]')?.content;
  if (meta) return meta;

  // Fallback: JSESSIONID cookie
  const match = document.cookie.match(/JSESSIONID="?([^";]+)"?/);
  return match ? match[1] : null;
}


// ── Message generation (AI calls) ──────────────────────────────────
async function generateMessages({ profileData, tones, apiKey, apiProvider, aiModel, userBackground, language }) {
  const profileSummary = buildProfileSummary(profileData);

  // Build a lookup from active tones
  const toneDescMap = {};
  activeTones.forEach((t) => { toneDescMap[t.value] = t.description; });

  const toneInstructions = tones
    .map((t) => `- ${toneDescMap[t] || t}`)
    .join('\n');

  const userPrompt = `Here is the LinkedIn profile of the person I want to message:

${profileSummary}

Please generate exactly ${tones.length} message option(s), one for each of these tones:
${toneInstructions}

Requirements:
- Each message should be concise (2-4 sentences max)
- Incorporate specific details from their profile where relevant to make messages feel personal${userBackground ? '\n- Naturally tie in my background — the message should make it clear why I\'m reaching out based on who I am and what I do' : ''}${profileData.mutualConnections?.count > 0 ? '\n- We have mutual connections — when appropriate, mention or reference our shared network to build trust and credibility. If specific mutual connection names are listed, you may naturally reference them (e.g. "I noticed we\'re both connected with [Name]")' : ''}
- Messages should motivate the recipient to respond
- Keep messages natural — avoid sounding like a template or bot
- Do not use generic flattery${language && language !== 'english' ? `\n- IMPORTANT: Write the ENTIRE message in ${language}, including translating all names, titles, company names, and technical terms. The whole response must be fully in ${language} with no English words.` : ''}

Respond in this exact JSON format only, with no other text:
[{"tone": "tone_name", "text": "message text"}, ...]`;

  const systemPrompt = userBackground
    ? `${SYSTEM_PROMPT} The sender has provided their background: "${userBackground}". Incorporate this naturally into the messages — the outreach should clearly relate to the sender's role, industry, or goals.`
    : SYSTEM_PROMPT;

  // Store prompts + debug data for QA inspection
  lastPrompts = { system: systemPrompt, user: userPrompt, mutualRaw: profileData.mutualConnections };

  const defaultModel = apiProvider === 'openai' ? 'gpt-5.2' : 'claude-sonnet-4-20250514';
  const model = aiModel || defaultModel;

  if (apiProvider === 'openai') {
    return callOpenAI(apiKey, userPrompt, systemPrompt, model);
  }
  return callAnthropic(apiKey, userPrompt, systemPrompt, model);
}

function buildProfileSummary(profile) {
  if (!profile) return 'No profile data available.';

  let summary = '';
  if (profile.name) summary += `Name: ${profile.name}\n`;
  if (profile.headline) summary += `Headline: ${profile.headline}\n`;
  if (profile.location) summary += `Location: ${profile.location}\n`;
  if (profile.about) summary += `About: ${profile.about}\n`;

  if (profile.experience?.length > 0) {
    summary += `\nRecent Experience:\n`;
    profile.experience.forEach((exp) => {
      summary += `- ${exp.title}${exp.company ? ` at ${exp.company}` : ''}\n`;
    });
  }

  if (profile.education?.length > 0) {
    summary += `\nEducation:\n`;
    profile.education.forEach((edu) => {
      summary += `- ${edu.school}${edu.degree ? ` (${edu.degree})` : ''}\n`;
    });
  }

  if (profile.skills?.length > 0) {
    summary += `\nKey Skills: ${profile.skills.join(', ')}\n`;
  }

  if (profile.mutualConnections?.count > 0) {
    summary += `\nMutual Connections: ${profile.mutualConnections.count} shared connection(s)`;
    if (profile.mutualConnections.names?.length > 0) {
      summary += `, including: ${profile.mutualConnections.names.join(', ')}`;
    }
    summary += '\n';
  }

  return summary || 'No profile data available.';
}

async function callOpenAI(apiKey, userPrompt, systemPrompt, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_completion_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return parseMessagesJSON(content);
}

async function callAnthropic(apiKey, userPrompt, systemPrompt, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  return parseMessagesJSON(content);
}

function parseMessagesJSON(content) {
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response. Please try again.');
  }

  const messages = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('No messages generated. Please try again.');
  }

  return messages.map((m) => ({
    tone: m.tone || 'unknown',
    text: m.text || '',
  }));
}

// ── Message insertion ──────────────────────────────────────────────
function insertMessage(text) {
  const messageInput = document.querySelector(
    '.msg-form__contenteditable[contenteditable="true"]'
  );
  if (messageInput) {
    setContentEditableText(messageInput, text);
    return;
  }

  const composeInput = document.querySelector(
    '.msg-overlay-conversation-bubble .msg-form__contenteditable'
  );
  if (composeInput) {
    setContentEditableText(composeInput, text);
    return;
  }

  const fallbackInput = document.querySelector(
    '[role="textbox"][contenteditable="true"]'
  );
  if (fallbackInput) {
    setContentEditableText(fallbackInput, text);
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showNotification('Message copied to clipboard! Paste it in the chat.');
  });
}

function setContentEditableText(element, text) {
  element.focus();
  element.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = text;
  element.appendChild(p);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  showNotification('Message inserted!');
}

// ── Notification toast ─────────────────────────────────────────────
function showNotification(text) {
  const notification = document.createElement('div');
  notification.className = 'lmh-notification';
  notification.textContent = text;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 2500);
}

// ── Async helpers ──────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForElement(selector, timeout = 3000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// ── Utility ────────────────────────────────────────────────────────
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
