import { getAuthToken, setAuthToken } from './lib/auth';
import type { GuideRequest, GuideResponse } from '../../shared/types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

async function callGuideAPI(payload: GuideRequest): Promise<GuideResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/guide`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Guide API ${res.status}: ${text}`);
  }

  return res.json();
}

async function captureScreenshot(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.windowId) throw new Error('No window');
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
    quality: 80,
  });
  // Strip data URI prefix — API wants raw base64
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'WF_NEXT_STEP') {
        const tabId = sender.tab?.id;
        if (!tabId) throw new Error('No tab');

        const screenshot = await captureScreenshot(tabId);
        const result = await callGuideAPI({ ...msg.payload, screenshot });
        sendResponse({ ok: true, data: result });
      } else if (msg.type === 'WF_PING') {
        const token = await getAuthToken();
        sendResponse({ ok: true, authenticated: !!token });
      }
    } catch (err) {
      sendResponse({ ok: false, error: (err as Error).message });
    }
  })();
  return true; // keep async channel open
});

// Receive token from Next.js auth page via externally_connectable
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'WF_SET_TOKEN' && msg.token) {
    setAuthToken(msg.token as string).then(() => sendResponse({ ok: true }));
    return true;
  }
});
