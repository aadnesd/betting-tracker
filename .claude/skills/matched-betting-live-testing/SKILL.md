---
name: matched-betting-live-testing
description: Live-test the Next.js matched-betting tracker locally with browser automation. Use when asked to start or verify the local app, bypass OAuth for local testing, seed an authenticated test user with PLAYWRIGHT=true and /api/auth/test, inspect protected routes such as /bets, /bets/new, /bets/quick-add, or validate user-facing matched-betting flows through agent-browser or Playwright.
allowed-tools: Bash(agent-browser:*), Bash(pnpm:*), Bash(rg:*), Bash(sed:*), Bash(curl:*)
---

# Matched Betting Live Testing

Use this skill to exercise the local matched-betting app as an authenticated user without automating Google OAuth.

## Quick Start

1. Confirm `.env.local` exists and includes the required local app values, especially `AUTH_SECRET` and database credentials.
2. Start the dev server in Playwright mode:

```bash
PLAYWRIGHT=true HOST=127.0.0.1 PORT=3000 pnpm dev --hostname 127.0.0.1 --port 3000
```

3. Open the app with browser automation:

```bash
agent-browser open http://127.0.0.1:3000
```

4. Seed auth from the browser page using the same-origin test route:

```bash
agent-browser eval "async () => { const email = 'test-agent-' + Date.now() + '@playwright.com'; const response = await fetch('/api/auth/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }); const body = await response.json().catch(() => null); return { ok: response.ok, status: response.status, email, body, userId: response.headers.get('x-test-user-id') }; }"
```

5. Navigate to a protected route such as `/bets` and verify it does not redirect to `/login`:

```bash
agent-browser open http://127.0.0.1:3000/bets
agent-browser snapshot
```

If `/api/auth/test` returns `403`, the server was not started with `PLAYWRIGHT=true`.

## Auth Rules

- Use `/api/auth/test` for local live testing of pages and most APIs.
- Do not automate the Google OAuth flow for local testing.
- The route returns and sets the Auth.js session cookie; this cookie unlocks protected pages and handlers that call `auth()`.
- It also returns `x-test-user-id`, but that header is only a supplement.
- Treat `x-test-user-id` alone as valid only for screenshot intake pipeline routes that use `getTestAwareSession()`.

The narrow header-only fallback applies to:

- `/api/bets/screenshots`
- `/api/bets/autoparse`
- `/api/bets/create-matched`

For accounts, wallets, reporting, Quick Add, settled-bet editing, and most CRUD APIs, seed the Auth.js cookie through `/api/auth/test`.

## Testing Workflow

Before testing:

1. Read `specs/*` when the task touches matched-betting behavior.
2. Check the relevant route or component so selectors and expected states match the current implementation.
3. Start the server with `PLAYWRIGHT=true`; reuse an existing server only if it was started that way.

During testing:

1. Seed auth once per browser session.
2. Use `agent-browser snapshot` after navigation and after important form actions.
3. Prefer user-facing flows first, then API or database checks when the UI cannot expose the needed state.
4. Capture screenshots only when visual state matters or the user asks.

After testing:

1. Confirm the final route, visible state, toast, table row, or detail page proves the intended behavior.
2. Report auth setup details if they explain why a route behaved differently from expected.
3. Close browser sessions you opened when they are no longer needed.

## Common Routes

- Dashboard: `/bets`
- Screenshot intake: `/bets/new`
- Quick Add: `/bets/quick-add`
- All bets: `/bets/all`
- Matched bets: `/bets/matched`
- Review queue: `/bets/review`
- Bankroll: `/bets/bankroll`
- Reports: `/bets/reports`
- Account settings: `/bets/settings/accounts`

## Troubleshooting

- `403` from `/api/auth/test`: restart the app with `PLAYWRIGHT=true`.
- Redirect to `/login` after auth seeding: verify the fetch was sent from the same origin as the app and returned `ok: true`.
- `401` from an API while `x-test-user-id` is present: that route likely calls `auth()` directly; seed the cookie instead.
- `401` or DB errors during `/api/auth/test`: check `.env.local`, `AUTH_SECRET`, and local database connectivity.
- Screenshot parsing returns deterministic or stubbed results: that is expected for some Playwright-mode paths; check the task requirements before treating it as a failure.

Read `references/local-auth-testing.md` for the underlying auth split and the Playwright helper pattern.
