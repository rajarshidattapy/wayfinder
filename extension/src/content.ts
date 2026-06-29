import { extractInteractiveDOM } from './lib/dom-extract';
import { injectOverlay, removeOverlay } from './overlay';

// State is minimal — background is the source of truth
let active = false;
let goal = '';
let sessionId = '';
let completedSteps: string[] = [];

function sendStatus(status: string, message?: string, extra?: object) {
  chrome.runtime.sendMessage({ type: 'WF_STATUS', status, message, ...extra }).catch(() => {});
}

async function captureAndGuide() {
  if (!active) return;

  sendStatus('thinking', 'Analyzing page…', { stepIndex: completedSteps.length + 1 });
  showThinkingIndicator(true);

  const domSnapshot = extractInteractiveDOM(document);

  const response = await chrome.runtime.sendMessage({
    type: 'WF_NEXT_STEP',
    payload: { goal, sessionId, completedSteps, domSnapshot, url: window.location.href },
  });

  showThinkingIndicator(false);

  if (!response?.ok) {
    sendStatus('error', response?.error ?? 'Unknown error');
    return;
  }

  // navigate action is handled entirely by background — just show toast here
  if (response.data?._handled) return;

  const { selector, action, explanation, value, done, confidence, fallbackCoordinates } = response.data;

  if (done) {
    sendStatus('done', 'Goal complete!', { stepIndex: completedSteps.length });
    showSuccessToast('Goal complete!');
    active = false;
    removeOverlay();
    return;
  }

  injectOverlay({
    selector,
    action,
    explanation,
    value,
    confidence,
    fallbackCoordinates,
    onAdvance: (stepDescription: string) => {
      completedSteps.push(stepDescription);
      // Tell background to update its copy and notify panel
      chrome.runtime.sendMessage({
        type: 'WF_STEP_DONE',
        stepDescription,
        stepIndex: completedSteps.length,
        completedSteps: [...completedSteps],
      }).catch(() => {});
      removeOverlay();
      waitForSettle(400).then(() => { if (active) captureAndGuide(); });
    },
  });
}

function waitForSettle(minDelay: number): Promise<void> {
  return new Promise((resolve) => {
    let lastMutation = Date.now();
    const observer = new MutationObserver(() => { lastMutation = Date.now(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const check = () => {
      if (Date.now() - lastMutation > 300) { observer.disconnect(); resolve(); }
      else setTimeout(check, 100);
    };
    setTimeout(check, minDelay);
  });
}

// ── Indicators ────────────────────────────────────────────────────────────────
let thinkingEl: HTMLElement | null = null;
let thinkingTimeout: ReturnType<typeof setTimeout> | null = null;

function showThinkingIndicator(show: boolean) {
  if (show) {
    thinkingTimeout = setTimeout(() => {
      if (thinkingEl) return;
      thinkingEl = document.createElement('div');
      thinkingEl.textContent = '🧭 Analyzing…';
      thinkingEl.style.cssText = `
        position:fixed;bottom:80px;right:24px;
        background:#0f172a;color:#94a3b8;
        padding:10px 18px;border-radius:10px;
        font:500 13px system-ui;z-index:2147483647;
        box-shadow:0 4px 20px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(thinkingEl);
    }, 500);
  } else {
    if (thinkingTimeout) { clearTimeout(thinkingTimeout); thinkingTimeout = null; }
    thinkingEl?.remove(); thinkingEl = null;
  }
}

function showNavigatingToast(_url: string, explanation: string) {
  const toast = document.createElement('div');
  toast.innerHTML = `<strong style="color:#22c55e">Navigating →</strong><br><span style="font-size:12px;opacity:0.8">${escapeHtml(explanation)}</span>`;
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;
    background:#0f172a;color:white;
    padding:14px 20px;border-radius:12px;
    font:500 14px system-ui;z-index:2147483647;
    box-shadow:0 10px 40px rgba(0,0,0,0.3);
    max-width:280px;line-height:1.5;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showSuccessToast(text: string) {
  const toast = document.createElement('div');
  toast.textContent = `🎉 ${text}`;
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;
    background:#16a34a;color:white;
    padding:16px 24px;border-radius:12px;
    font:600 16px system-ui;z-index:2147483647;
    box-shadow:0 10px 40px rgba(0,0,0,0.2);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(s: string) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  // Resume (called on every page load by background if session is active)
  if (msg.type === 'WF_RESUME') {
    active = true;
    goal = msg.goal as string;
    sessionId = msg.sessionId as string;
    completedSteps = (msg.completedSteps as string[]) ?? [];
    captureAndGuide();
  }

  // Stop
  if (msg.type === 'WF_STOP') {
    active = false;
    removeOverlay();
    showThinkingIndicator(false);
  }

  // Navigate toast (background is about to redirect the tab)
  if (msg.type === 'WF_NAVIGATING') {
    showThinkingIndicator(false);
    removeOverlay();
    showNavigatingToast(msg.url as string, msg.explanation as string);
  }
});
