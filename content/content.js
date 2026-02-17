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

  // Background: open the mutual-connections modal, scrape the full list,
  // then update profileData so it's ready when the user clicks Generate.
  if (profileData.mutualConnections?.count > 0) {
    const mutualEl = panel.querySelector('.lmh-profile-mutual');
    if (mutualEl) {
      mutualEl.textContent += ' (loading full list…)';
    }

    scrapeFullMutualConnections().then(({ names: fullNames, debug }) => {
      // Store debug info for QA panel
      profileData.mutualConnections.fetchDebug = debug;

      const el = document.querySelector('#lmh-panel .lmh-profile-mutual');
      const count = profileData.mutualConnections.count;

      if (fullNames && fullNames.length > 0) {
        profileData.mutualConnections.names = fullNames;
        if (el) {
          el.textContent = `${count} mutual connection${count !== 1 ? 's' : ''}: ${fullNames.join(', ')}`;
        }
      } else {
        // Remove loading indicator, show existing names
        const existingNames = profileData.mutualConnections.names;
        if (el) {
          el.textContent = `${count} mutual connection${count !== 1 ? 's' : ''}${existingNames.length > 0 ? ': ' + existingNames.join(', ') : ''} (full list fetch: ${debug.step})`;
        }
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
async function scrapeFullMutualConnections() {
  const debug = { step: 'init' };

  // 1. Find the mutual connections link to extract the profile URN
  const link = [...document.querySelectorAll('a')].find(
    (a) => a.href && /mutual\s+connection/i.test(a.textContent)
  );

  if (!link?.href) {
    debug.step = 'no-link-found';
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

  const profileUrn = decodeURIComponent(urnMatch[1]).replace(/"/g, '');
  debug.profileUrn = profileUrn;

  // 3. Get CSRF token (needed for Voyager API calls)
  const csrfToken = getCsrfToken();
  debug.hasCsrfToken = !!csrfToken;

  if (!csrfToken) {
    debug.step = 'no-csrf-token';
    debug.cookieNames = document.cookie.split(';').map((c) => c.trim().split('=')[0]);
    return { names: null, debug };
  }

  // 4. Call LinkedIn Voyager search API (same request the SPA makes)
  const apiUrl = `https://www.linkedin.com/voyager/api/search/dash/clusters`
    + `?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-175`
    + `&origin=MEMBER_PROFILE_CANNED_SEARCH&q=all`
    + `&query=(flagshipSearchIntent:SEARCH_SRP,queryParameters:`
    + `(facetConnectionOf:List(${profileUrn}),facetNetwork:List(F),resultType:List(PEOPLE)))`
    + `&count=49&start=0`;

  debug.apiUrl = apiUrl;

  try {
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
      return { names: null, debug };
    }

    const data = await resp.json();
    debug.step = 'parsing';
    debug.hasIncluded = Array.isArray(data.included);
    debug.includedCount = data.included?.length || 0;

    const names = new Set();

    // Strategy 1: included[] profiles with firstName + lastName
    if (Array.isArray(data.included)) {
      for (const item of data.included) {
        if (item.firstName && item.lastName) {
          names.add(`${item.firstName} ${item.lastName}`);
        }
      }
    }

    if (names.size > 0) {
      debug.strategy = 'included-firstLast';
    }

    // Strategy 2: Walk JSON tree for title.text patterns
    if (names.size === 0) {
      collectNamesFromJSON(data, names);
      if (names.size > 0) debug.strategy = 'title-text';
    }

    // Strategy 3: Regex on stringified JSON for firstName/lastName
    if (names.size === 0) {
      const jsonStr = JSON.stringify(data);
      const re = /"firstName":"([^"]+)","lastName":"([^"]+)"/g;
      let m;
      while ((m = re.exec(jsonStr)) !== null) {
        names.add(`${m[1]} ${m[2]}`);
      }
      if (names.size > 0) debug.strategy = 'regex-firstLast';
    }

    if (names.size === 0) {
      debug.strategy = 'none-matched';
      debug.jsonSnippet = JSON.stringify(data).slice(0, 3000);
    }

    debug.namesFound = names.size;
    debug.step = 'done';

    return { names: names.size > 0 ? [...names].slice(0, 40) : null, debug };
  } catch (e) {
    debug.step = 'error';
    debug.error = e.message;
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

/** Recursively walk a JSON tree looking for {title:{text:"Name"}} patterns. */
function collectNamesFromJSON(obj, names, depth = 0) {
  if (depth > 15 || names.size >= 50 || !obj || typeof obj !== 'object') return;

  if (obj.title && typeof obj.title === 'object' && typeof obj.title.text === 'string') {
    const text = obj.title.text.trim();
    if (isSearchResultName(text)) {
      names.add(text);
    }
  }

  const values = Array.isArray(obj) ? obj : Object.values(obj);
  for (const val of values) {
    collectNamesFromJSON(val, names, depth + 1);
  }
}

/** Filter out non-name strings from LinkedIn search results (subtitles, CTAs). */
function isSearchResultName(text) {
  return (
    text.length > 2 &&
    text.length < 80 &&
    text.includes(' ') &&
    !/^\d/.test(text) &&                        // "395 mutual connections"
    !/mutual\s+connection/i.test(text) &&        // subtitle
    !/\d+\s*K?\s*follower/i.test(text) &&        // "9K followers"
    !/^Search\s+with/i.test(text) &&             // "Search with Sales Navigator"
    !/^View\s+my/i.test(text) &&                 // "View my services"
    !/^Try\s/i.test(text) &&                     // "Try Premium"
    !/^Get\s+introduced/i.test(text)             // CTA text
  );
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
