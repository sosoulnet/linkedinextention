// Listen for messages from the popup to insert text into LinkedIn chat
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'insertMessage') {
    insertMessage(message.text);
    sendResponse({ success: true });
  }
  return true;
});

function insertMessage(text) {
  // Try the messaging compose area
  const messageInput = document.querySelector(
    '.msg-form__contenteditable[contenteditable="true"]'
  );
  if (messageInput) {
    setContentEditableText(messageInput, text);
    return;
  }

  // Try generic contenteditable in messaging overlay
  const composeInput = document.querySelector(
    '.msg-overlay-conversation-bubble .msg-form__contenteditable'
  );
  if (composeInput) {
    setContentEditableText(composeInput, text);
    return;
  }

  // Fallback: any visible contenteditable textbox
  const fallbackInput = document.querySelector(
    '[role="textbox"][contenteditable="true"]'
  );
  if (fallbackInput) {
    setContentEditableText(fallbackInput, text);
    return;
  }

  // Last resort: copy to clipboard and notify
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Message copied to clipboard! Paste it in the chat.');
  });
}

function setContentEditableText(element, text) {
  element.focus();

  // Clear existing content
  element.innerHTML = '';

  // Create a paragraph with the text (LinkedIn uses <p> tags)
  const p = document.createElement('p');
  p.textContent = text;
  element.appendChild(p);

  // Dispatch events to trigger LinkedIn's internal handlers
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  showNotification('Message inserted!');
}

function showNotification(text) {
  const notification = document.createElement('div');
  notification.textContent = text;
  Object.assign(notification.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    background: '#057642',
    color: 'white',
    padding: '12px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    zIndex: '10000',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'opacity 0.3s ease',
  });

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 2500);
}
