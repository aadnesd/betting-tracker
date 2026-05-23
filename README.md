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
   UNLINKED_SETTLEMENT_SEARCH_MODEL=
   UNLINKED_SETTLEMENT_SEARCH_MODE=
   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=
   AZURE_DOCUMENT_INTELLIGENCE_KEY=
   AUTH_SECRET=
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GMAIL_REDIRECT_URI=
   GMAIL_TOKEN_ENCRYPTION_KEY=
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   ```

   `AI_GATEWAY_API_KEY` enables auto-settlement fallback for matched sets that
   are not linked to a synced football match. The cron uses AI Gateway
   (`openai/gpt-5.4-mini` by default) to look up final scores from the
   manually entered market/selection. Set
   `UNLINKED_SETTLEMENT_SEARCH_MODE=disabled` to skip this lookup.

   `GMAIL_REDIRECT_URI` and `GMAIL_TOKEN_ENCRYPTION_KEY` enable Gmail promotion
   intake. The redirect URI should point at `/api/bets/gmail/callback`.
   Generate a 32-byte token encryption key with `openssl rand -hex 32`.

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
