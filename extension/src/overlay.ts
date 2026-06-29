import type { Action } from '../../shared/types';

export interface OverlayOptions {
  selector: string;
  action: Action;
  explanation: string;
  value?: string;
  confidence: number;
  fallbackCoordinates?: { x: number; y: number };
  onAdvance: (stepDescription: string) => void;
}

const OVERLAY_ID = 'wayfinder-overlay-root';

// Actions the user must perform manually (can't detect completion via DOM events)
const MANUAL_ACTIONS = new Set<Action>(['drag', 'scroll', 'wait', 'navigate']);

// Tags that mean "we didn't really find a specific target"
const USELESS_TAGS = new Set(['BODY', 'HTML', 'DIV']);

export function removeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

export function injectOverlay(opts: OverlayOptions) {
  removeOverlay();

  // Ensure explanation is always a string
  const explanation = opts.explanation?.trim() || 'Follow the step shown in the panel.';

  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  document.body.appendChild(root);

  // ── Locate the target element ──────────────────────────────────────────────
  let target: HTMLElement | null = null;

  if (opts.selector) {
    try {
      target = document.querySelector<HTMLElement>(opts.selector);
    } catch {
      logEdgeCase('invalid-selector', opts.selector, explanation);
    }
  }

  // Fallback to coordinates if selector missed
  if (!target && opts.fallbackCoordinates) {
    const el = document.elementFromPoint(opts.fallbackCoordinates.x, opts.fallbackCoordinates.y) as HTMLElement | null;
    // Don't treat body/html/generic wrappers as real targets
    if (el && !USELESS_TAGS.has(el.tagName)) {
      target = el;
    } else {
      logEdgeCase('elementFromPoint-useless', opts.selector, explanation);
    }
  }

  if (!target) {
    logEdgeCase('no-target', opts.selector, explanation);
  }

  // ── Decide display mode ────────────────────────────────────────────────────
  const needsManualCard = MANUAL_ACTIONS.has(opts.action) || !target;

  // Always show pulse ring if we have a target (even for drag — highlights where to drag)
  if (target) {
    drawPulseRing(root, target);
  }

  if (needsManualCard) {
    // Show instruction card; user presses "I did it" or it auto-advances (wait)
    showInstructionCard(root, { ...opts, explanation }, target !== null);
  } else {
    // Normal mode: tooltip + DOM event listener
    drawTooltip(root, target!, explanation, opts.action, opts.value);
    const cleanup = attachActionListener(target!, opts, opts.onAdvance);

    const observer = new MutationObserver(() => {
      if (!document.body.contains(target!)) {
        cleanup();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// ── Pulse ring ────────────────────────────────────────────────────────────────
function drawPulseRing(root: HTMLElement, target: HTMLElement) {
  const rect = target.getBoundingClientRect();

  const style = document.createElement('style');
  style.textContent = `@keyframes wf-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.04);opacity:0.85} }`;
  root.appendChild(style);

  const ring = document.createElement('div');
  ring.style.cssText = `
    position:fixed;
    top:${rect.top - 6}px; left:${rect.left - 6}px;
    width:${rect.width + 12}px; height:${rect.height + 12}px;
    border:3px solid #22c55e; border-radius:10px;
    box-shadow:0 0 0 6px rgba(34,197,94,0.25), 0 0 30px rgba(34,197,94,0.6);
    pointer-events:none; z-index:2147483646;
    animation:wf-pulse 1.4s ease-in-out infinite;
  `;
  root.appendChild(ring);
}

// ── Tooltip (normal clickable actions) ────────────────────────────────────────
function drawTooltip(root: HTMLElement, target: HTMLElement, text: string, action: string, value?: string) {
  const rect = target.getBoundingClientRect();

  const verbs: Record<string, string> = {
    click: 'Click',
    type: `Type "${value ?? ''}"`,
    select: `Select "${value ?? ''}"`,
  };

  const tooltip = document.createElement('div');
  tooltip.innerHTML = `
    <div style="font-weight:700;font-size:13px;color:#22c55e;margin-bottom:4px">${verbs[action] ?? 'Do this'}</div>
    <div style="font-size:14px;color:#0f172a;line-height:1.4">${escapeHtml(text)}</div>
  `;

  const placeAbove = rect.top > 120;
  tooltip.style.cssText = `
    position:fixed;
    ${placeAbove ? `bottom:${window.innerHeight - rect.top + 14}px` : `top:${rect.bottom + 14}px`};
    left:${Math.max(12, Math.min(rect.left, window.innerWidth - 320))}px;
    max-width:300px; background:white;
    border:2px solid #22c55e; border-radius:12px;
    padding:12px 16px; font-family:system-ui,-apple-system,sans-serif;
    box-shadow:0 12px 40px rgba(0,0,0,0.15);
    z-index:2147483647; pointer-events:none;
  `;
  root.appendChild(tooltip);
}

// ── Instruction card (manual / no-target actions) ─────────────────────────────
const ACTION_META: Record<string, { icon: string; verb: string; autoAdvanceMs?: number }> = {
  drag:     { icon: '🖱',  verb: 'Drag on screen' },
  scroll:   { icon: '↕',  verb: 'Scroll the page' },
  wait:     { icon: '⏳', verb: 'Waiting…', autoAdvanceMs: 2500 },
  navigate: { icon: '🔗', verb: 'Navigating…', autoAdvanceMs: 1500 },
  click:    { icon: '👆', verb: 'Click the element' },
  type:     { icon: '⌨',  verb: 'Type in the field' },
  select:   { icon: '☑',  verb: 'Select the option' },
};

function showInstructionCard(
  root: HTMLElement,
  opts: OverlayOptions & { explanation: string },
  hasRing: boolean
) {
  const meta = ACTION_META[opts.action] ?? { icon: '👆', verb: opts.action };
  const isAuto = meta.autoAdvanceMs !== undefined;

  const card = document.createElement('div');
  card.innerHTML = `
    <div style="font-size:28px;margin-bottom:8px">${meta.icon}</div>
    <div style="font-weight:700;font-size:13px;color:#22c55e;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">
      ${meta.verb}
    </div>
    <div style="font-size:14px;color:#0f172a;line-height:1.5;margin-bottom:${isAuto ? '0' : '14px'}">
      ${escapeHtml(opts.explanation)}
    </div>
    ${hasRing ? '<div style="font-size:11px;color:#64748b;margin-top:6px;margin-bottom:' + (isAuto ? '0' : '12px') + '">↑ follow the green ring</div>' : ''}
    ${!isAuto ? `<button id="wf-done-btn" style="
      display:block;width:100%;
      background:#22c55e;color:white;border:none;
      padding:10px;border-radius:8px;
      font:600 13px system-ui;cursor:pointer;
      transition:background 0.15s;
    ">I did it →</button>` : ''}
  `;

  card.style.cssText = `
    position:fixed;
    top:20px; left:50%; transform:translateX(-50%);
    background:white; border:2px solid #22c55e; border-radius:16px;
    padding:20px 24px; text-align:center;
    min-width:260px; max-width:360px;
    font-family:system-ui,-apple-system,sans-serif;
    box-shadow:0 20px 60px rgba(0,0,0,0.2);
    z-index:2147483647;
  `;

  root.appendChild(card);

  if (isAuto) {
    setTimeout(() => opts.onAdvance(`${opts.action}: ${opts.explanation}`), meta.autoAdvanceMs);
  } else {
    const btn = root.querySelector<HTMLButtonElement>('#wf-done-btn');
    btn?.addEventListener('click', () => {
      opts.onAdvance(`${opts.action}: ${opts.explanation}`);
    });
    btn?.addEventListener('mouseenter', () => { if (btn) btn.style.background = '#16a34a'; });
    btn?.addEventListener('mouseleave', () => { if (btn) btn.style.background = '#22c55e'; });
  }
}

// ── Action listener (click / type / select) ───────────────────────────────────
function attachActionListener(
  target: HTMLElement,
  opts: OverlayOptions,
  onAdvance: (desc: string) => void
): () => void {
  if (opts.action === 'click') {
    const handler = () => onAdvance(`Clicked ${opts.selector || 'element'}: ${opts.explanation}`);
    target.addEventListener('click', handler, { once: true, capture: true });
    return () => target.removeEventListener('click', handler, true);
  }

  if (opts.action === 'type') {
    const handler = () => {
      if ((target as HTMLInputElement).value.length > 0) {
        onAdvance(`Typed into ${opts.selector || 'field'}`);
      }
    };
    target.addEventListener('blur', handler, { once: true });
    return () => target.removeEventListener('blur', handler);
  }

  if (opts.action === 'select') {
    const handler = () => onAdvance(`Selected option in ${opts.selector || 'dropdown'}`);
    target.addEventListener('change', handler, { once: true });
    return () => target.removeEventListener('change', handler);
  }

  // Fallback: auto-advance after 2s for anything unhandled
  const t = setTimeout(() => onAdvance(`${opts.action} on ${opts.selector}`), 2000);
  return () => clearTimeout(t);
}

// ── Edge case logging ─────────────────────────────────────────────────────────
function logEdgeCase(reason: string, selector: string, explanation: string) {
  // Visible in DevTools → Extensions → Service Worker console
  console.warn(`[Wayfinder edge-case] ${reason}`, { selector, explanation, url: location.href });
  // Also send to background so it appears in panel error log
  chrome.runtime.sendMessage({
    type: 'WF_STATUS',
    status: 'edge-case',
    message: `Couldn't locate element (${reason}). Showing manual card.`,
    detail: { reason, selector, url: location.href },
  }).catch(() => {});
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
