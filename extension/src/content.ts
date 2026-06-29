import { extractInteractiveDOM } from './lib/dom-extract';
import { injectOverlay, removeOverlay } from './overlay';

interface SessionState {
  active: boolean;
  goal: string;
  sessionId: string;
  completedSteps: string[];
}

const state: SessionState = {
  active: false,
  goal: '',
  sessionId: '',
  completedSteps: [],
};

async function captureAndGuide() {
  if (!state.active) return;

  const domSnapshot = extractInteractiveDOM(document);

  const response = await chrome.runtime.sendMessage({
    type: 'WF_NEXT_STEP',
    payload: {
      goal: state.goal,
      sessionId: state.sessionId,
      completedSteps: state.completedSteps,
      domSnapshot,
      url: window.location.href,
    },
  });

  if (!response?.ok) {
    console.error('[Wayfinder]', response?.error);
    showThinkingIndicator(false);
    return;
  }

  showThinkingIndicator(false);

  const { selector, action, explanation, value, done, confidence, fallbackCoordinates } =
    response.data;

  if (done) {
    showSuccessToast('Goal complete!');
    state.active = false;
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
      state.completedSteps.push(stepDescription);
      removeOverlay();
      waitForSettle(800).then(captureAndGuide);
    },
  });
}

function waitForSettle(minDelay: number): Promise<void> {
  return new Promise((resolve) => {
    let lastMutation = Date.now();
    const observer = new MutationObserver(() => {
      lastMutation = Date.now();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    const check = () => {
      if (Date.now() - lastMutation > 300) {
        observer.disconnect();
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    setTimeout(check, minDelay);
  });
}

let thinkingEl: HTMLElement | null = null;

function showThinkingIndicator(show: boolean) {
  if (show) {
    if (thinkingEl) return;
    thinkingEl = document.createElement('div');
    thinkingEl.textContent = '🧭 Wayfinder is thinking…';
    thinkingEl.style.cssText = `
      position: fixed; bottom: 80px; right: 24px;
      background: #0f172a; color: #94a3b8;
      padding: 10px 18px; border-radius: 10px;
      font: 500 13px system-ui;
      z-index: 2147483647;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(thinkingEl);
  } else {
    thinkingEl?.remove();
    thinkingEl = null;
  }
}

function showSuccessToast(text: string) {
  const toast = document.createElement('div');
  toast.textContent = `🎉 ${text}`;
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px;
    background: #16a34a; color: white;
    padding: 16px 24px; border-radius: 12px;
    font: 600 16px system-ui;
    z-index: 2147483647;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Delay before showing "thinking" to avoid flash on fast responses
let thinkingTimeout: ReturnType<typeof setTimeout> | null = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'WF_START') {
    state.active = true;
    state.goal = msg.goal as string;
    state.sessionId = crypto.randomUUID();
    state.completedSteps = [];
    thinkingTimeout = setTimeout(() => showThinkingIndicator(true), 500);
    captureAndGuide();
  } else if (msg.type === 'WF_STOP') {
    state.active = false;
    removeOverlay();
    showThinkingIndicator(false);
    if (thinkingTimeout) clearTimeout(thinkingTimeout);
  }
});
