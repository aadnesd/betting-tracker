# Local Auth Testing Reference

This matched-betting app uses Google OAuth for normal sign-in. For local browser-driven testing, use the test-only Auth.js route instead of trying to automate OAuth.

## Full Browser Auth

Start the server with `PLAYWRIGHT=true`, then call:

```http
POST /api/auth/test
content-type: application/json

{"email":"test-agent@example.com"}
```

The route:

- creates or finds a test user
- signs an Auth.js session token with `AUTH_SECRET`
- sets the normal Auth.js cookie, usually `authjs.session-token` in development
- returns `cookieName`, `token`, `userId`, and an `x-test-user-id` response header

When using browser automation, call the route from the app origin so the browser stores the `Set-Cookie` header:

```js
const response = await fetch("/api/auth/test", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: `test-agent-${Date.now()}@playwright.com` }),
});
```

Once that response succeeds, navigate to protected pages normally.

## Header Fallback Scope

`x-test-user-id` is not a universal bypass. It only works for handlers that use the repo's test-aware session helper. In this app, the important fallback routes are:

- `/api/bets/screenshots`
- `/api/bets/autoparse`
- `/api/bets/create-matched`

Most other authenticated pages and APIs still require the Auth.js session cookie.

## Playwright Helper Pattern

The repo's `tests/helpers.ts` pattern is:

1. Build `baseUrl` from `PLAYWRIGHT_HOST` or `HOST`, plus `PORT`.
2. `POST` to `${baseUrl}/api/auth/test` with a test email.
3. Read `{ cookieName, token }` from the JSON response.
4. Add the cookie to the browser context with domain `new URL(baseUrl).hostname`, path `/`, `httpOnly: true`, and `sameSite: "Lax"`.
5. Save storage state and create a new context using that state.
6. Add `x-test-user-id` as an extra header only when needed for screenshot intake API fallback.

## Decision Rule

- Need authenticated pages or most `/api/bets/*` routes: use `/api/auth/test` and the Auth.js cookie.
- Need only the screenshot upload, autoparse, create-matched pipeline in test mode: the cookie works; `x-test-user-id` can be used as an additional fallback.
- Need OAuth UI behavior: inspect `/login`, but do not use OAuth as the normal local automation path.
