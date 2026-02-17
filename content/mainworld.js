// LinkedIn Message Helper — MAIN world script
// This runs in the page's own JS context (not the extension's isolated world),
// so fetch calls go through LinkedIn's service workers and include all
// necessary auth headers automatically.

(function () {
  'use strict';

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'lmh-send-message') return;

    const { cbId, recipientId, fsdId, messageText } = event.data;

    try {
      // Get CSRF token from cookie (page context has direct access)
      const csrfMatch = document.cookie.match(/JSESSIONID="?([^";]+)"?/);
      const csrf = csrfMatch ? csrfMatch[1] : null;
      if (!csrf) {
        window.postMessage({ type: cbId, ok: false, error: 'No CSRF token in cookies' }, '*');
        return;
      }

      // Build headers — let LinkedIn's service workers add x-li-track etc.
      const hdrs = {
        'csrf-token': csrf,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'content-type': 'application/json; charset=UTF-8',
        'x-restli-protocol-version': '2.0.0',
      };

      const mc = {
        body: messageText,
        attributedBody: { text: messageText, attributes: [] },
        attachments: [],
      };
      const eventCreate = {
        eventCreate: {
          value: { 'com.linkedin.voyager.messaging.create.MessageCreate': mc },
        },
      };

      // Build strategy list
      const strategies = [];

      // Strategy 1: urn:li:member:numericId (if numeric)
      if (/^\d+$/.test(recipientId)) {
        strategies.push({
          label: 'memberUrn',
          url: '/voyager/api/messaging/conversations?action=create',
          body: JSON.stringify({
            keyVersion: 'LEGACY_INBOX',
            conversationCreate: {
              ...eventCreate,
              recipients: ['urn:li:member:' + recipientId],
              subtype: 'MEMBER_TO_MEMBER',
            },
          }),
        });
      }

      // Strategy 2: raw recipientId
      strategies.push({
        label: 'legacy(' + recipientId + ')',
        url: '/voyager/api/messaging/conversations?action=create',
        body: JSON.stringify({
          keyVersion: 'LEGACY_INBOX',
          conversationCreate: {
            ...eventCreate,
            recipients: [recipientId],
            subtype: 'MEMBER_TO_MEMBER',
          },
        }),
      });

      // Strategy 3: miniProfile URN
      strategies.push({
        label: 'miniProfile',
        url: '/voyager/api/messaging/conversations?action=create',
        body: JSON.stringify({
          keyVersion: 'LEGACY_INBOX',
          conversationCreate: {
            ...eventCreate,
            recipients: ['urn:li:fs_miniProfile:' + fsdId],
            subtype: 'MEMBER_TO_MEMBER',
          },
        }),
      });

      // Strategy 4: Dash API with fsd_profile
      strategies.push({
        label: 'dash(fsd)',
        url: '/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage',
        body: JSON.stringify({
          dedupeByClientGeneratedToken: false,
          message: {
            body: { text: messageText, attributes: [] },
            renderContentUnions: [],
          },
          hostRecipientUrns: ['urn:li:fsd_profile:' + fsdId],
        }),
      });

      // Strategy 5: Dash API with member URN
      if (/^\d+$/.test(recipientId)) {
        strategies.push({
          label: 'dash(member)',
          url: '/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage',
          body: JSON.stringify({
            dedupeByClientGeneratedToken: false,
            message: {
              body: { text: messageText, attributes: [] },
              renderContentUnions: [],
            },
            hostRecipientUrns: ['urn:li:member:' + recipientId],
          }),
        });
      }

      const errs = [];
      for (const s of strategies) {
        try {
          console.log('[LMH-MW] Trying ' + s.label + '…');
          const resp = await fetch(s.url, {
            method: 'POST',
            headers: hdrs,
            credentials: 'include',
            body: s.body,
          });
          if (resp.ok || resp.status === 201) {
            console.log('[LMH-MW] Message sent via ' + s.label + '!');
            window.postMessage({ type: cbId, ok: true }, '*');
            return;
          }
          const t = await resp.text();
          console.warn('[LMH-MW] ' + s.label + ' failed:', resp.status, t.slice(0, 200));
          errs.push(s.label + ' ' + resp.status + ': ' + t.slice(0, 200));
        } catch (ex) {
          errs.push(s.label + ' err: ' + ex.message);
        }
      }

      window.postMessage({ type: cbId, ok: false, error: errs.join(' | ') }, '*');
    } catch (e) {
      window.postMessage({ type: cbId, ok: false, error: e.message }, '*');
    }
  });

  console.log('[LMH-MW] Main world messaging script loaded');
})();
