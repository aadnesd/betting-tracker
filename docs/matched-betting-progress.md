# Matched Betting Feature – Status Log (Nov 23, 2025)

## Scope recap
- Add matched-bet ingestion via paired screenshots (back + lay).
- AI vision parsing to structured bets.
- Persist BackBet, LayBet, MatchedBet, ScreenshotUpload.
- New UI for upload/preview/save and dashboard listing.
- API routes for upload, auto-parse, and create-matched.

## What’s done
- **Data layer**: New tables & queries for ScreenshotUpload, BackBet, LayBet, MatchedBet; migration `0008_matched_bets.sql`.
- **AI parser**: `lib/bet-parser.ts` (vision model with retry; test stub).
- **APIs**: `/api/bets/screenshots`, `/api/bets/autoparse`, `/api/bets/create-matched`.
- **UI**: `/bets/new` upload & review flow; `/bets` dashboard; sidebar link; status badges.
- **Docs**: `docs/matched-betting.md`.
- **Lint/format/build**: `pnpm lint` ✅, `pnpm build` ✅.
- **Infra helper**: Server-safe localStorage shim (`lib/polyfills/local-storage.ts`) to avoid SSR crashes in Playwright runs.
- **Playwright browsers** installed (`pnpm exec playwright install --with-deps`).

## Current blockers
- `pnpm test` failing due to Next dev server errors during Playwright:
  - Repeated `failed to pipe response` with cause `Cannot read properties of undefined (reading 'text')` while streaming chat responses (likely `/api/chat` SSE handling under PLAYWRIGHT=True).
  - Multiple toast elements cause “strict mode violation” in tests that expect a single toast.
  - Timeouts waiting for chat responses; suggests stream endpoint not resolving cleanly in test mode.

## Suggested next steps
1) **Stream error**: Inspect `/app/(chat)/api/chat/route.ts` when PLAYWRIGHT=True; ensure streamed response parts always include `.text` (or guard before piping). Add defensive checks or stub responses in test env.
2) **Toasts in tests**: Update Playwright helpers to target a unique toast (e.g., `.first()`) or wrap toasts in a container with stable test id.
3) Re-run `pnpm test` until green.
4) Optional: reduce dev-server port conflicts by setting `PORT=3001` in Playwright config or pre-kill lingering Next processes before tests.

## Quick commands
- Lint/format: `pnpm lint`, `pnpm format`
- Build: `pnpm build` (runs migrations)
- Tests: `pnpm test` (uses parser stub; requires Playwright browsers already installed)

## Relevant files
- Data/queries: `lib/db/schema.ts`, `lib/db/queries.ts`, `lib/db/migrations/0008_matched_bets.sql`
- Parser: `lib/bet-parser.ts`
- APIs: `app/(chat)/api/bets/{screenshots,autoparse,create-matched}/route.ts`
- UI: `app/(chat)/bets/page.tsx`, `app/(chat)/bets/new/page.tsx`, `components/bets/*`
- Docs: `docs/matched-betting.md`, this log `docs/matched-betting-progress.md`
