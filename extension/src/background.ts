import { getAuthToken, setAuthToken } from './lib/auth';
import type { GuideRequest, GuideResponse } from '../../shared/types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

// ── Session store (survives page navigation) ──────────────────────────────────
interface ActiveSession {
  goal: string;
  sessionId: string;
  completedSteps: string[];
  tabId: number;
  active: boolean;
}
const sessions = new Map<number, ActiveSession>();

// ── Panel ports (real-time status) ───────────────────────────────────────────
const panelPorts: chrome.runtime.Port[] = [];

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'wf-panel') return;
  panelPorts.push(port);
  port.onDisconnect.addListener(() => {
    const idx = panelPorts.indexOf(port);
    if (idx !== -1) panelPorts.splice(idx, 1);
  });
});

function broadcastToPanel(msg: object) {
  panelPorts.forEach((p) => { try { p.postMessage(msg); } catch { /* closed */ } });
}

// ── Tab navigation → resume session automatically ────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const session = sessions.get(tabId);
  if (!session?.active) return;

  // Give content script a moment to initialise then resume
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, {
      type: 'WF_RESUME',
      goal: session.goal,
      sessionId: session.sessionId,
      completedSteps: session.completedSteps,
    }).catch(() => {
      // Content script not ready yet — retry once
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {
          type: 'WF_RESUME',
          goal: session.goal,
          sessionId: session.sessionId,
          completedSteps: session.completedSteps,
        }).catch(() => {});
      }, 1000);
    });
  }, 600);
});

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
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png', quality: 80 });
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      // ── Start session (from panel/popup) ──
      if (msg.type === 'WF_START') {
        const tabId = msg.tabId as number;
        const sessionId = crypto.randomUUID();
        sessions.set(tabId, { goal: msg.goal, sessionId, completedSteps: [], tabId, active: true });
        broadcastToPanel({ type: 'WF_STATUS', status: 'thinking', message: 'Starting…', goal: msg.goal, stepIndex: 1 });
        // Forward to content script on that tab
        await chrome.tabs.sendMessage(tabId, {
          type: 'WF_RESUME',
          goal: msg.goal,
          sessionId,
          completedSteps: [],
        });
        sendResponse({ ok: true });
      }

      // ── Stop session ──
      else if (msg.type === 'WF_STOP') {
        const tabId = msg.tabId as number;
        const session = sessions.get(tabId);
        if (session) session.active = false;
        await chrome.tabs.sendMessage(tabId, { type: 'WF_STOP' }).catch(() => {});
        broadcastToPanel({ type: 'WF_STATUS', status: 'idle', message: '' });
        sendResponse({ ok: true });
      }

      // ── Next step (from content script) ──
      else if (msg.type === 'WF_NEXT_STEP') {
        const tabId = sender.tab?.id;
        if (!tabId) throw new Error('No tab');

        broadcastToPanel({ type: 'WF_STATUS', status: 'thinking', message: 'Analyzing page…', stepIndex: msg.payload.completedSteps.length + 1 });

        const screenshot = await captureScreenshot(tabId);
        const result = await callGuideAPI({ ...msg.payload, screenshot });

        // Update stored session's completed steps
        const session = sessions.get(tabId);
        if (session) session.completedSteps = msg.payload.completedSteps;

        // Handle navigate action — background drives it so content script death doesn't matter
        if (result.action === 'navigate' && result.value) {
          const url = result.value;
          broadcastToPanel({
            type: 'WF_STATUS', status: 'guiding',
            message: result.explanation,
            action: 'navigate',
            latencyMs: result.latencyMs,
            stepIndex: msg.payload.completedSteps.length + 1,
          });
          // Tell content to show a brief toast, then navigate
          chrome.tabs.sendMessage(tabId, { type: 'WF_NAVIGATING', url, explanation: result.explanation }).catch(() => {});
          setTimeout(() => chrome.tabs.update(tabId, { url }), 1200);
          sendResponse({ ok: true, data: { ...result, _handled: true } });
          return;
        }

        broadcastToPanel({
          type: 'WF_STATUS',
          status: result.done ? 'done' : 'guiding',
          message: result.explanation,
          action: result.action,
          latencyMs: result.latencyMs,
          stepIndex: msg.payload.completedSteps.length + 1,
        });

        if (result.done && session) session.active = false;

        sendResponse({ ok: true, data: result });
      }

      // ── Step completed (content → update session) ──
      else if (msg.type === 'WF_STEP_DONE') {
        const tabId = sender.tab?.id;
        if (tabId) {
          const session = sessions.get(tabId);
          if (session) session.completedSteps = msg.completedSteps as string[];
        }
        broadcastToPanel({ type: 'WF_STATUS', status: 'step-done', message: msg.stepDescription, stepIndex: msg.stepIndex });
        sendResponse({ ok: true });
      }

      // ── Status relay (content → panel) ──
      else if (msg.type === 'WF_STATUS') {
        broadcastToPanel(msg);
        sendResponse({ ok: true });
      }

      // ── Ping ──
      else if (msg.type === 'WF_PING') {
        const token = await getAuthToken();
        sendResponse({ ok: true, authenticated: !!token });
      }

      // ── Open side panel ──
      else if (msg.type === 'WF_OPEN_PANEL') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
        sendResponse({ ok: true });
      }

    } catch (err) {
      broadcastToPanel({ type: 'WF_STATUS', status: 'error', message: (err as Error).message });
      sendResponse({ ok: false, error: (err as Error).message });
    }
  })();
  return true;
});

// Token handoff from Next.js auth page
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'WF_SET_TOKEN' && msg.token) {
    setAuthToken(msg.token as string).then(() => sendResponse({ ok: true }));
    return true;
  }
});
