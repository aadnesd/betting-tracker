# Repository Guidelines

## Matched Betting Domain
This is a matched-betting tracker. Read `specs/*` for product requirements before making changes.

**Existing API routes (extend, don't replace):**
- `app/(chat)/api/bets/screenshots/route.ts` – upload screenshots
- `app/(chat)/api/bets/autoparse/route.ts` – AI parse screenshots
- `app/(chat)/api/bets/create-matched/route.ts` – save matched bet

**Key domain concepts:** Accounts, Bets, MatchedSets, Screenshots, Promos, Transactions (see `specs/data-model.md`).

## Project Structure & Module Organization
- `app/` – Next.js App Router routes and server actions; keep server components default, mark interactive entries with `"use client"`.
- `components/` – Reusable UI primitives; prefer PascalCase filenames per component.
- `lib/` – Domain logic (`lib/ai`, `lib/db`, `lib/editor`, utilities). Drizzle schema, queries, and migrations live in `lib/db/`.
- `hooks/` – Reusable React hooks (`use*` naming).
- `public/` – Static assets; `public/fonts` and images referenced by routes.
- `tests/` – Playwright suites (`tests/e2e`, `tests/routes`).
- `artifacts/` – Generated assets (e.g., compiled prompts or exports); avoid hand edits.

## Build, Test, and Development Commands
- Install: `pnpm install`
- Run dev server: `pnpm dev` (Next.js with Turbopack).
- Full build: `pnpm build` (runs `tsx lib/db/migrate` before `next build`).
- Start production build: `pnpm start`
- Lint: `pnpm lint` (Ultracite/Biome rules; fails on style issues).
- Format: `pnpm format` (auto-fixes style).
- Database: `pnpm db:generate` (emit Drizzle SQL), `pnpm db:migrate` (apply latest), `pnpm db:studio` (inspect DB).
- Tests: `pnpm test` (Playwright; starts `pnpm dev`, targets `http://localhost:$PORT/ping`).
- Sandbox tip: if you hit EPERM on `~/Library/Application Support`, run db/tools or tests with `HOME=$PWD/.home`.
- Sandbox tip: if `pnpm db:generate` hangs in the sandbox, run `HOME=$PWD/.home ./node_modules/.bin/drizzle-kit generate`.
- agent-browser open <url>              # Navigate to URL (aliases: goto, navigate)
- agent-browser click <sel>             # Click element
- agent-browser dblclick <sel>          # Double-click element
- agent-browser focus <sel>             # Focus element
- agent-browser type <sel> <text>       # Type into element
- agent-browser fill <sel> <text>       # Clear and fill
- agent-browser press <key>             # Press key (Enter, Tab, Control+a) (alias: key)
- agent-browser keydown <key>           # Hold key down
- agent-browser keyup <key>             # Release key
-    agent-browser select <sel> <val>      # Select dropdown option
 -   agent-browser uncheck <sel>           # Uncheck checkbox
-    agent-browser hover <sel>             # Hover element
 -   agent-browser scroll <dir> [px]       # Scroll (up/down/left/right)
  -  agent-browser check <sel>             # Check checkbox
   - agent-browser scrollintoview <sel>    # Scroll element into view (alias: scrollinto)
  -  agent-browser drag <src> <tgt>        # Drag and drop
   - agent-browser upload <sel> <files>    # Upload files
   -agent-browser screenshot [path]       # Take screenshot (--full for full page, base64 png to stdout if 
    -agent-browser pdf <path>              # Save as PDF
You - agent-browser snapshot                # Accessibility tree with refs (best for AI)
   - agent-browser eval <js>               # Run JavaScript
    -agent-browser connect <port>          # Connect to browser via -
   - agent-browser close                   # Close browser (aliases: quit, exit)


## Coding Style & Naming Conventions
- TypeScript strict mode; path alias `@/*`.
- Formatting is source of truth—run `pnpm format` before commit; prefer no manual style tweaks.
- Components: PascalCase files/exports; hooks: `useThing`; utilities: `camelCase` functions; schemas/types: `PascalCase`.
- Routes and folders: kebab-case; avoid deep nesting without route groups.
- Prefer server components; only add `"use client"` when stateful/interactive.
- Keep React state minimal; lift data fetching to server actions where possible.

## Testing Guidelines
- Playwright config in `playwright.config.ts`; tests parallelized and retried only on CI.
- Add new suites under `tests/e2e` or `tests/routes`; name files `*.test.ts`.
- Test images for AI autoparse live in `tests/test-images/` (e.g., `bet2.png`, `bet3.png`).
- Local runs require `.env.local` (pulled from Vercel) so app and DB resolve correctly.
- When adding UI, include minimal happy-path and error-path coverage; keep fixtures deterministic.
- Sandbox tip: if Playwright webServer fails to bind with `EPERM`, run tests in a local environment that allows binding or reuse an already-running dev server.

## Database & Configuration
- Drizzle schema: `lib/db/schema.ts`; queries: `lib/db/queries.ts`; helpers: `lib/db/helpers/`.
- Migrations are TypeScript—do not hand-edit generated SQL. Regenerate with `pnpm db:generate` and apply with `pnpm db:migrate`.
- Never commit secrets; use `.env.local` (ignored). Document new env keys (e.g., `AI_GATEWAY_API_KEY`, `FXRATES_API_KEY`) in `README.md` or a commit note.

## Commit & Pull Request Guidelines
- Use concise, present-tense messages; Conventional Commit prefixes (`feat:`, `fix:`, `chore:`, `test:`, `docs:`) are preferred.
- Keep diffs scoped; include formatting changes in separate commits when possible.
- Before opening a PR: run `pnpm format`, `pnpm lint`, `pnpm build`, and `pnpm test` locally.
- PR description should summarize intent, list major changes, link issues/Linear tickets, and attach screenshots or screen recordings for UI changes (desktop + mobile states).
- Mention migration or env impacts explicitly in the PR body so reviewers can apply them.
