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
  fab.title = 'Generate LinkedIn message suggestions';
  fab.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white"/>
      <path d="M9 11H7V9H9V11ZM13 11H11V9H13V11ZM17 11H15V9H17V11Z" fill="#0a66c2"/>
    </svg>
  `;
  fab.addEventListener('click', togglePanel);
  document.body.appendChild(fab);
}

// ── Panel ──────────────────────────────────────────────────────────
function togglePanel() {
  if (panelOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

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
          ${profile.mutualConnections?.count > 0 ? `<div class="lmh-profile-mutual">${profile.mutualConnections.count} mutual connection${profile.mutualConnections.count !== 1 ? 's' : ''}${profile.mutualConnections.names.length > 0 ? ': ' + escapeHTML(profile.mutualConnections.names.join(', ')) : ''}</div>` : ''}
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

      <div class="lmh-section">
        <div class="lmh-section-label">Context <span class="lmh-optional">(optional)</span></div>
        <textarea id="lmh-context" class="lmh-textarea" placeholder="e.g. 'I want to discuss a job opportunity' or 'We met at a conference'..." rows="2"></textarea>
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

    const context = panel.querySelector('#lmh-context').value.trim();
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
        context,
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
      closeModal();
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
    const mutualDebug = lastPrompts.mutualRaw
      ? JSON.stringify(lastPrompts.mutualRaw, null, 2)
      : '{ "count": 0, "names": [] }';
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
    const copyData = { mutual: mutualDebug, system: lastPrompts.system, user: lastPrompts.user };
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
  const mutualTestPattern = /(?:mutual|shared)\s+connection/i;

  // ── 1. Find the element that contains "mutual connection" text ────
  let mutualElement = null;

  for (const el of document.querySelectorAll('*')) {
    const text = el.textContent?.trim() || '';
    // Only match small elements to avoid huge parent containers
    if (text.length < 200 && mutualTestPattern.test(text)) {
      mutualElement = el;
      break;
    }
  }

  if (!mutualElement) return result;

  // ── 2. Extract count ──────────────────────────────────────────────
  // LinkedIn often splits "32" and "mutual connections" into separate
  // child elements, so the combined textContent has the count even if
  // no single text node does. Walk up a couple levels to find it.
  let countSource = mutualElement;
  for (let i = 0; i < 3 && countSource; i++) {
    const text = countSource.textContent?.trim() || '';
    const countMatch = text.match(/(\d+)\s+(?:mutual|shared)\s+connection/i);
    if (countMatch) {
      result.count = parseInt(countMatch[1], 10);
      break;
    }
    countSource = countSource.parentElement;
  }

  // ── 3. Extract mutual connection names ────────────────────────────
  // Walk up only 2 levels from the mutual element — just enough to
  // reach the container with avatars, not the whole profile header.
  let container = mutualElement;
  for (let i = 0; i < 2; i++) {
    if (container.parentElement) container = container.parentElement;
  }

  // Filter function: does this string look like a real person's name?
  function isPersonName(str) {
    if (!str || str.length < 3 || str.length > 60) return false;
    // Must have at least 2 words (first + last name)
    if (str.split(/\s+/).length < 2) return false;
    // Reject obvious non-names
    const lower = str.toLowerCase();
    const rejectPatterns = [
      'photo', 'image', 'logo', 'linkedin', 'graphic',
      'alternative', 'description', 'view', 'like',
      'follow', 'message', 'connect', 'pending', 'connection',
      'mutual', 'shared', 'profile',
    ];
    return !rejectPatterns.some((p) => lower.includes(p));
  }

  // Strategy A: img alt attributes (avatar thumbnails near mutual section)
  container.querySelectorAll('img[alt]').forEach((img) => {
    const alt = img.alt?.trim();
    if (isPersonName(alt)) {
      result.names.push(alt);
    }
  });

  // Strategy B: aria-label on links
  container.querySelectorAll('a[aria-label]').forEach((a) => {
    const label = a.getAttribute('aria-label')?.trim();
    if (isPersonName(label)) {
      result.names.push(label);
    }
  });

  // Strategy C: title attributes on links
  container.querySelectorAll('a[title]').forEach((a) => {
    const title = a.getAttribute('title')?.trim();
    if (isPersonName(title)) {
      result.names.push(title);
    }
  });

  // Deduplicate, clean, and limit
  result.names = [...new Set(result.names)].slice(0, 5);

  return result;
}

// ── Message generation (AI calls) ──────────────────────────────────
async function generateMessages({ profileData, tones, context, apiKey, apiProvider, aiModel, userBackground, language }) {
  const profileSummary = buildProfileSummary(profileData);

  // Build a lookup from active tones
  const toneDescMap = {};
  activeTones.forEach((t) => { toneDescMap[t.value] = t.description; });

  const toneInstructions = tones
    .map((t) => `- ${toneDescMap[t] || t}`)
    .join('\n');

  const backgroundBlock = userBackground
    ? `\nAbout me (the sender):\n${userBackground}\n`
    : '';

  const userPrompt = `Here is the LinkedIn profile of the person I want to message:

${profileSummary}
${backgroundBlock}
${context ? `Additional context: ${context}\n` : ''}
Please generate exactly ${tones.length} message option(s), one for each of these tones:
${toneInstructions}

Requirements:
- Each message should be concise (2-4 sentences max)
- Incorporate specific details from their profile where relevant to make messages feel personal${userBackground ? '\n- Naturally tie in my background — the message should make it clear why I\'m reaching out based on who I am and what I do' : ''}${profileData.mutualConnections?.count > 0 ? '\n- We have mutual connections — when appropriate, mention or reference our shared network to build trust and credibility. If specific mutual connection names are listed, you may naturally reference them (e.g. "I noticed we\'re both connected with [Name]")' : ''}
- Messages should motivate the recipient to respond
- Keep messages natural — avoid sounding like a template or bot
- Do not use generic flattery${language && language !== 'english' ? `\n- IMPORTANT: Write all message texts in ${language}` : ''}

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

// ── Utility ────────────────────────────────────────────────────────
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
