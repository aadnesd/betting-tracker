# Ralph Planning Prompt — Matched Betting Tracker

Study `specs/*` to learn the product specifications and `fix_plan.md` to understand the current plan.

The source code is in `app/`, `components/`, `lib/`, `hooks/`, `tests/`.

The AI screenshot autoparse flow exists in:
- `app/(chat)/api/bets/screenshots/route.ts`
- `app/(chat)/api/bets/autoparse/route.ts`
- `app/(chat)/api/bets/create-matched/route.ts`
Study these and ensure the plan accounts for their extension.

## Planning Tasks

**Task 1:** Study `fix_plan.md` (it may be incorrect). Use subagents (5-10 max per domain area) to compare existing code against `specs/*`. Search for TODOs, minimal implementations, placeholders.

**Task 2:** Study UI flows and data models vs specs (AI screenshot intake, reconciliation, reporting). Update `fix_plan.md` with gaps.

## Exit Criteria
Planning is complete when:
- `fix_plan.md` has ≤20 prioritized, concrete, testable items
- Each item has a checkbox and clear definition of done
- No vague "audit" or "verify" tasks remain

## Rules
- Do not assume something is missing without searching first.
- If specs are missing, search before creating under `specs/`.
- If you create a new spec, add implementation items to `fix_plan.md`.

ULTIMATE GOAL: a fully working matched‑betting tracker with AI‑assisted intake, reconciliation, and reporting.
