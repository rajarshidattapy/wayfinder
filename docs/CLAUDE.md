# Wayfinder — Dev Notes

## Repo layout
- `extension/` — Chrome MV3 extension (Vite + React popup, vanilla TS content/background)
- `web/` — Next.js 15 app (Clerk auth, Prisma + Neon, Cerebras inference)
- `shared/` — Types shared between extension and web

## Dev setup

```bash
# Install all workspaces
pnpm install

# Start Next.js
pnpm dev:web          # http://localhost:3000

# Start extension dev build (watch mode)
pnpm dev:ext          # load extension/dist/ in chrome://extensions
```

## Env files to fill in
- `web/.env.local` — DATABASE_URL, CEREBRAS_API_KEY, CLERK_* keys, NEXT_PUBLIC_EXTENSION_ID
- `extension/.env` — VITE_API_BASE (defaults to localhost:3000)

## DB
```bash
cd web
pnpm db:generate    # generate prisma client
pnpm db:push        # push schema to Neon (dev)
pnpm db:migrate     # production migrations
```

## Model
- `gemma-4-31b` via Cerebras, multimodal, ~300ms latency
- Endpoint: `/api/guide` — accepts `{ goal, sessionId, completedSteps, domSnapshot, screenshot, url }`

## Auth flow
1. User opens popup → clicks "Sign in" → opens `/extension/auth`
2. Clerk authenticates → Next.js mints `wf_<hex>` token → sends via `chrome.runtime.sendMessage`
3. Background stores token in `chrome.storage.local`
4. Every guide call: Bearer token → SHA-256 hash lookup in `ApiToken` table

## Extension message types
- `WF_START` — popup → content script, starts session
- `WF_STOP` — popup → content script, kills overlay
- `WF_PING` — popup → background, checks auth
- `WF_NEXT_STEP` — content → background → Next.js API
- `WF_SET_TOKEN` — Next.js page → background (externally_connectable)
