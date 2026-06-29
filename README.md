# 🧭 Wayfinder

> **Don't learn the interface. Just tell it what you want.**

Wayfinder is a Chrome extension that watches your screen, understands where you are in any web-based software, and overlays a pulsing green arrow on exactly what to click next — guided by **Gemma 4 31B on Cerebras** at 1,500+ tokens/second.

---

## The idea in one sentence

You type *"Deploy my FastAPI app on AWS"* and a green ring appears over the right button. You click. The ring moves. You never open a second tab.

---

## How it works

```
User types goal in popup
  → Content script extracts interactive DOM (~15KB from a 2MB page)
  → Background worker captures screenshot
  → POST /api/guide  (Bearer token, never stored in extension)
  → Cerebras Gemma 4 31B returns { selector, action, explanation } in ~300ms
  → Green pulse ring + tooltip injected over the target element
  → User clicks → MutationObserver detects settle → repeat
```

---

## Stack

| Layer | Choice |
|---|---|
| Extension | Chrome MV3 · Vite + @crxjs · React popup · Vanilla TS content/background |
| Web app | Next.js 15 App Router · Vercel |
| Auth | Clerk |
| Database | Neon Postgres · Prisma |
| Inference | Cerebras `gemma-4-31b` (multimodal, ~300ms) |

---

## Repo layout

```
wayfinder/
├── extension/          # Chrome extension
│   └── src/
│       ├── background.ts     # Service worker + API proxy
│       ├── content.ts        # DOM capture + overlay lifecycle
│       ├── overlay.ts        # Pulse ring + tooltip injection
│       ├── popup/Popup.tsx   # React popup
│       └── lib/
│           ├── auth.ts       # chrome.storage token
│           └── dom-extract.ts
├── web/                # Next.js app
│   ├── app/
│   │   ├── api/guide/        # Core inference endpoint
│   │   ├── api/auth/extension/
│   │   ├── dashboard/
│   │   └── extension/auth/   # Token handoff page
│   └── lib/
│       ├── cerebras.ts
│       ├── auth.ts
│       └── prompts/system.ts
└── shared/types.ts     # Shared TS types
```

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/rajashidattapy/wayfinder
cd wayfinder
pnpm install
```

### 2. Set credentials

```bash
# web/.env.local
DATABASE_URL=postgres://...neon...
CEREBRAS_API_KEY=csk-...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_EXTENSION_ID=   # fill after step 5
```

### 3. Push the database schema

```bash
cd web && pnpm db:push
```

### 4. Run the web app

```bash
pnpm dev:web   # http://localhost:3000
```

### 5. Build and sideload the extension

```bash
pnpm dev:ext   # builds extension/dist/ in watch mode
```

Open `chrome://extensions` → **Load unpacked** → select `extension/dist/`  
Copy the extension ID → paste it into `NEXT_PUBLIC_EXTENSION_ID` in `web/.env.local`

### 6. Connect

Click the 🧭 icon → **Sign in** → the auth page mints a token and sends it to the extension automatically.

---

## Auth flow

```
Popup → opens wayfinder.app/extension/auth
  → Clerk authenticates user
  → Next.js mints wf_<random> token, stores SHA-256 hash in DB
  → chrome.runtime.sendMessage(token) via externally_connectable
  → Background stores raw token in chrome.storage.local
  → Every /api/guide call: Bearer token → hash → DB lookup
  → API key never touches the extension bundle
```

---

## Deploy

```bash
# Extension
pnpm build:ext
# Zip extension/dist/ → Chrome Web Store (or keep unpacked for demo)

# Web
git push  # Vercel auto-deploys
cd web && pnpm db:migrate  # run once on first deploy
```

---

Built for the **Cerebras Hackathon** · Paramarsh Labs · 2026
