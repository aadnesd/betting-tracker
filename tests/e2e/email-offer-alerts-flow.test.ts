import { expect, test } from "@playwright/test";
import postgres from "postgres";

// This test calls real app routes, PostgreSQL and AI. Only the Nango boundary is
// a local fixture. Keep it opt-in so ordinary browser tests never spend AI credit.
test.skip(
  process.env.EMAIL_OFFERS_HTTP_E2E !== "1",
  "Requires the local Nango fixture, real AI key and disposable PostgreSQL."
);
test.use({
  extraHTTPHeaders: {
    "x-test-user-id": "12345678-1234-4234-8234-123456789abc",
  },
});

test("verifies in the browser, assesses new mail, retries a rejected send and records one successful alert", async ({
  page,
  request,
}) => {
  const databaseUrl = process.env.EMAIL_OFFERS_TEST_DATABASE_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
    throw new Error("This test requires disposable local PostgreSQL.");
  }
  const sql = postgres(databaseUrl, { max: 1 });
  const userId = "12345678-1234-4234-8234-123456789abc";
  const fixture = "http://127.0.0.1:3017";
  const cronHeaders = { authorization: `Bearer ${process.env.CRON_SECRET}` };
  try {
    await sql`DELETE FROM "User" WHERE id=${userId}`;
    await sql`INSERT INTO "User" (id,email) VALUES (${userId},'http-flow@example.com')`;
    await sql`INSERT INTO "Account" ("userId",name,"nameNormalized",kind,currency,"createdAt") VALUES (${userId},'bet365','bet365','bookmaker','NOK',now())`;
    await request.get(`${fixture}/test/reset`);
    await page.goto("/bets/email-offers");
    await page.getByText("Set up Telegram alerts", { exact: true }).click();
    await page.getByLabel("Telegram chat ID").fill("123456789");
    await page
      .getByRole("button", { name: "Send verification code", exact: true })
      .click();
    await expect(
      page.getByLabel("Verification code", { exact: true })
    ).toBeVisible();
    const sent = await (await request.get(`${fixture}/test/messages`)).json();
    const code = sent[0].text.match(/code: (\d{6})/)[1];
    await page.getByLabel("Verification code", { exact: true }).fill(code);
    await page
      .getByRole("button", { name: "Verify and enable alerts", exact: true })
      .click();
    await expect(
      page.getByText("Verified chat 123456789. Alerts are on.", { exact: true })
    ).toBeVisible();
    const fresh = await (await request.get(`${fixture}/test/reset`)).json();
    await expect
      .poll(
        () =>
          Math.floor(Date.now() / 1000) * 1000 >
          new Date(fresh.receivedAt).getTime()
      )
      .toBe(true);
    // History remains unfinished while the cron independently finds new mail.
    const historical = await request.post("/api/bets/email-offers/scan");
    expect(historical.status()).toBe(200);
    expect((await historical.json()).more).toBe(true);
    expect(
      await (await request.get(`${fixture}/test/messages`)).json()
    ).toHaveLength(0);
    const first = await request.get("/api/cron/email-offers", {
      headers: cronHeaders,
    });
    expect(first.status(), JSON.stringify(await first.json())).toBe(200);
    const [queued] =
      await sql`SELECT * FROM "EmailOfferAlert" WHERE "userId"=${userId}`;
    const assessed =
      await sql`SELECT "messageId",assessment FROM "EmailOffer" WHERE "userId"=${userId}`;
    expect(queued, JSON.stringify(assessed)).toBeTruthy();
    expect(
      assessed.some((offer) => offer.messageId === "receipt-fixture")
    ).toBe(false);
    expect(
      assessed.find((offer) => offer.messageId === "incomplete-fixture")
        ?.assessment.verdict
    ).not.toBe("worth_checking");
    await request.get(`${fixture}/test/fail-next`);
    const rejected = await request.get("/api/cron/email-offers", {
      headers: cronHeaders,
    });
    expect(rejected.status()).toBe(503);
    expect((await rejected.json()).delivery.failed).toBe(1);
    await sql`UPDATE "EmailOfferAlert" SET "dueAt"=now()-interval '1 second' WHERE "userId"=${userId}`;
    const retry = await request.get("/api/cron/email-offers", {
      headers: cronHeaders,
    });
    expect(retry.status()).toBe(200);
    expect((await retry.json()).delivery.sent).toBe(1);
    await request.get("/api/cron/email-offers", { headers: cronHeaders });
    const delivered = await (
      await request.get(`${fixture}/test/messages`)
    ).json();
    expect(delivered).toHaveLength(1);
    expect(delivered[0].chat_id).toBe("123456789");
    expect(delivered[0].text).toContain("Good offer you should take a look at");
    expect(delivered[0].text).toContain("100");
    const [stored] =
      await sql`SELECT * FROM "EmailOfferAlert" WHERE id=${queued.id}`;
    expect(stored.sentAt).toBeTruthy();
    expect(stored.messageId).toBe(1);
    const foreign = await request.get("/api/bets/email-offers/alerts", {
      headers: { "x-test-user-id": "22345678-1234-4234-8234-123456789abc" },
    });
    expect((await foreign.json()).chatId).toBeNull();
    await page.reload();
    await expect(
      page.getByText("Your 100 NOK free bet", { exact: true }).first()
    ).toBeVisible();
  } finally {
    await sql`DELETE FROM "Account" WHERE "userId"=${userId}`;
    await sql`DELETE FROM "User" WHERE id=${userId}`;
    await sql.end();
  }
});
