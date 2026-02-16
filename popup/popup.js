const SYSTEM_PROMPT = `You are an expert LinkedIn marketer and you now help to create a few options of messages to send to the current user. The messages should sound natural and motivate the users to respond.`;

document.addEventListener('DOMContentLoaded', async () => {
  const generateBtn = document.getElementById('generate-btn');
  const loadingEl = document.getElementById('loading');
  const resultsEl = document.getElementById('results');
  const messagesContainer = document.getElementById('messages-container');
  const errorEl = document.getElementById('error');
  const errorMessage = document.getElementById('error-message');
  const settingsLink = document.getElementById('settings-link');
  const notLinkedIn = document.getElementById('not-linkedin');
  const mainContent = document.getElementById('main-content');
  const profileNameEl = document.getElementById('profile-name');
  const profileHeadlineEl = document.getElementById('profile-headline');
  const profileLocationEl = document.getElementById('profile-location');

  let profileData = null;

  // Check if we're on LinkedIn
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isLinkedIn = tab?.url?.includes('linkedin.com/in/');

  if (!isLinkedIn) {
    notLinkedIn.classList.remove('hidden');
    mainContent.classList.add('hidden');
    return;
  }

  // Extract profile data from the page
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractProfileData,
    });
    profileData = result.result;
    if (profileData) {
      profileNameEl.textContent = profileData.name || 'Unknown';
      profileHeadlineEl.textContent = profileData.headline || '';
      profileLocationEl.textContent = profileData.location || '';
    }
  } catch (e) {
    profileNameEl.textContent = 'Could not extract profile';
    console.error('Profile extraction failed:', e);
  }

  // Settings link
  settingsLink.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Generate messages
  generateBtn.addEventListener('click', async () => {
    const selectedTones = Array.from(
      document.querySelectorAll('input[name="tone"]:checked')
    ).map((el) => el.value);

    if (selectedTones.length === 0) {
      showError('Please select at least one message tone.');
      return;
    }

    const context = document.getElementById('context-input').value.trim();

    // Get API key from storage
    const { apiKey, apiProvider } = await chrome.storage.sync.get([
      'apiKey',
      'apiProvider',
    ]);

    if (!apiKey) {
      showError('API key not configured. Please set it in the extension settings.');
      return;
    }

    generateBtn.disabled = true;
    loadingEl.classList.remove('hidden');
    resultsEl.classList.add('hidden');
    errorEl.classList.add('hidden');

    try {
      const messages = await generateMessages({
        profileData,
        tones: selectedTones,
        context,
        apiKey,
        apiProvider: apiProvider || 'openai',
      });

      displayMessages(messages);
    } catch (err) {
      showError(err.message || 'Failed to generate messages. Please try again.');
    } finally {
      generateBtn.disabled = false;
      loadingEl.classList.add('hidden');
    }
  });

  function showError(msg) {
    errorMessage.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function displayMessages(messages) {
    messagesContainer.innerHTML = '';
    resultsEl.classList.remove('hidden');

    messages.forEach((msg) => {
      const card = document.createElement('div');
      card.className = 'message-card';

      const tag = document.createElement('div');
      tag.className = 'message-tone-tag';
      tag.textContent = msg.tone;

      const text = document.createElement('div');
      text.className = 'message-text';
      text.textContent = msg.text;

      const actions = document.createElement('div');
      actions.className = 'message-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(msg.text);
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 2000);
      });

      const useBtn = document.createElement('button');
      useBtn.className = 'use-btn';
      useBtn.textContent = 'Insert in Chat';
      useBtn.addEventListener('click', async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'insertMessage',
            text: msg.text,
          });
        } catch {
          // Content script might not be loaded; use scripting API
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: insertMessageIntoChat,
            args: [msg.text],
          });
        }
      });

      actions.appendChild(copyBtn);
      actions.appendChild(useBtn);
      card.appendChild(tag);
      card.appendChild(text);
      card.appendChild(actions);
      messagesContainer.appendChild(card);
    });
  }
});

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

  // Extract experience
  const experienceItems = [];
  const expSection = document.getElementById('experience');
  if (expSection) {
    const expContainer = expSection.closest('section');
    if (expContainer) {
      const items = expContainer.querySelectorAll('.artdeco-list__item');
      items.forEach((item) => {
        const title =
          item
            .querySelector('.mr1.t-bold span[aria-hidden="true"]')
            ?.textContent?.trim() || '';
        const company =
          item
            .querySelector('.t-14.t-normal span[aria-hidden="true"]')
            ?.textContent?.trim() || '';
        if (title || company) {
          experienceItems.push({ title, company });
        }
      });
    }
  }

  // Extract education
  const educationItems = [];
  const eduSection = document.getElementById('education');
  if (eduSection) {
    const eduContainer = eduSection.closest('section');
    if (eduContainer) {
      const items = eduContainer.querySelectorAll('.artdeco-list__item');
      items.forEach((item) => {
        const school =
          item
            .querySelector('.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]')
            ?.textContent?.trim() || '';
        const degree =
          item
            .querySelector('.t-14.t-normal span[aria-hidden="true"]')
            ?.textContent?.trim() || '';
        if (school) {
          educationItems.push({ school, degree });
        }
      });
    }
  }

  // Extract skills
  const skills = [];
  const skillSection = document.getElementById('skills');
  if (skillSection) {
    const skillContainer = skillSection.closest('section');
    if (skillContainer) {
      const items = skillContainer.querySelectorAll(
        '.mr1.t-bold span[aria-hidden="true"]'
      );
      items.forEach((item) => {
        const skill = item.textContent?.trim();
        if (skill) skills.push(skill);
      });
    }
  }

  return {
    name,
    headline,
    location,
    about,
    experience: experienceItems.slice(0, 3),
    education: educationItems.slice(0, 2),
    skills: skills.slice(0, 10),
  };
}

function insertMessageIntoChat(text) {
  // Try to find LinkedIn message input
  const messageInput = document.querySelector(
    '.msg-form__contenteditable[contenteditable="true"]'
  );
  if (messageInput) {
    messageInput.focus();
    messageInput.textContent = text;
    messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // Fallback: try the compose message area
  const composeInput = document.querySelector(
    '[role="textbox"][contenteditable="true"]'
  );
  if (composeInput) {
    composeInput.focus();
    composeInput.textContent = text;
    composeInput.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // Last resort: copy to clipboard
  navigator.clipboard.writeText(text);
}

async function generateMessages({ profileData, tones, context, apiKey, apiProvider }) {
  const profileSummary = buildProfileSummary(profileData);
  const toneDescriptions = {
    friendly: 'Friendly and warm - casual, approachable, like reaching out to a friend',
    professional:
      'Professional and formal - business-oriented, polished, respectful of their time',
    question:
      'Asking an engaging question - curiosity-driven, opens dialogue by asking something relevant',
    complimentary:
      "Complimentary - genuinely praises their work or achievements, not over-the-top",
    networking:
      'Networking-focused - building mutual connections, finding common ground',
    collaboration:
      'Collaboration-oriented - proposing to work together on something specific',
  };

  const toneInstructions = tones
    .map((t) => `- ${toneDescriptions[t] || t}`)
    .join('\n');

  const userPrompt = `Here is the LinkedIn profile of the person I want to message:

${profileSummary}

${context ? `Additional context: ${context}\n` : ''}
Please generate exactly ${tones.length} message option(s), one for each of these tones:
${toneInstructions}

Requirements:
- Each message should be concise (2-4 sentences max)
- Incorporate specific details from their profile where relevant to make messages feel personal
- Messages should motivate the recipient to respond
- Keep messages natural — avoid sounding like a template or bot
- Do not use generic flattery

Respond in this exact JSON format only, with no other text:
[{"tone": "tone_name", "text": "message text"}, ...]`;

  if (apiProvider === 'openai') {
    return callOpenAI(apiKey, userPrompt);
  } else {
    return callAnthropic(apiKey, userPrompt);
  }
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

  return summary || 'No profile data available.';
}

async function callOpenAI(apiKey, userPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 1024,
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

async function callAnthropic(apiKey, userPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.error?.message || `Anthropic API error: ${response.status}`
    );
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  return parseMessagesJSON(content);
}

function parseMessagesJSON(content) {
  // Extract JSON from response (handle markdown code blocks)
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
