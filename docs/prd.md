# Wayfinder — PRD.md
**AI GPS for Complex Software**
*Next.js + Chrome Extension Architecture*
*Cerebras Hackathon — Paramarsh Labs*

---

## 0. North Star

> "Deploy my FastAPI app on AWS."
> → A pulsing green arrow appears over the right button. The user clicks. The arrow moves. They never open a second tab.

Wayfinder is a Chrome extension powered by a Next.js backend that watches your screen, understands where you are in any web-based software, and overlays a living breadcrumb trail of exactly what to click next — guided by Gemma 4 31B running on Cerebras at 1,500+ tokens/second.

---

## 1. System Architecture (One Picture)

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER'S BROWSER                              │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────────────────────┐   │
│  │ Chrome Extension│    │  Active Tab (AWS, Figma, etc.) │   │
│  │                 │    │                                  │   │
│  │  popup.html ────┼───►│  content.js (DOM extract)       │   │
│  │  background.js  │◄───┤  overlay.js (visual guidance)   │   │
│  │  (service worker)│    │                                  │   │
│  └────────┬────────┘    └─────────────────────────────────┘   │
│           │                                                     │
└───────────┼─────────────────────────────────────────────────────┘
            │ HTTPS + Bearer Token
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  NEXT.JS APP (Vercel)                           │
│                  wayfinder.app                                  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                   │
│  │ /api/guide       │  │ /dashboard       │                   │
│  │ /api/auth        │  │ /playbooks       │                   │
│  │ /api/playbooks   │  │ /landing         │                   │
│  └────────┬─────────┘  └──────────────────┘                   │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────┐         ┌──────────────────┐            │
│  │ Cerebras Client  │         │ Neon Postgres    │            │
│  │ (Gemma 4 31B)    │         │ (Prisma)         │            │
│  └────────┬─────────┘         └──────────────────┘            │
└───────────┼─────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  api.cerebras.ai/v1/chat/completions                            │
│  Model: gemma-4-31b (multimodal, ~1500 tok/s)                   │
└─────────────────────────────────────────────────────────────────┘
```

**Why the split:**
- Extension does what only an extension can do (screen capture, DOM access, overlay injection)
- Next.js does everything else (auth, inference proxy, persistence, dashboard, billing later)
- API key never lives in the extension — stays on the server
- Future-proof: swap the model, add team features, build a desktop client later

---

## 2. Problem & Why Now

Power software (AWS, Salesforce, Figma, Kubernetes, Blender, SAP) is built for experts. Everyone else lives in a loop:

| Behavior | Cost |
|---|---|
| Google the task | 5 tabs open, outdated screenshots, wrong region |
| YouTube tutorial | 12 minutes for a 3-step task |
| Ask ChatGPT | Right concept, wrong UI. Can't see your screen. |
| Bother a coworker | Doesn't scale |

**Why this can finally exist:** Gemma 4 31B on Cerebras runs multimodal inference in ~300ms. At 2 seconds (GPT-4o speed), the overlay appears after the user has already second-guessed themselves and broken flow. At 300ms it appears before they lift their finger. **The speed isn't a benchmark — it's the product.**

---

## 3. Tech Stack

### 3.1 Chrome Extension
| Concern | Choice |
|---|---|
| Manifest | V3 (only option going forward) |
| Build tool | Vite + `@crxjs/vite-plugin` (HMR for extensions) |
| UI framework (popup only) | React + Tailwind |
| Content script | Vanilla JS (no React — must inject cleanly into hostile DOMs like AWS) |
| Bundler output | `extension/dist/` → loaded unpacked during dev |

### 3.2 Next.js App
| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Hosting | Vercel |
| Auth | Clerk (5-minute setup, handles OAuth + extension token flow) |
| Database | Neon Postgres + Prisma |
| Inference | `@cerebras/cerebras_cloud_sdk` |
| API runtime | Node.js (vision payloads exceed Edge runtime body limits) |
| Styling | Tailwind + shadcn/ui |

### 3.3 Repo Layout (Monorepo)
```
wayfinder/
├── extension/                 # Chrome extension
│   ├── manifest.json
│   ├── src/
│   │   ├── background.ts      # Service worker
│   │   ├── content.ts         # DOM capture
│   │   ├── overlay.ts         # Pulse + tooltip injection
│   │   ├── popup/
│   │   │   ├── Popup.tsx
│   │   │   └── index.html
│   │   └── lib/
│   │       ├── api.ts         # Calls Next.js
│   │       ├── auth.ts        # Token storage
│   │       └── dom-extract.ts # DOM simplification
│   ├── vite.config.ts
│   └── package.json
│
├── web/                       # Next.js app
│   ├── app/
│   │   ├── (marketing)/page.tsx          # Landing
│   │   ├── dashboard/page.tsx
│   │   ├── playbooks/page.tsx
│   │   ├── extension/auth/page.tsx       # Extension auth handoff
│   │   └── api/
│   │       ├── guide/route.ts            # The main one
│   │       ├── auth/extension/route.ts
│   │       ├── playbooks/route.ts
│   │       └── history/route.ts
│   ├── lib/
│   │   ├── cerebras.ts
│   │   ├── prisma.ts
│   │   └── prompts/
│   │       ├── system.ts
│   │       └── playbooks/
│   ├── prisma/schema.prisma
│   └── package.json
│
├── shared/                    # Types shared between extension + web
│   └── types.ts
│
├── pnpm-workspace.yaml
└── README.md
```

---

## 4. Chrome Extension — Full Implementation

### 4.1 `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Wayfinder",
  "version": "0.1.0",
  "description": "AI GPS for complex software. Tell it what you want — it shows you where to click.",
  "permissions": [
    "activeTab",
    "storage",
    "scripting",
    "tabs"
  ],
  "host_permissions": [
    "https://wayfinder.app/*",
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/16.png",
      "48": "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "externally_connectable": {
    "matches": ["https://wayfinder.app/*", "http://localhost:3000/*"]
  },
  "web_accessible_resources": [
    {
      "resources": ["overlay.css"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

**Why each permission:**
- `activeTab` + `tabs` → screenshot capture, URL tracking
- `<all_urls>` → content script runs everywhere
- `scripting` → fallback element injection
- `externally_connectable` → Next.js auth page can `chrome.runtime.sendMessage` directly to the extension (this is how the token gets passed back)

### 4.2 `background.ts` (Service Worker)

The router. Receives messages from content scripts, talks to Next.js, sends responses back.

```typescript
// extension/src/background.ts
import { getAuthToken, setAuthToken } from './lib/auth';

const API_BASE = process.env.NODE_ENV === 'production'
  ? 'https://wayfinder.app'
  : 'http://localhost:3000';

interface GuideRequest {
  goal: string;
  sessionId: string;
  completedSteps: string[];
  domSnapshot: string;
  screenshot: string;
  url: string;
}

// Main inference call
async function callGuideAPI(payload: GuideRequest) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE}/api/guide`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Guide API ${res.status}`);
  return res.json();
}

// Screenshot capture (only background worker can call this)
async function captureScreenshot(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.windowId) throw new Error('No window');
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
    quality: 80,
  });
  // Strip data:image/png;base64, prefix — Cerebras wants raw base64
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

// Message router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'WF_NEXT_STEP') {
        const tabId = sender.tab?.id;
        if (!tabId) throw new Error('No tab');

        const screenshot = await captureScreenshot(tabId);
        const result = await callGuideAPI({
          ...msg.payload,
          screenshot,
        });
        sendResponse({ ok: true, data: result });
      } else if (msg.type === 'WF_PING') {
        sendResponse({ ok: true, authenticated: !!(await getAuthToken()) });
      }
    } catch (err) {
      sendResponse({ ok: false, error: (err as Error).message });
    }
  })();
  return true; // keep channel open for async
});

// Receive token from Next.js auth page via externally_connectable
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'WF_SET_TOKEN' && msg.token) {
    setAuthToken(msg.token).then(() => sendResponse({ ok: true }));
    return true;
  }
});
```

### 4.3 `content.ts` (DOM Capture + Click Listening)

```typescript
// extension/src/content.ts
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

  if (!response.ok) {
    console.error('[Wayfinder]', response.error);
    return;
  }

  const { selector, action, explanation, value, done, confidence, fallbackCoordinates } = response.data;

  if (done) {
    showSuccessToast('🎉 Goal complete!');
    state.active = false;
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
      // Wait for SPA to settle before next capture
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

// Listen for popup → content messages
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'WF_START') {
    state.active = true;
    state.goal = msg.goal;
    state.sessionId = crypto.randomUUID();
    state.completedSteps = [];
    captureAndGuide();
  } else if (msg.type === 'WF_STOP') {
    state.active = false;
    removeOverlay();
  }
});

function showSuccessToast(text: string) {
  const toast = document.createElement('div');
  toast.textContent = text;
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
```

### 4.4 `lib/dom-extract.ts` (Critical — Payload Size)

Raw AWS console DOM is ~2MB. We extract only interactive elements to ~15KB.

```typescript
// extension/src/lib/dom-extract.ts
interface ExtractedElement {
  tag: string;
  id?: string;
  text?: string;
  ariaLabel?: string;
  testId?: string;
  role?: string;
  href?: string;
  placeholder?: string;
  rect: { x: number; y: number; w: number; h: number };
  selector: string;
}

export function extractInteractiveDOM(doc: Document): string {
  const selector = [
    'button',
    'a[href]',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="link"]',
    '[onclick]',
  ].join(',');

  const elements = Array.from(doc.querySelectorAll<HTMLElement>(selector));

  const extracted: ExtractedElement[] = elements
    .filter((el) => isVisible(el))
    .slice(0, 200) // hard cap — AWS pages can have 500+ buttons
    .map((el, i) => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        text: el.innerText?.trim().slice(0, 80) || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        testId: el.getAttribute('data-testid') || undefined,
        role: el.getAttribute('role') || undefined,
        href: (el as HTMLAnchorElement).href || undefined,
        placeholder: (el as HTMLInputElement).placeholder || undefined,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        selector: buildSelector(el, i),
      };
    });

  return JSON.stringify({
    title: doc.title,
    url: window.location.href,
    elements: extracted,
  });
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) < 0.1) return false;
  // Off-screen
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  return true;
}

function buildSelector(el: HTMLElement, fallbackIndex: number): string {
  // Priority: id > data-testid > aria-label > stable class > nth-of-type
  if (el.id) return `#${CSS.escape(el.id)}`;

  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;

  // Stable class (no hash-looking suffixes)
  const stableClass = Array.from(el.classList).find(
    (c) => !/[A-Z0-9_-]{6,}/.test(c) && c.length > 2
  );
  if (stableClass) {
    const matches = document.querySelectorAll(`.${CSS.escape(stableClass)}`);
    if (matches.length === 1) return `.${CSS.escape(stableClass)}`;
  }

  // Last resort: unique data attribute
  return `[data-wf-id="${fallbackIndex}"]`;
}
```

### 4.5 `overlay.ts` (The Visual Magic)

```typescript
// extension/src/overlay.ts
interface OverlayOptions {
  selector: string;
  action: 'click' | 'type' | 'select' | 'scroll' | 'wait';
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

  // Fallback: use coordinates from screenshot analysis
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

  // Listen for the expected action
  const cleanup = attachActionListener(target, opts, opts.onAdvance);
  
  // Cleanup on disconnect
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

  const style = document.createElement('style');
  style.textContent = `
    @keyframes wf-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.04); opacity: 0.85; }
    }
  `;
  root.appendChild(style);
}

function drawTooltip(
  root: HTMLElement,
  target: HTMLElement,
  text: string,
  action: string,
  value?: string
) {
  const rect = target.getBoundingClientRect();
  const tooltip = document.createElement('div');

  const actionVerb = {
    click: 'Click',
    type: `Type "${value}"`,
    select: `Select "${value}"`,
    scroll: 'Scroll to',
    wait: 'Waiting…',
  }[action] || 'Do this';

  tooltip.innerHTML = `
    <div style="font-weight: 700; font-size: 13px; color: #22c55e; margin-bottom: 4px;">
      ${actionVerb}
    </div>
    <div style="font-size: 14px; color: #0f172a; line-height: 1.4;">
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
    const handler = () => {
      onAdvance(`Clicked ${opts.selector}: ${opts.explanation}`);
    };
    target.addEventListener('click', handler, { once: true, capture: true });
    return () => target.removeEventListener('click', handler, true);
  }

  if (opts.action === 'type') {
    const handler = () => {
      // Advance when user types the expected value (or just blurs)
      if ((target as HTMLInputElement).value.length > 0) {
        onAdvance(`Typed into ${opts.selector}`);
      }
    };
    target.addEventListener('blur', handler, { once: true });
    return () => target.removeEventListener('blur', handler);
  }

  // wait/scroll — auto-advance after delay
  const timeout = setTimeout(() => onAdvance(`Waited`), 2000);
  return () => clearTimeout(timeout);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function showFloatingHint(text: string) {
  // When we can't locate the target, show a floating advisory
  const hint = document.createElement('div');
  hint.textContent = `⚠ ${text}`;
  hint.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #fbbf24; color: #1e293b;
    padding: 12px 20px; border-radius: 10px;
    font: 600 14px system-ui;
    z-index: 2147483647;
  `;
  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 4000);
}
```

### 4.6 `popup/Popup.tsx`

```tsx
import { useState, useEffect } from 'react';

export default function Popup() {
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'WF_PING' }, (res) => {
      setAuthed(res?.authenticated || false);
    });
  }, []);

  const start = async () => {
    if (!goal.trim()) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'WF_START', goal });
    setRunning(true);
  };

  const stop = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'WF_STOP' });
    setRunning(false);
  };

  if (!authed) {
    return (
      <div className="p-6 w-80">
        <h1 className="text-lg font-bold">Wayfinder</h1>
        <p className="text-sm text-slate-600 mt-2">Sign in to start.</p>
        <a
          href="https://wayfinder.app/extension/auth"
          target="_blank"
          className="mt-4 block w-full text-center bg-green-600 text-white py-2 rounded-lg"
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="p-6 w-80">
      <h1 className="text-lg font-bold">Wayfinder</h1>
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Deploy my FastAPI app on AWS…"
        className="mt-3 w-full h-24 p-2 border rounded-lg text-sm"
        disabled={running}
      />
      {running ? (
        <button onClick={stop} className="mt-3 w-full bg-red-600 text-white py-2 rounded-lg">
          Stop guidance
        </button>
      ) : (
        <button onClick={start} className="mt-3 w-full bg-green-600 text-white py-2 rounded-lg">
          Start guiding me
        </button>
      )}
    </div>
  );
}
```

---

## 5. Next.js App — Full Implementation

### 5.1 `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id          String     @id @default(cuid())
  clerkId     String     @unique
  email       String     @unique
  createdAt   DateTime   @default(now())
  sessions    Session[]
  playbooks   Playbook[]
  apiTokens   ApiToken[]
}

model ApiToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique         // hashed
  name      String   @default("Extension")
  createdAt DateTime @default(now())
  lastUsed  DateTime?
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
}

model Session {
  id             String   @id @default(cuid())
  userId         String
  goal           String
  status         String   @default("active") // active | completed | abandoned
  startUrl       String
  stepCount      Int      @default(0)
  durationMs     Int?
  createdAt      DateTime @default(now())
  completedAt    DateTime?
  steps          Step[]
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}

model Step {
  id           String   @id @default(cuid())
  sessionId    String
  stepIndex    Int
  url          String
  selector     String
  action       String
  explanation  String
  confidence   Float
  latencyMs    Int
  createdAt    DateTime @default(now())
  session      Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, stepIndex])
}

model Playbook {
  id          String   @id @default(cuid())
  userId      String
  name        String
  goalPattern String   // e.g. "Deploy * on AWS"
  steps       Json     // pre-defined step hints
  app         String   // "aws" | "figma" | "github" | etc.
  isPublic    Boolean  @default(false)
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([app, isPublic])
}
```

### 5.2 `lib/cerebras.ts`

```typescript
import Cerebras from '@cerebras/cerebras_cloud_sdk';

export const cerebras = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY!,
});

export const MODEL = 'gemma-4-31b';
```

### 5.3 `lib/prompts/system.ts`

```typescript
export const SYSTEM_PROMPT = `You are Wayfinder, an AI that guides users through web software interfaces one step at a time.

You receive:
1. A screenshot of the user's current screen
2. A simplified JSON snapshot of interactive elements on the page (buttons, links, inputs)
3. The user's high-level goal
4. The list of steps they have already completed in this session

You must return ONLY valid JSON matching exactly this schema, with no markdown, no preamble:

{
  "selector": "string — CSS selector for the element to interact with",
  "action": "click" | "type" | "select" | "scroll" | "wait",
  "value": "string (optional) — text to type or option to select",
  "explanation": "string — 1-2 sentences in plain English. Why this step, what it accomplishes.",
  "confidence": number between 0 and 1,
  "done": boolean — true only when the user's goal is fully complete,
  "fallbackCoordinates": { "x": number, "y": number } — pixel position on screenshot, used if selector fails
}

RULES:
1. Prefer selectors in this priority: #id > [data-testid] > [aria-label] > stable class > [data-wf-id]
2. ALWAYS include fallbackCoordinates — read pixel position from the screenshot
3. The user can only do ONE thing per response. Don't combine steps.
4. If the page is loading or transitioning, return action: "wait"
5. If you see an error message, blocking modal, or auth wall: address that first before continuing the main goal
6. Never ask the user a clarifying question. Pick the most probable next action.
7. If completedSteps shows the goal is achieved, set done: true
8. Explanation should be friendly and direct: "Click here to launch a new EC2 instance" — not "You should probably consider clicking..."
9. Confidence below 0.5 means you're guessing — that's okay, the user can ignore and re-prompt

Be the friend who's done this 100 times and is patiently pointing at the screen for you.`;
```

### 5.4 `app/api/guide/route.ts` (The Core Endpoint)

```typescript
// web/app/api/guide/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cerebras, MODEL } from '@/lib/cerebras';
import { SYSTEM_PROMPT } from '@/lib/prompts/system';
import { prisma } from '@/lib/prisma';
import { verifyApiToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

// CORS for extension
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // tighten to chrome-extension://<id> in production
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  // 1. Auth
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401, headers: CORS_HEADERS });
  }

  const user = await verifyApiToken(token);
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: CORS_HEADERS });
  }

  // 2. Parse request
  const body = await req.json();
  const { goal, sessionId, completedSteps, domSnapshot, screenshot, url } = body;

  if (!goal || !screenshot || !domSnapshot) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: CORS_HEADERS });
  }

  // 3. Get or create session
  let session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    session = await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        goal,
        startUrl: url,
      },
    });
  }

  // 4. Call Cerebras
  const completion = await cerebras.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              goal,
              currentUrl: url,
              completedSteps,
              domSnapshot: JSON.parse(domSnapshot),
            }),
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${screenshot}` },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 500,
    temperature: 0.2, // we want consistency, not creativity
  });

  const raw = completion.choices[0].message.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: 'Model returned invalid JSON', raw },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  const latencyMs = Date.now() - start;

  // 5. Log the step
  await prisma.step.create({
    data: {
      sessionId: session.id,
      stepIndex: completedSteps.length,
      url,
      selector: parsed.selector || '',
      action: parsed.action || 'unknown',
      explanation: parsed.explanation || '',
      confidence: parsed.confidence || 0,
      latencyMs,
    },
  });

  await prisma.session.update({
    where: { id: session.id },
    data: {
      stepCount: { increment: 1 },
      ...(parsed.done && { status: 'completed', completedAt: new Date() }),
    },
  });

  // 6. Update token last-used
  await prisma.apiToken.update({
    where: { token },
    data: { lastUsed: new Date() },
  });

  return NextResponse.json(
    { ...parsed, latencyMs },
    { headers: CORS_HEADERS }
  );
}
```

### 5.5 `app/extension/auth/page.tsx` (Token Handoff)

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID!; // chrome ext id

export default function ExtensionAuth() {
  const { user, isLoaded } = useUser();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

  useEffect(() => {
    if (!isLoaded || !user) return;

    (async () => {
      // Mint a token for this user
      const res = await fetch('/api/auth/extension', { method: 'POST' });
      if (!res.ok) return setStatus('error');
      const { token } = await res.json();

      // Send token to extension via externally_connectable
      // @ts-ignore - chrome is injected by the extension
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        { type: 'WF_SET_TOKEN', token },
        (response: any) => {
          if (response?.ok) {
            setStatus('success');
            setTimeout(() => window.close(), 1500);
          } else {
            setStatus('error');
          }
        }
      );
    })();
  }, [isLoaded, user]);

  if (!isLoaded) return <div>Loading…</div>;
  if (!user) return <div>Please sign in first.</div>;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        {status === 'pending' && <p>Connecting your extension…</p>}
        {status === 'success' && <p className="text-green-600">✓ Connected. Closing window…</p>}
        {status === 'error' && <p className="text-red-600">Something went wrong. Try again.</p>}
      </div>
    </div>
  );
}
```

### 5.6 `app/api/auth/extension/route.ts`

```typescript
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes, createHash } from 'crypto';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Find or create internal user
  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    create: {
      clerkId: userId,
      email: '', // populated via Clerk webhook in production
    },
    update: {},
  });

  // Generate token
  const rawToken = `wf_${randomBytes(32).toString('hex')}`;
  const hashedToken = createHash('sha256').update(rawToken).digest('hex');

  await prisma.apiToken.create({
    data: {
      userId: user.id,
      token: hashedToken,
      name: 'Chrome Extension',
    },
  });

  return NextResponse.json({ token: rawToken });
}
```

### 5.7 `lib/auth.ts`

```typescript
import { createHash } from 'crypto';
import { prisma } from './prisma';

export async function verifyApiToken(rawToken: string) {
  const hashed = createHash('sha256').update(rawToken).digest('hex');
  const apiToken = await prisma.apiToken.findUnique({
    where: { token: hashed },
    include: { user: true },
  });
  return apiToken?.user || null;
}
```

---

## 6. Data Flow — Full Sequence

```
[User installs extension]
   ↓
[Clicks extension icon → popup says "Sign in"]
   ↓
[Opens https://wayfinder.app/extension/auth]
   ↓
[Clerk auth flow]
   ↓
[Next.js mints token, calls chrome.runtime.sendMessage(EXT_ID, token)]
   ↓
[Background worker stores token in chrome.storage.local]
   ↓
[Popup now shows goal input]

────────────────────────────────────────────────

[User types "Deploy my FastAPI app on AWS"]
   ↓
[Popup sends WF_START to content script of active tab]
   ↓
[Content script: extractInteractiveDOM(document) → ~15KB JSON]
   ↓
[Content sends WF_NEXT_STEP to background worker]
   ↓
[Background captures screenshot via chrome.tabs.captureVisibleTab]
   ↓
[Background POSTs to https://wayfinder.app/api/guide]
   |    Bearer: wf_<token>
   |    Body: { goal, sessionId, completedSteps, domSnapshot, screenshot, url }
   ↓
[Next.js verifies token → calls Cerebras Gemma 4 31B]
   ↓                                ~300-500ms
[Cerebras returns { selector, action, explanation, ... }]
   ↓
[Next.js logs Step to Postgres, returns JSON]
   ↓
[Background forwards response to content script]
   ↓
[Content script: injectOverlay({ selector, explanation })]
   ↓
[Pulsing green ring + tooltip appears on target element]
   ↓
[User clicks target]
   ↓
[Content script: waitForSettle() → loop back to extract DOM]
```

---

## 7. Environment Variables

### Extension (`.env`)
```
VITE_API_BASE=https://wayfinder.app
VITE_EXTENSION_ID=<your-chrome-extension-id>
```

### Next.js (`.env.local`)
```
DATABASE_URL=postgres://...neon...
CEREBRAS_API_KEY=csk-...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_EXTENSION_ID=<your-chrome-extension-id>
```

---

## 8. Edge Cases & Mitigations

| Case | What Happens | Mitigation |
|---|---|---|
| Selector not found | Element renamed/moved after model trained | `fallbackCoordinates` → `elementFromPoint()` |
| SPA re-renders mid-step | Target element detached | MutationObserver detects detach, re-captures |
| Modal blocks the page | Confirmation dialog, cookie banner | System prompt instructs model to address modals first |
| Multi-tab flow | Action opens new tab (OAuth, S3 upload) | `chrome.tabs.onUpdated` fires re-capture on new tab |
| Auth wall | User hits "Access Denied" | Model detects "403" / "Sign in" → guides to login |
| Page mid-load | DOM incomplete | `waitForSettle(800ms)` after every action |
| Sensitive data on screen | Passwords, API keys visible | Pre-send: regex scrub `<input type="password">` values from DOM; warn user about screenshots |
| Cerebras API outage | Demo dies | `/api/guide` falls back to cached response for hackathon demo flow |
| User goes off-script | Clicks something other than the highlighted element | After 3 wrong clicks: re-capture and re-plan from scratch |
| Long inference (>2s) | Feels broken | Show "thinking…" indicator after 500ms |

---

## 9. Build Plan — 3 Day Hackathon Scope

### Day 1 — Foundation (8 hours)
- [ ] `pnpm create next-app` + `pnpm create vite extension`
- [ ] Prisma schema + Neon DB setup
- [ ] Clerk auth on Next.js
- [ ] `manifest.json` + basic extension scaffold (popup, content, background)
- [ ] `extractInteractiveDOM` working
- [ ] `chrome.tabs.captureVisibleTab` working
- [ ] `/api/guide` endpoint with hardcoded Cerebras call
- [ ] **Milestone:** Extension can send screenshot+DOM to API and get a response printed in console

### Day 2 — Intelligence (8 hours)
- [ ] System prompt tuning with 3-5 few-shot examples for AWS EC2 flow
- [ ] Overlay injection (pulse + tooltip)
- [ ] Click listener → next step loop
- [ ] `waitForSettle` with MutationObserver
- [ ] Selector fallback to coordinates
- [ ] Error state detection in prompt
- [ ] Token auth flow (`/extension/auth` page → externally_connectable)
- [ ] **Milestone:** End-to-end AWS EC2 launch works without manual intervention

### Day 3 — Polish + Demo (8 hours)
- [ ] Dashboard page showing session history
- [ ] Landing page with demo video embed
- [ ] Tune overlay animations
- [ ] 5 dry-runs of the killer demo
- [ ] Cache demo responses as fallback (in case Cerebras is slow)
- [ ] Record 90-second demo video as backup
- [ ] Deploy to Vercel
- [ ] Submit to hackathon

---

## 10. Killer Demo Script

**Setup:** Judge's laptop. Extension pre-installed. Logged in. Empty AWS account ready.

**Script:**

> "Pick someone in this room who's never used AWS."
> *[volunteer comes up]*
> "Open the Wayfinder extension. Type: deploy a website."
> *[volunteer types]*
> *[green ring appears over "EC2" in AWS console]*
> "Just follow the green arrows."
> *[8 minutes later: a website is live at a public IP]*
> "They've never used AWS before. They just deployed a server."

**Why this beats every other hackathon demo:** It's not a tech demo, it's a transformation. Judge watches a person do something they couldn't do alone, and the speed makes it feel like magic. The Cerebras latency story tells itself.

---

## 11. Deployment

### Extension
1. `cd extension && pnpm build` → produces `dist/`
2. Zip `dist/` → submit to Chrome Web Store (or side-load via `chrome://extensions` for demo)
3. Note the extension ID — paste it into Next.js env as `NEXT_PUBLIC_EXTENSION_ID`

### Next.js
1. Push to GitHub
2. Connect to Vercel → auto-deploys
3. Set env vars in Vercel dashboard
4. `pnpm prisma migrate deploy` on first deploy

### Domain
- `wayfinder.app` → Vercel
- Set in `manifest.json` `externally_connectable.matches`

---

## 12. Post-Hackathon Roadmap

### v1.1 — Playbook Recording
"Record" mode captures the user's clicks and saves them as a reusable playbook. Companies publish playbooks for onboarding ("How to file an expense report in Workday").

### v1.2 — Team Mode
Shared playbooks across an org. Slack integration: "Send a Wayfinder link" → opens extension to that specific guided flow.

### v1.3 — Privacy Mode
On-prem inference for enterprises. Screenshots never leave the network. Self-hosted Gemma 4 on customer's GPUs.

### v1.4 — Desktop App
Electron wrapper. Works on Blender, Photoshop, SAP, Kubernetes Dashboard, any GUI software.

### v2.0 — Autopilot
"Just deploy my app." Wayfinder does it for them, with confirmation gates on destructive actions. GPS → self-driving.

---

## 13. Risks & Open Questions

| Risk | Severity | Status |
|---|---|---|
| Gemma 4 vision quality on dense UIs (AWS) | High | Need to benchmark on Day 1 morning |
| Token auth flow brittle on Chrome | Medium | `externally_connectable` is solid, but extension ID must match |
| 30-day Cerebras free tier runs out mid-demo | Low | Pre-paid backup account ready |
| Chrome Web Store review for public launch | N/A for hackathon | 7-14 day review window |
| Privacy concerns (screenshot of user's data) | High | Add explicit "Wayfinder is watching" indicator in tab |

---

## 14. Success Metrics

**Hackathon-specific:**
- Demo completes in <10 minutes
- Inference p95 < 800ms
- Judge says some variant of "wait, that actually worked"

**If we ship publicly:**
- Time-to-first-successful-step < 30 seconds from install
- 60% of started sessions complete the goal
- DAU/MAU > 30% (sticky use)

---

## 15. Taglines

Primary: **"Don't learn the interface. Just tell it what you want."**
Demo hook: **"GPS for the internet's most complicated software."**
Technical: **"AI that sees what you see and tells you what to click."**

---

*Wayfinder PRD v1.0 — Built with Cerebras + Next.js + Chrome MV3*
*Paramarsh Labs, 2026*