# Copilot Instructions for `nextjs-ai-chatbot`

## Build, lint, and test commands

- Install deps: `pnpm install`
- Dev server: `pnpm dev`
- Production build (runs DB migrate first): `pnpm build`
- Start production server: `pnpm start`
- Lint (Ultracite): `pnpm lint`
- Format/fix (Ultracite): `pnpm format`
- Generate Drizzle artifacts: `pnpm db:generate`
- Run DB migrations: `pnpm db:migrate`
- Open Drizzle Studio: `pnpm db:studio`

### Tests

- Full Playwright suite: `pnpm test`
- Single Playwright file: `pnpm test -- --project=routes tests/routes/bets.test.ts`
- Single Playwright test by name: `pnpm test -- --project=routes tests/routes/bets.test.ts -g "can upload screenshots, auto-parse, and save matched bet (happy path)"`
- Full unit tests: `pnpm test:unit`
- Single unit test file: `pnpm exec vitest run tests/unit/bet-calculations.test.ts`
- Full integration tests (real AI): `pnpm test:integration`
- Single integration test file: `REAL_AI=true pnpm exec vitest run tests/integration/ai-parsing.test.ts`

## High-level architecture

### Product and routing shape

- This repo is a matched-betting tracker (not a chatbot UI anymore). Root redirects to `/bets` in `app/(chat)/page.tsx`.
- App Router is split into route groups:
  - `app/(auth)` for NextAuth setup and auth pages.
  - `app/(chat)` for the matched-betting UI and APIs (`app/(chat)/api/...`).

### Core intake flow (screenshots -> parsed bets -> matched set)

1. Upload screenshots via `app/(chat)/api/bets/screenshots/route.ts` (stores files and `ScreenshotUpload` records).
2. Parse via `app/(chat)/api/bets/autoparse/route.ts`, which chooses parser strategy:
   - `Agent + OCR` when Azure OCR is configured and user accounts exist (`lib/bet-parser-agent.ts`).
   - `OCR + LLM` when Azure OCR is configured without account context (`lib/bet-parser-ocr.ts`).
   - `Vision LLM` fallback (`lib/bet-parser.ts`).
3. Persist matched data via `app/(chat)/api/bets/create-matched/route.ts` (or manual `quick-add` route), creating `BackBet` + `LayBet` + `MatchedBet`, computing NOK exposure, and writing audit records.

### Data and domain layer

- Drizzle schema is in `lib/db/schema.ts`; nearly all read/write domain logic lives in `lib/db/queries.ts`.
- Core model is leg-based: `BackBet` and `LayBet` are separate tables linked by `MatchedBet`.
- Domain tables also include accounts, promos/free bets, deposit bonuses, wallets/wallet transactions, football matches, screenshots, and audit logs.
- Reporting/dashboard pages (`app/(chat)/bets/page.tsx`, `app/(chat)/bets/reports/page.tsx`) pull from query-layer aggregations in parallel and use cache tags from `lib/cache.ts`.

### Match sync and auto-settlement pipeline

- Match sync cron: `app/(chat)/api/cron/sync-matches/route.ts` fetches football-data.org matches and upserts `FootballMatch`.
- Settlement cron: `app/(chat)/api/cron/auto-settle/route.ts` resolves outcomes (`lib/settlement.ts`) and applies settlement side effects.
- Unlinked fallback lookup: `lib/unlinked-settlement-search.ts` uses AI Gateway web lookup when no linked match exists.
- Balance snapshots cron: `app/(chat)/api/cron/balance-snapshot/route.ts` stores historical bankroll snapshots.

## Key conventions for this codebase

- **Preserve existing screenshot-intake API surface**: extend these routes instead of replacing them:
  - `app/(chat)/api/bets/screenshots/route.ts`
  - `app/(chat)/api/bets/autoparse/route.ts`
  - `app/(chat)/api/bets/create-matched/route.ts`
- **Use query-layer helpers, not ad-hoc SQL in routes**: business rules and transaction semantics are centralized in `lib/db/queries.ts`.
- **Keep settlement-safe selection normalization**: use `normalizedSelection` (`HOME_TEAM | AWAY_TEAM | DRAW`) where possible; match-linking and auto-settlement depend on it.
- **Respect confidence/review rules**: `lib/bet-review.ts` marks `needs_review` when explicit flags are set or confidence drops below threshold.
- **Keep currency behavior consistent**:
  - Exposure/profit is normalized to NOK for reporting/aggregation.
  - Lay defaults in parser/create flows are exchange `bfb247` and currency `NOK` when missing.
- **Mutations should keep side effects in sync**:
  - Write audit events via `createAuditEntry` for bet/account/wallet changes.
  - Call `revalidateDashboard(userId)` after state changes that affect dashboard/reporting.
- **Use test-aware auth where needed for API tests**: screenshot/autoparse/create-matched flows use `getTestAwareSession()` so Playwright `x-test-user-id` works in test mode.
- **Test mode is explicit**:
  - `PLAYWRIGHT*` env enables test-mode stubs in parser/provider code (`lib/constants.ts`, `lib/ai/providers.ts`, parser modules).
  - Real AI integration tests require `REAL_AI=true` and valid AI keys.
- **When schema changes, keep generated artifacts in sync**: run `pnpm db:generate` and commit migration artifacts (enforced by `migration-integrity` workflow).
- **Follow existing lint/format toolchain**: this repo uses Ultracite (`pnpm lint`, `pnpm format`) as the authoritative formatter/linter flow.
