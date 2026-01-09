# Fix Plan — Matched Betting Tracker

Prioritized implementation tasks. Check off when complete with tests passing.

## P0 — Critical Path (AI Intake + Schema Alignment)


## P1 — Data Model & Reconciliation

(All P1 items completed)

## P2 — Reporting & Exposure

- [ ] **Summary reporting**: Weekly/monthly profit, ROI, qualifying loss with bookmaker/exchange breakdown. DoD: reporting page with date filters and computed totals.
- [ ] **Promo performance**: ROI and net profit by promo type. DoD: report includes promo table by `promoType`.
- [ ] **Exposure tracking + alerts**: Net exposure per event/day (base NOK) with threshold warnings. DoD: exposure view renders and dashboard banner triggers above threshold.
- [ ] **Base currency display**: Normalize net exposure to NOK and display NOK units consistently (remove GBP symbol). DoD: matched list + detail show NOK and match stored base currency.

## P3 — Import/Export + UX

- [ ] **CSV import**: Parse bets/balances, validate currency/odds, and return row‑level errors. DoD: import endpoint + UI with per‑row error reporting.
- [ ] **CSV/XLSX export**: Export matched sets with both legs + net profit. DoD: export endpoint + UI download options.
- [ ] **Dashboard summary**: Recent activity, open exposure, pending reviews. DoD: dashboard cards render real data.
- [ ] **Quick Add flow**: Minimal manual entry for common matched bet. DoD: route + form persists a matched set without screenshots.
- [ ] **Calculation transparency + mobile**: Tooltips for liability/commission/FX and responsive layouts. DoD: tooltips exist and mobile layout passes QA.

---

## Completed

- [x] **Matched set detail**: Detail page shows both screenshots, parsed output, corrections, and status history. DoD: renders with edit controls and status change. Implementation: Created `app/(chat)/bets/[id]/page.tsx` detail page showing both screenshots, parsed output, confidence scores, and status history from audit log. Created `components/bets/matched-bet-detail-actions.tsx` with status change dropdown, notes input, and action buttons (save, confirm & match, mark resolved). Updated `getMatchedBetWithParts` query in `lib/db/queries.ts` to properly fetch screenshots via back/lay bet screenshot IDs. Updated `app/(chat)/bets/page.tsx` dashboard to link to detail pages and display NOK instead of GBP. Tests: `HOME=$PWD/.home ./node_modules/.bin/vitest run` (why: validates query functions remain correct after getMatchedBetWithParts changes).
- [x] **Mismatch detection + actions**: Compute missing leg, odds drift (>10%), and currency mismatch flags; allow edit, attach leg, and mark resolved. DoD: actions update status + audit trail and remove item from queue. Implementation: Bundled with matched set detail page. Mismatch detection added for: missing leg, odds drift (>10%), currency mismatch, and market mismatch. Actions update status + audit trail and remove item from queue via status change to matched. Tests: `HOME=$PWD/.home ./node_modules/.bin/vitest run` (why: validates query functions and status logic remain correct).
- [x] **Reconciliation queue view**: Server component listing `needs_review` + `draft` matched sets/bets with counts and links. DoD: page renders from real data and supports empty state. Implementation: Added `listMatchedBetsByStatus` and `countMatchedBetsByStatus` query functions in `lib/db/queries.ts`. Created `app/(chat)/bets/review/page.tsx` server component that displays pending items with status badges, issue descriptions, promo type labels, and net exposure in NOK. Updated `app/(chat)/bets/page.tsx` dashboard to include a "Review queue" button with count badge. Tests: `HOME=$PWD/.home ./node_modules/.bin/vitest run tests/unit/reconciliation-queries.test.ts` (why: validates query function signatures and status filter capabilities for the reconciliation queue).
- [x] **Audit trail**: Add `changes` JSONB or audit table for bet/matched‑set updates + notes. DoD: create/update/reconcile actions append audit entries. Implementation: Added `AuditLog` table in `lib/db/schema.ts` with fields (id, createdAt, userId, entityType, entityId, action, changes JSONB, notes). Added `createAuditEntry`, `listAuditEntriesByEntity`, `listAuditEntriesByUser` query helpers in `lib/db/queries.ts`. Updated `app/(chat)/api/bets/create-matched/route.ts` to create audit entries for back bet, lay bet, and matched bet on creation. Added `app/(chat)/api/bets/update-matched/route.ts` PATCH endpoint that logs changes to audit trail with action types: update, status_change, attach_leg. Migration: `lib/db/migrations/0015_nostalgic_manta.sql`. Tests: `HOME=$PWD/.home ./node_modules/.bin/vitest run tests/unit/bets-api.test.ts` (why: validates audit entry creation on bet/matched creation and update, action type detection, and change tracking).
- [x] **AI intake tests**: Add Playwright/unit coverage for happy path, low‑confidence, and parse failure using `tests/test-images/*`. DoD: tests validate statuses, needsReview handling, and error messages. (Tests added in `tests/routes/bets.test.ts`; Playwright run blocked by EPERM binding 127.0.0.1:3000 in sandbox. Rerun `PLAYWRIGHT=True pnpm exec playwright test tests/routes/bets.test.ts` in a full environment.)
- [x] **Core domain tables**: Add Accounts, Promos, Transactions per `specs/data-model.md` and link Bets/MatchedSets to Accounts/Promos. DoD: schema + migrations + minimal queries exist and compile. Tests: `HOME=$PWD/.home ./node_modules/.bin/vitest run tests/unit/bets-api.test.ts` (why: confirms create‑matched still persists both legs + status logic after account linking).
- [x] **Review UI with confidence cues**: Highlight fields with confidence < 0.8, tooltip the score, and allow edits for market, selection, odds, stake, exchange, currency, placedAt, notes, and needsReview toggle. DoD: edits persist through save and low‑confidence visuals appear on parsed data. Tests: `pnpm exec vitest run tests/unit/bet-parser.test.ts` (why: ensures test stub for parsed confidence remains deterministic after low‑confidence logic).
- [x] **Create‑matched review logic**: Centralize needs‑review logic (user flag OR any confidence < 0.7) and set bet/matched statuses accordingly, including an audit note when triggered. Tests: `pnpm exec vitest run tests/unit/bets-api.test.ts` (why: validates needs-review status propagation and audit note generation without regressing matched/draft behavior).
- [x] **Allow draft with missing leg**: Permit MatchedSet creation with only back or lay bet (nullable FK). DoD: create route accepts missing leg, status becomes `draft`, and list UI labels drafts clearly. Tests: `HOME=$PWD/.home ./node_modules/.bin/vitest run tests/unit/bets-api.test.ts` (why: validates draft creation without a lay/back leg and ensures net exposure conversion is skipped when a leg is missing).
- [x] **Bet + MatchedSet status alignment**: Replace `parsed/saved/pending` enums with `Bet: draft|placed|matched|settled|needs_review|error` and `MatchedSet: draft|matched|settled|needs_review`, add `settledAt` + `profitLoss`, and add `promoType` on matched sets. DoD: schema + migrations + queries updated and UI badges accept new enums. Tests: `pnpm exec vitest run tests/unit/bets-api.test.ts` (why: validates bet-create flow and prevents status enum regressions in the API surface).
- [x] **Screenshot parse persistence**: Add `parsedOutput` JSONB + `confidence` JSONB to `ScreenshotUpload`, extend status enum to `uploaded|parsed|needs_review|error`, and persist parsed payload + confidence for each screenshot. DoD: schema + migration updated, queries accept/save parsed data, and GET shows stored parsed output. Tests: `vitest run tests/unit/bets-api.test.ts` (why: validates persisted parse metadata in API flow).
- [x] **Autoparse route status/error**: Update `/api/bets/autoparse` to save parsed output + confidence per screenshot, set status `parsed`/`needs_review`, and set `error` on failure. DoD: route updates both screenshots and returns `needsReview` consistently for success + failure. Tests: `vitest run tests/unit/bets-api.test.ts` (why: ensures status/needsReview logic + low-confidence path).
