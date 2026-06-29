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

export function removeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

export function injectOverlay(opts: OverlayOptions) {
  removeOverlay();

  let target = document.querySelector<HTMLElement>(opts.selector);

  if (!target && opts.fallbackCoordinates) {
    target = document.elementFromPoint(
      opts.fallbackCoordinates.x,
      opts.fallbackCoordinates.y
    ) as HTMLElement | null;
  }

  if (!target) {
    console.warn('[Wayfinder] Target not found:', opts.selector);
    showFloatingHint(opts.explanation);
    return;
  }

  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  document.body.appendChild(root);

  drawPulseRing(root, target);
  drawTooltip(root, target, opts.explanation, opts.action, opts.value);

  const cleanup = attachActionListener(target, opts, opts.onAdvance);

  const observer = new MutationObserver(() => {
    if (!document.body.contains(target!)) {
      cleanup();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function drawPulseRing(root: HTMLElement, target: HTMLElement) {
  const rect = target.getBoundingClientRect();

  const style = document.createElement('style');
  style.textContent = `
    @keyframes wf-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.04); opacity: 0.85; }
    }
  `;
  root.appendChild(style);

  const ring = document.createElement('div');
  ring.style.cssText = `
    position: fixed;
    top: ${rect.top - 6}px;
    left: ${rect.left - 6}px;
    width: ${rect.width + 12}px;
    height: ${rect.height + 12}px;
    border: 3px solid #22c55e;
    border-radius: 10px;
    box-shadow: 0 0 0 6px rgba(34,197,94,0.25), 0 0 30px rgba(34,197,94,0.6);
    pointer-events: none;
    z-index: 2147483646;
    animation: wf-pulse 1.4s ease-in-out infinite;
  `;
  root.appendChild(ring);
}

function drawTooltip(
  root: HTMLElement,
  target: HTMLElement,
  text: string,
  action: string,
  value?: string
) {
  const rect = target.getBoundingClientRect();

  const actionVerb: Record<string, string> = {
    click: 'Click',
    type: `Type "${value ?? ''}"`,
    select: `Select "${value ?? ''}"`,
    scroll: 'Scroll to',
    wait: 'Waiting…',
  };

  const tooltip = document.createElement('div');
  tooltip.innerHTML = `
    <div style="font-weight:700;font-size:13px;color:#22c55e;margin-bottom:4px;">
      ${actionVerb[action] ?? 'Do this'}
    </div>
    <div style="font-size:14px;color:#0f172a;line-height:1.4;">
      ${escapeHtml(text)}
    </div>
  `;

  const placeAbove = rect.top > 120;
  tooltip.style.cssText = `
    position: fixed;
    ${placeAbove ? `bottom: ${window.innerHeight - rect.top + 14}px` : `top: ${rect.bottom + 14}px`};
    left: ${Math.max(12, Math.min(rect.left, window.innerWidth - 320))}px;
    max-width: 300px;
    background: white;
    border: 2px solid #22c55e;
    border-radius: 12px;
    padding: 12px 16px;
    font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 12px 40px rgba(0,0,0,0.15);
    z-index: 2147483647;
    pointer-events: none;
  `;
  root.appendChild(tooltip);
}

function attachActionListener(
  target: HTMLElement,
  opts: OverlayOptions,
  onAdvance: (desc: string) => void
): () => void {
  if (opts.action === 'click') {
    const handler = () => onAdvance(`Clicked ${opts.selector}: ${opts.explanation}`);
    target.addEventListener('click', handler, { once: true, capture: true });
    return () => target.removeEventListener('click', handler, true);
  }

  if (opts.action === 'type') {
    const handler = () => {
      if ((target as HTMLInputElement).value.length > 0) {
        onAdvance(`Typed into ${opts.selector}`);
      }
    };
    target.addEventListener('blur', handler, { once: true });
    return () => target.removeEventListener('blur', handler);
  }

  const timeout = setTimeout(() => onAdvance('Waited'), 2000);
  return () => clearTimeout(timeout);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function showFloatingHint(text: string) {
  const hint = document.createElement('div');
  hint.textContent = `⚠ ${text}`;
  hint.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #fbbf24; color: #1e293b;
    padding: 12px 20px; border-radius: 10px;
    font: 600 14px system-ui;
    z-index: 2147483647;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  `;
  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 4000);
}
