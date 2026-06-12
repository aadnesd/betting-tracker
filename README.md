# Matched Betting Tracker

A single-user matched betting tracker built with Next.js, Drizzle, and the Vercel AI SDK.

This project focuses on making matched betting workflows fast, transparent, and auditable: capture bets quickly, reconcile outcomes reliably, and track profitability over time.

## Product scope

From `specs/product.md`, the current in-scope capabilities are:

- Matched sets (back + lay) with promo metadata
- AI screenshot intake: upload -> parse -> review -> save
- Reconciliation workflow
- Reporting and exposure tracking
- CSV import/export

Core domain entities are documented in `specs/data-model.md` (Accounts, Bets, MatchedSets, Promos, FreeBets, DepositBonuses, Transactions, Screenshots).

## Key API routes (existing)

These routes are part of the current screenshot intake flow:

- `app/(chat)/api/bets/screenshots/route.ts` - upload screenshots
- `app/(chat)/api/bets/autoparse/route.ts` - AI parse screenshots
- `app/(chat)/api/bets/create-matched/route.ts` - save matched bet

## Tech stack

- Next.js App Router + React 19
- Vercel AI SDK / AI Gateway
- Drizzle ORM + Postgres
- Auth.js (Google + GitHub OAuth)
- Tailwind CSS + shadcn/ui
- Playwright + Vitest

## Running locally

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create local env file:

   ```bash
   cp .env.example .env.local
   ```

3. Fill required values in `.env.local` (see `.env.example`):

   ```bash
   POSTGRES_URL=
   BLOB_READ_WRITE_TOKEN=
   AI_GATEWAY_API_KEY=
   FXRATES_API_KEY=
   FOOTBALL_DATA_API_TOKEN=
   ODDS_API_API_KEY=
   MATCH_PROVIDER=
   ODDS_API_LEAGUES=
   UNLINKED_SETTLEMENT_SEARCH_MODEL=
   UNLINKED_SETTLEMENT_SEARCH_MODE=
   UNLINKED_SETTLEMENT_SEARCH_FALLBACK_MODELS=
   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=
   AZURE_DOCUMENT_INTELLIGENCE_KEY=
   AUTH_SECRET=
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   ```

   The match data source is pluggable (see `lib/matches`). Set
   `ODDS_API_API_KEY` to use [odds-api.io](https://odds-api.io) (395+ football
   leagues plus other sports); otherwise the sync falls back to
   football-data.org (`FOOTBALL_DATA_API_TOKEN`). Force a source with
   `MATCH_PROVIDER` (`odds-api` | `football-data`), and optionally restrict the
   odds-api target leagues with `ODDS_API_LEAGUES` (comma-separated slugs, e.g.
   `norway-eliteserien,usa-mls`). odds-api leagues are discovered dynamically,
   so competitions that are out of season are skipped until fixtures publish.

   `AI_GATEWAY_API_KEY` enables auto-settlement fallback for matched sets that
   are not linked to a synced football match. The cron uses AI Gateway
   (`openai/gpt-5.4-mini` by default) to look up final scores from the
   manually entered market/selection. Set
   `UNLINKED_SETTLEMENT_SEARCH_MODE=disabled` to skip this lookup.
   `UNLINKED_SETTLEMENT_SEARCH_FALLBACK_MODELS` is an optional
   comma-separated list of backup AI Gateway models tried in order when the
   primary model fails or is rate-limited (defaults to a few `openai/`
   models so the OpenAI `web_search` tool stays valid). Transient failures
   (rate limits, 5xx, network errors) leave the bet `matched` so the cron
   retries it on the next run instead of flagging it for manual review.

   Optional settled-bet edit allowlists:

   ```bash
   SETTLED_BET_EDIT_USER_IDS=
   SETTLED_BET_EDIT_USER_EMAILS=
   ```

4. Apply database migrations:

   ```bash
   pnpm db:migrate
   ```

5. Start the app:

   ```bash
   pnpm dev
   ```

Then open [http://localhost:3000](http://localhost:3000).

## Useful scripts

- `pnpm dev` - run local Next.js dev server
- `pnpm build` - run DB migration then production build
- `pnpm start` - start production server
- `pnpm lint` - run Ultracite checks
- `pnpm format` - auto-fix formatting
- `pnpm db:generate` - generate Drizzle SQL
- `pnpm db:migrate` - apply latest DB migrations
- `pnpm db:studio` - open Drizzle Studio
- `pnpm test` - run Playwright tests
- `pnpm test:unit` - run unit tests
- `pnpm test:integration` - run integration tests with `REAL_AI=true`

## Migration operations and release gate

- Manual migration job: `.github/workflows/db-migrate.yml`
  - Run from GitHub Actions with `workflow_dispatch`
  - Uses environment-scoped secret `POSTGRES_URL_NON_POOLING`
  - Supports `production` or `preview` target environment
- Migration integrity gate: `.github/workflows/migration-integrity.yml`
  - Runs on PRs and pushes to `main`
  - Executes `pnpm db:generate` and fails if generated files under `lib/db/migrations` differ from committed artifacts

To enforce this as a hard release gate, set `Migration Integrity / Verify drizzle migration artifacts are committed` as a required status check in branch protection for `main`.

## Specs

See `specs/README.md` for the full spec index, including:

- `product.md`
- `data-model.md`
- `ai-autoparse.md`
- `lifecycle.md`
- `reporting.md`
- `import-export.md`
- `ui-ux.md`
