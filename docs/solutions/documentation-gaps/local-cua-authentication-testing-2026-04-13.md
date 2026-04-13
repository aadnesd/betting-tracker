---
title: Local CUA authentication for testing
date: 2026-04-13
category: documentation-gaps
module: local CUA testing
problem_type: documentation_gap
component: authentication
severity: medium
applies_when:
  - Running local browser-driven tests or CUA sessions against authenticated routes
  - Using Playwright or agent-browser with PLAYWRIGHT=true
  - Verifying matched-betting flows that require a signed-in user
symptoms:
  - UI login gets stuck at Google OAuth instead of producing a usable local test session
  - Requests that only send x-test-user-id still return 401 on most authenticated pages and APIs
  - Screenshot intake routes work in test mode while other authenticated routes still fail
root_cause: inadequate_documentation
resolution_type: documentation_update
tags: [cua, playwright, authjs, local-testing, authentication, api-auth-test, x-test-user-id]
---

# Local CUA authentication for testing

## Context

This repo supports local authenticated testing, but the working path is easy to misunderstand if you only skim the auth code. The app uses Google OAuth for normal sign-in, while local Playwright runs rely on a test-only auth route and a narrower header-based fallback for a few screenshot intake APIs.

The missing piece was a single explanation of which auth path to use for local CUA work and where the fallback does and does not apply.

## Guidance

For local CUA work, treat authentication as two separate mechanisms:

1. **Full browser auth for pages and most APIs**

   Use `POST /api/auth/test` while `PLAYWRIGHT=true` is enabled. That route:

   - creates or finds a user via `findOrCreateOAuthUser`
   - signs an Auth.js session token with `AUTH_SECRET`
   - sets the normal Auth.js cookie (`authjs.session-token` in development)
   - returns `x-test-user-id` for callers that also need the narrow API fallback

   This is the mechanism used by the Playwright fixtures in [tests/helpers.ts](/Users/adne.skjelbreid.djuve/Documents/Codeprojects/nextjs-ai-chatbot/tests/helpers.ts:17) and [tests/fixtures.ts](/Users/adne.skjelbreid.djuve/Documents/Codeprojects/nextjs-ai-chatbot/tests/fixtures.ts:10).

   ```ts
   const response = await page.request.post(`${baseUrl}/api/auth/test`, {
     data: { email: `test-${name}@playwright.com` },
   });

   const { cookieName, token } = await response.json();
   const userIdHeader = response.headers()["x-test-user-id"] ?? null;

   await context.addCookies([
     {
       name: cookieName,
       value: token,
       domain: new URL(baseUrl).hostname,
       path: "/",
       httpOnly: true,
       sameSite: "Lax",
     },
   ]);
   ```

   If your CUA agent needs to browse authenticated pages like `/bets`, `/bets/new`, `/bets/all`, or call most `/api/bets/*` routes, this cookie-based path is the one that matters.

2. **Header fallback for three screenshot-intake APIs only**

   In test environments, [lib/auth.ts](/Users/adne.skjelbreid.djuve/Documents/Codeprojects/nextjs-ai-chatbot/lib/auth.ts:9) provides `getTestAwareSession()`. It first tries normal `auth()`, then falls back to `x-test-user-id` only when test mode is active.

   That fallback is only used by:

   - [app/(chat)/api/bets/screenshots/route.ts](/Users/adne.skjelbreid.djuve/Documents/Codeprojects/nextjs-ai-chatbot/app/(chat)/api/bets/screenshots/route.ts:43)
   - [app/(chat)/api/bets/autoparse/route.ts](/Users/adne.skjelbreid.djuve/Documents/Codeprojects/nextjs-ai-chatbot/app/(chat)/api/bets/autoparse/route.ts:97)
   - [app/(chat)/api/bets/create-matched/route.ts](/Users/adne.skjelbreid.djuve/Documents/Codeprojects/nextjs-ai-chatbot/app/(chat)/api/bets/create-matched/route.ts:155)

   Middleware also allows requests through in Playwright mode when `x-test-user-id` is present, but that does **not** create a real session for route handlers that still call `auth()` directly. Those handlers will still treat the request as unauthenticated.

3. **Assume OAuth UI login is not the local automation path**

   The login and register pages call `signIn("google")` directly in server actions. That is fine for real users, but it is not the reliable path for agent-driven local testing. Use `/api/auth/test` instead of trying to automate the Google OAuth flow.

## Why This Matters

Without this distinction, local CUA sessions fail in confusing ways:

- a browser appears to be "in test mode" but `/bets` still redirects to `/login`
- an API call succeeds against the screenshot pipeline and then fails on the next authenticated route
- an agent incorrectly assumes `x-test-user-id` is a universal bypass because middleware accepts it

The actual rule is simpler: **cookie auth is the general solution; `x-test-user-id` is a narrow supplement for the screenshot intake pipeline.**

## When to Apply

- When running `pnpm test`, which starts the app with `PLAYWRIGHT=true`
- When using CUA or browser automation locally against authenticated matched-betting flows
- When you need a deterministic signed-in user without going through Google OAuth
- When debugging why some test requests succeed but others still return `401 Unauthorized`

## Examples

**Use this for a real authenticated browser session**

Follow the Playwright fixture pattern:

1. Start the app with `PLAYWRIGHT=true`.
2. `POST` to `/api/auth/test` with a unique email.
3. Add the returned Auth.js cookie to the browser context.
4. Reuse the returned `x-test-user-id` header only if you also need to hit the screenshot intake pipeline directly.

That produces a browser context that can load authenticated pages and call APIs that use normal `auth()`.

**Do not assume this works everywhere**

This request shape is only sufficient for the screenshot pipeline:

```http
POST /api/bets/autoparse
x-test-user-id: <test-user-id>
```

It works there because the route calls `getTestAwareSession()`. The same header alone is not enough for routes that call `auth()` directly, such as account, wallet, reporting, or most CRUD APIs.

**Quick local decision rule**

- Need to browse pages or use most authenticated APIs: seed the Auth.js cookie through `/api/auth/test`
- Need to exercise only screenshot upload -> autoparse -> create-matched in test mode: cookie auth still works, but `x-test-user-id` can additionally support those three handlers
- Need to automate `/login`: avoid it for local tests unless you intentionally want to inspect the OAuth UI shell

## Related

- [docs/page-load-performance-auth-session.md](/Users/adne.skjelbreid.djuve/Documents/Codeprojects/nextjs-ai-chatbot/docs/page-load-performance-auth-session.md:1) documents a local performance benchmark that already uses `PLAYWRIGHT=true` and `/api/auth/test`
- [README.md](/Users/adne.skjelbreid.djuve/Documents/Codeprojects/nextjs-ai-chatbot/README.md:25) and [AGENTS.md](/Users/adne.skjelbreid.djuve/Documents/Codeprojects/nextjs-ai-chatbot/AGENTS.md:13) mention Playwright and local setup, but they do not currently explain the auth split for local CUA work
