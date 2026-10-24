import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: {
    "x-test-user-id": "12345678-1234-4234-8234-123456789abc",
  },
});
const offer = {
  id: "12345678-1234-4234-8234-123456789abc",
  mailboxEmail: "bettor@example.com",
  messageId: "m1",
  threadId: "t1",
  sender: "offers@bookmaker.example",
  subject: "Bet 100, get 100",
  receivedAt: "2026-10-24T08:00:00Z",
  status: "new",
  assessment: {
    isOffer: true,
    confidence: 0.95,
    title: "100 NOK free bet",
    bookmaker: "Test Bookmaker",
    type: "bet_and_get",
    rewardAmount: 100,
    currency: "NOK",
    qualifyingStake: 100,
    minOdds: 2,
    wageringMultiplier: 0,
    expiresAt: "2026-10-28T20:00:00Z",
    verdict: "review",
    reasoning: "Check qualifying odds and account eligibility.",
    terms: ["Stake not returned"],
    unknowns: ["Existing customer eligibility needs checking"],
  },
};

test("scans, reviews and dismisses offers at desktop and mobile widths", async ({
  page,
}) => {
  let scanned = false;
  let dismissed = false;
  await page.route("**/api/bets/mailbox", (route) =>
    route.fulfill({
      json: {
        configured: true,
        connections: [
          {
            id: "conn",
            email: "bettor@example.com",
            needsReconnect: false,
            createdAt: "2026-10-24T08:00:00Z",
          },
        ],
      },
    })
  );
  await page.route("**/api/bets/email-offers", (route) =>
    route.fulfill({
      json: { offers: scanned && !dismissed ? [offer] : [], scans: [] },
    })
  );
  await page.route("**/api/bets/email-offers/scan", (route) => {
    scanned = true;
    return route.fulfill({ json: { scanned: 2, found: 1, more: false } });
  });
  await page.route(`**/api/bets/email-offers/${offer.id}`, (route) => {
    dismissed = true;
    return route.fulfill({ json: { id: offer.id } });
  });
  await page.goto("/bets/email-offers");
  await expect(
    page.getByRole("heading", { name: "Email offers", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Scan for offers", exact: true })
    .click();
  await expect(
    page.getByText("100 NOK free bet", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Existing customer eligibility needs checking")
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Read in Gmail" })
  ).toHaveAttribute("href", /authuser=bettor%40example.com#all\/t1/);
  await page.screenshot({
    path: "artifacts/email-offers-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText("100 NOK free bet", { exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/email-offers-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(
    page.getByText("100 NOK free bet", { exact: true })
  ).not.toBeVisible();
});

test("shows a recoverable scan failure and reconnect state", async ({
  page,
}) => {
  await page.route("**/api/bets/mailbox", (route) =>
    route.fulfill({
      json: {
        configured: true,
        connections: [
          { id: "conn", email: "bettor@example.com", needsReconnect: false },
          { id: "broken", email: null, needsReconnect: true },
        ],
      },
    })
  );
  await page.route("**/api/bets/email-offers", (route) =>
    route.fulfill({ json: { offers: [], scans: [] } })
  );
  await page.route("**/api/bets/email-offers/scan", (route) =>
    route.fulfill({
      status: 429,
      json: { error: "Mailbox rate limit reached. Try again later." },
    })
  );
  await page.goto("/bets/email-offers");
  await expect(
    page.getByRole("button", { name: "Reconnect Gmail", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Scan for offers", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Mailbox rate limit reached" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Scan for offers", exact: true })
  ).toBeEnabled();
});
