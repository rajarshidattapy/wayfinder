import { getAuthToken, setAuthToken } from './lib/auth';
import type { GuideRequest, GuideResponse } from '../../shared/types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

// ── Panel port management ─────────────────────────────────────────────────────
const panelPorts: chrome.runtime.Port[] = [];

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'wf-panel') {
    panelPorts.push(port);
    port.onDisconnect.addListener(() => {
      const idx = panelPorts.indexOf(port);
      if (idx !== -1) panelPorts.splice(idx, 1);
    });
  }
});

function broadcastToPanel(msg: object) {
  panelPorts.forEach((p) => {
    try { p.postMessage(msg); } catch { /* panel closed */ }
  });
}

// ── API call ──────────────────────────────────────────────────────────────────
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
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'WF_NEXT_STEP') {
        const tabId = sender.tab?.id;
        if (!tabId) throw new Error('No tab');

        broadcastToPanel({ type: 'WF_STATUS', status: 'thinking', message: 'Analyzing page…' });

        const screenshot = await captureScreenshot(tabId);
        const result = await callGuideAPI({ ...msg.payload, screenshot });

        broadcastToPanel({
          type: 'WF_STATUS',
          status: 'guiding',
          message: result.explanation,
          action: result.action,
          latencyMs: result.latencyMs,
          stepIndex: (msg.payload.completedSteps?.length ?? 0) + 1,
        });

        sendResponse({ ok: true, data: result });

      } else if (msg.type === 'WF_PING') {
        const token = await getAuthToken();
        sendResponse({ ok: true, authenticated: !!token });

      } else if (msg.type === 'WF_STATUS') {
        // Content script broadcasting a status update (start, done, stop, error)
        broadcastToPanel(msg);
        sendResponse({ ok: true });

      } else if (msg.type === 'WF_OPEN_PANEL') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.windowId) {
          await chrome.sidePanel.open({ windowId: tab.windowId });
        }
        sendResponse({ ok: true });
      }
    } catch (err) {
      broadcastToPanel({
        type: 'WF_STATUS',
        status: 'error',
        message: (err as Error).message,
      });
      sendResponse({ ok: false, error: (err as Error).message });
    }
  })();
  return true;
});

// Receive token from Next.js auth page
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'WF_SET_TOKEN' && msg.token) {
    setAuthToken(msg.token as string).then(() => sendResponse({ ok: true }));
    return true;
  }
});
