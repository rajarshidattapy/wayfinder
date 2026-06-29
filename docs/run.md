To get running

1. Fill in credentials (web/.env.local):
DATABASE_URL=postgres://...neon...
CEREBRAS_API_KEY=csk-...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_EXTENSION_ID=<chrome ext id after sideloading>

2. Push the DB schema:
cd web && pnpm db:push

3. Run:
pnpm dev:web   # http://localhost:3000
pnpm dev:ext   # watch-builds extension/dist/

4. Sideload the extension: chrome://extensions → Load unpacked → extension/dist/