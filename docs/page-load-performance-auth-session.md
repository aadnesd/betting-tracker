# Auth Session Performance Validation (2026-02-18)

## Summary
Caching user-existence checks in the Auth.js `session` callback reduced warm authenticated page-load latency across key matched-betting routes in local dev testing.

Implementation commit: `2aaa4b2` (`app/(auth)/auth.ts`).

## Measurement setup
- Benchmark script: `scripts/test-page-load-performance.ts` (`pnpm perf:pages`)
- Auth mode: `PLAYWRIGHT=true` using `/api/auth/test`
- Base URL: `http://127.0.0.1:3102`
- Routes: `/bets`, `/bets/new`, `/bets/all`
- Sampling: one warmup + 3 measured runs per route
- Metrics: wall-clock navigation time, TTFB (`responseStart`), DCL, and load from Navigation Timing

## Results
### Baseline (before cache)
- `/bets`: wall `385.67ms`, TTFB `310.33ms`
- `/bets/new`: wall `337.67ms`, TTFB `285.67ms`
- `/bets/all`: wall `343.33ms`, TTFB `286ms`

### Immediate post-change run
- `/bets`: wall `296ms`, TTFB `219.33ms`
- `/bets/new`: wall `297.67ms`, TTFB `242.67ms`
- `/bets/all`: wall `233.33ms`, TTFB `174.67ms`

### Validation rerun (fresh dev server)
- `/bets`: wall `268ms`, TTFB `192.33ms`
- `/bets/new`: wall `203.67ms`, TTFB `148.33ms`
- `/bets/all`: wall `198ms`, TTFB `144.33ms`

## Change vs baseline (validation rerun)
- `/bets`: wall `-30.5%`, TTFB `-38.0%`
- `/bets/new`: wall `-39.7%`, TTFB `-48.1%`
- `/bets/all`: wall `-42.3%`, TTFB `-49.5%`

## Caveats
- These measurements are from Next.js dev mode with warm route samples; production mode numbers will differ.
- Auth/session overhead is reduced, but full end-to-end page speed should be validated in a production-like profile (`pnpm build && pnpm start`) and with cold navigations.
