---
name: matched-betting-quick-add
description: Operate the matched-betting tracker as a user to create a matched set manually via Quick Add. Use when asked to add, test, demo, or document manual matched bet entry, including promo/free-bet usage, bookmaker and exchange selection, match linking, and post-create verification.
allowed-tools: Bash(agent-browser:*), Bash(pnpm:*), Bash(rg:*), Bash(sed:*)
---

# Matched Betting Quick Add

Use this skill to perform the user-facing Quick Add flow for a matched set.

## Entry Point

- Page: `/bets/quick-add`
- Dashboard action: `/bets` -> `Quick Add`
- Main component: `components/bets/quick-add-form.tsx`
- API route: `app/(chat)/api/bets/quick-add/route.ts`

If the app is not running, start it with `pnpm dev` and use the shown localhost URL. If a browser session is needed, use `agent-browser`.

## Before Creating

1. Confirm the user is signed in.
2. Confirm there is at least one active bookmaker and one active exchange.
3. If the page warns that accounts are missing, add accounts from `/bets/settings/accounts/new`, then return to `/bets/quick-add`.
4. If the task mentions a free bet, confirm it exists and is active under `/bets/settings/promos`.

## Fill The Form

Required fields:

- `Market`: event or market name, for example `Arsenal vs Chelsea`.
- `Selection`: selected outcome, for example `Arsenal to Win`.
- `Back Bet`: bookmaker, currency, odds greater than `1.0`, stake greater than `0`.
- `Lay Bet`: exchange, currency, odds greater than `1.0`, stake greater than `0`.

Optional fields:

- `Link to Match`: search and select a synced football match for auto-settlement.
- `Match Odds Selection`: choose home, draw, or away after linking a match.
- `Promo Type`: choose from the dropdown when the bet is tied to an offer.
- `Use a Free Bet`: appears for `Free Bet` and `Risk-Free Bet`; selecting one fills stake and currency from the free bet.
- `Notes`: keep any user-provided context.

Submit with `Create Matched Bet`.

## Expected Result

Successful creation:

- Shows a success toast.
- Redirects to `/bets`.
- Creates two manual placeholder screenshots, one back bet, one lay bet, and one matched set.
- Matched set status is `matched`.
- Notes are stored with a `[Manual Entry]` prefix.
- If a free bet was selected, it is marked used and linked to the matched set.

Read `references/quick-add-contract.md` when you need exact API payloads, validation behavior, or deeper verification.

## Verification

Use the UI first when validating a user operation:

1. Check the dashboard or matched bets list for the new item.
2. Open the matched set detail if available.
3. Verify market, selection, accounts, odds, stakes, currency, promo/free-bet state, and net exposure.

Use API-level or database-level checks only when the user asks for implementation verification or the UI cannot expose the needed detail.
