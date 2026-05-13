---
name: matched-betting-screenshot-intake
description: Operate the matched-betting tracker as a user to create a matched set from back and lay screenshots. Use when asked to upload, paste, parse, review, save, demo, or test the screenshot/AI intake flow for matched bets.
allowed-tools: Bash(agent-browser:*), Bash(pnpm:*), Bash(rg:*), Bash(sed:*)
---

# Matched Betting Screenshot Intake

Use this skill for the user-facing screenshot intake flow that uploads or pastes back and lay bet screenshots, parses them, lets the user review fields, and saves a matched set.

## Entry Point

- Page: `/bets/new`
- Dashboard action: `/bets` -> `New bet`
- Upload API: `/api/bets/screenshots`
- Parse API: `/api/bets/autoparse`
- Save API: `/api/bets/create-matched`
- Test images: `tests/test-images/`

If the app is not running, start it with `pnpm dev` and use `agent-browser` to operate the UI.

## User Flow

1. Open `/bets/new` as a signed-in user.
2. Provide a bookmaker/back screenshot and an exchange/lay screenshot.
3. Use paste zones when available; file upload remains a valid fallback.
4. Wait for upload and AI parsing to finish.
5. Review parsed market, selection, odds, stakes, accounts, currencies, and match link.
6. Correct any wrong or low-confidence fields before saving.
7. Save the matched bet.

The app should preserve screenshots for audit and create both bet legs plus the matched set.

## Review Rules

- Treat low-confidence or ambiguous fields as requiring manual review.
- If match linking is wrong, update the match selection before saving.
- If account matching is missing or wrong, select the correct bookmaker or exchange.
- If only one screenshot is available, create or expect a draft rather than a complete matched set.

Read `references/screenshot-intake-contract.md` when you need exact endpoint sequencing, payload shapes, expected statuses, or test fixtures.

## Verification

After save:

1. Confirm the UI shows success and the matched bet is visible from dashboard, `/bets/matched`, or `/bets/all`.
2. Confirm the matched set includes one back bet and one lay bet.
3. Confirm screenshots are associated with the saved bet legs.
4. Confirm status is `matched` unless parsing confidence or missing data requires `needs_review` or `draft`.
