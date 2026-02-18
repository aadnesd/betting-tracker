/**
 * Measures authenticated page-load timings using Playwright.
 *
 * Usage:
 *   PLAYWRIGHT=true pnpm perf:pages
 *
 * Optional env vars:
 *   BASE_URL=http://127.0.0.1:3000
 *   PERF_ROUTES=/bets,/bets/new,/bets/all
 *   PERF_REPEATS=3
 */

import { type BrowserContext, chromium } from "@playwright/test";

type Sample = {
  wallMs: number;
  ttfbMs: number | null;
  domContentLoadedMs: number | null;
  loadMs: number | null;
};

type Summary = {
  route: string;
  runs: number;
  avgWallMs: number;
  avgTtfbMs: number | null;
  avgDomContentLoadedMs: number | null;
  avgLoadMs: number | null;
};

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const ROUTES = (process.env.PERF_ROUTES || "/bets,/bets/new,/bets/all")
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);
const REPEATS = Number(process.env.PERF_REPEATS || "3");

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: Array<number | null>): number | null {
  const defined = values.filter((value): value is number => value !== null);
  if (defined.length === 0) {
    return null;
  }
  return round(
    defined.reduce((total, value) => total + value, 0) / defined.length
  );
}

async function authenticate(context: BrowserContext) {
  const page = await context.newPage();
  const email = `perf-${Date.now()}@playwright.com`;
  const response = await page.request.post(`${BASE_URL}/api/auth/test`, {
    data: { email },
  });

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Test auth failed (${response.status()}): ${text}`);
  }

  const { cookieName, token } = await response.json();
  const cookieDomain = new URL(BASE_URL).hostname;

  await context.addCookies([
    {
      name: cookieName,
      value: token,
      domain: cookieDomain,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.close();
}

async function measureRoute(
  context: BrowserContext,
  route: string
): Promise<Summary> {
  const page = await context.newPage();
  const url = `${BASE_URL}${route}`;
  const samples: Sample[] = [];

  // Warm up route to remove one-time compilation/noise from measured samples.
  await page.goto(url, { waitUntil: "load" });

  for (let run = 1; run <= REPEATS; run++) {
    const start = Date.now();
    const response = await page.goto(url, {
      timeout: 60_000,
      waitUntil: "load",
    });
    const wallMs = Date.now() - start;

    if (!response || response.status() >= 400) {
      throw new Error(
        `Navigation to ${route} failed with status ${response?.status() ?? "unknown"}`
      );
    }

    const navTiming = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;

      if (!nav) {
        return {
          domContentLoadedMs: null,
          loadMs: null,
          ttfbMs: null,
        };
      }

      return {
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadMs: Math.round(nav.loadEventEnd),
        ttfbMs: Math.round(nav.responseStart),
      };
    });

    samples.push({
      wallMs,
      ttfbMs: navTiming.ttfbMs,
      domContentLoadedMs: navTiming.domContentLoadedMs,
      loadMs: navTiming.loadMs,
    });

    console.log(
      `${route} run ${run}/${REPEATS}: wall=${wallMs}ms ttfb=${navTiming.ttfbMs ?? "n/a"}ms dcl=${navTiming.domContentLoadedMs ?? "n/a"}ms load=${navTiming.loadMs ?? "n/a"}ms`
    );
  }

  await page.close();

  return {
    route,
    runs: samples.length,
    avgWallMs: round(
      samples.reduce((total, sample) => total + sample.wallMs, 0) /
        samples.length
    ),
    avgTtfbMs: average(samples.map((sample) => sample.ttfbMs)),
    avgDomContentLoadedMs: average(
      samples.map((sample) => sample.domContentLoadedMs)
    ),
    avgLoadMs: average(samples.map((sample) => sample.loadMs)),
  };
}

async function main() {
  if (REPEATS < 1) {
    throw new Error("PERF_REPEATS must be at least 1");
  }

  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Routes: ${ROUTES.join(", ")}`);
  console.log(`Repeats per route: ${REPEATS}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    await authenticate(context);

    const summaries: Summary[] = [];
    for (const route of ROUTES) {
      summaries.push(await measureRoute(context, route));
    }

    console.log("\nSummary:");
    for (const summary of summaries) {
      console.log(
        `${summary.route} -> avg wall=${summary.avgWallMs}ms, avg ttfb=${summary.avgTtfbMs ?? "n/a"}ms, avg dcl=${summary.avgDomContentLoadedMs ?? "n/a"}ms, avg load=${summary.avgLoadMs ?? "n/a"}ms`
      );
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
