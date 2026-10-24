import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { isAlertWorthy } from "@/lib/email-offers/alert-content";
import * as telegram from "@/lib/email-offers/telegram";
import type { OfferAssessment } from "@/lib/email-offers/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email-offers/telegram", async (original) => ({
  ...(await original<typeof telegram>()),
  isTelegramConfigured: () => true,
  sendTelegram: vi.fn(),
}));

const databaseUrl = process.env.EMAIL_OFFERS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("Telegram offer delivery on PostgreSQL", () => {
  let sql: ReturnType<typeof postgres>;
  let alerts: typeof import("@/lib/email-offers/alerts");
  let repo: typeof import("@/lib/email-offers/repository");
  let client: typeof import("@/lib/db/connection")["client"];
  let userId: string;
  let otherId: string;
  const now = new Date();
  const assessment: OfferAssessment = {
    isOffer: true,
    confidence: 0.95,
    title: "Bet 100, get 100",
    bookmaker: "Test bookmaker",
    type: "bet_and_get",
    rewardAmount: 100,
    currency: "NOK",
    qualifyingStake: 100,
    minOdds: 2,
    wageringMultiplier: 0,
    expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
    verdict: "worth_checking",
    reasoning: "Check live odds.",
    terms: ["Stake not returned"],
    unknowns: [],
  };
  beforeAll(async () => {
    process.env.POSTGRES_URL = databaseUrl!;
    const { default: postgres } = await import("postgres");
    sql = postgres(databaseUrl!, { max: 1 });
    alerts = await import("@/lib/email-offers/alerts");
    repo = await import("@/lib/email-offers/repository");
    client = (await import("@/lib/db/connection")).client;
  });
  beforeEach(async () => {
    userId = randomUUID();
    otherId = randomUUID();
    await sql`INSERT INTO "User" (id,email) VALUES (${userId},'alert-test@example.com'),(${otherId},'alert-other@example.com')`;
    vi.mocked(telegram.sendTelegram)
      .mockReset()
      .mockResolvedValue({ message_id: 42 });
  });
  afterAll(async () => {
    await sql`DELETE FROM "User" WHERE email IN ('alert-test@example.com','alert-other@example.com')`;
    await sql.end();
    await client.end();
  });
  async function verify() {
    await alerts.requestTelegramVerification(userId, "123456789");
    const text = vi.mocked(telegram.sendTelegram).mock.calls[0][1];
    const code = text.match(/code: (\d{6})/)![1];
    await alerts.confirmTelegramVerification(userId, code);
    // Provider messages in this page arrive after opt-in.
    vi.mocked(telegram.sendTelegram).mockClear();
    return code;
  }
  async function page(
    kind: "history" | "live",
    id: string,
    a = assessment,
    receivedAt = new Date(Date.now() + 1000)
  ) {
    const state = await repo.claimMailboxScan(
      userId,
      "test@example.com",
      new Date(),
      kind
    );
    await repo.saveScanPage(
      state!,
      now,
      new Date(),
      undefined,
      [
        {
          email: {
            id,
            threadId: `thread-${id}`,
            sender: "offers@example.com",
            subject: a.title,
            snippet: "private",
            receivedAt: receivedAt.toISOString(),
          },
          assessment: a,
        },
      ],
      [id]
    );
  }
  it("verifies the recipient, keeps history silent, then queues known live offers once and sends only to their owner", async () => {
    const code = await verify();
    await expect(
      alerts.confirmTelegramVerification(otherId, code)
    ).rejects.toThrow("Invalid or expired");
    await expect(
      alerts.confirmTelegramVerification(userId, code)
    ).rejects.toThrow("Invalid or expired");
    expect((await alerts.alertSettingsView(userId)).enabled).toBe(true);
    expect((await alerts.alertSettingsView(otherId)).chatId).toBeNull();
    await page("history", "new");
    expect((await alerts.deliverOfferAlerts(userId)).sent).toBe(0);
    await page("live", "new");
    await page("live", "new");
    expect(await alerts.deliverOfferAlerts(otherId)).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    const deliveries = await Promise.all([
      alerts.deliverOfferAlerts(userId),
      alerts.deliverOfferAlerts(userId),
    ]);
    expect(deliveries.reduce((sum, r) => sum + r.sent, 0)).toBe(1);
    expect(telegram.sendTelegram).toHaveBeenCalledTimes(1);
    expect(telegram.sendTelegram).toHaveBeenCalledWith(
      "123456789",
      expect.stringContaining("Good offer you should take a look at")
    );
    expect(await alerts.deliverOfferAlerts(userId)).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    const [row] =
      await sql`SELECT * FROM "EmailOfferAlert" WHERE "userId"=${userId}`;
    expect(row.messageId).toBe(42);
    expect(row.sentAt).toBeTruthy();
  });
  it("retries failed sends independently of the saved Gmail checkpoint", async () => {
    await verify();
    await page("live", "retry");
    vi.mocked(telegram.sendTelegram).mockRejectedValueOnce(
      new telegram.TelegramError(600, false)
    );
    expect((await alerts.deliverOfferAlerts(userId)).failed).toBe(1);
    const [failed] =
      await sql`SELECT * FROM "EmailOfferAlert" WHERE "userId"=${userId}`;
    expect(failed.sentAt).toBeNull();
    expect(failed.dueAt.getTime()).toBeGreaterThan(Date.now() + 590_000);
    expect(
      (await repo.listMailboxScans(userId))[0].checkedUntil
    ).not.toBeNull();
    await sql`UPDATE "EmailOfferAlert" SET "dueAt"=now()-interval '1 second' WHERE "userId"=${userId}`;
    expect((await alerts.deliverOfferAlerts(userId)).sent).toBe(1);
  });
  it("suppresses old, incomplete, expired and dismissed offers and invalidates queued delivery when paused", async () => {
    await verify();
    await page("live", "old", assessment, new Date(now.getTime() - 86_400_000));
    await page("live", "review", {
      ...assessment,
      unknowns: ["Missing terms"],
    });
    await page("live", "expired", {
      ...assessment,
      expiresAt: now.toISOString(),
    });
    await page("live", "dismissed");
    const [offer] = (await repo.listEmailOffers(userId)).filter(
      (o) => o.messageId === "dismissed"
    );
    await repo.updateEmailOfferStatus(userId, offer.id, "dismissed");
    expect(await alerts.deliverOfferAlerts(userId)).toEqual({
      sent: 0,
      failed: 0,
      skipped: 1,
    });
    await page("live", "paused");
    await alerts.setTelegramAlertsEnabled(userId, false);
    await alerts.setTelegramAlertsEnabled(userId, true);
    expect((await alerts.deliverOfferAlerts(userId)).skipped).toBe(1);
    expect(telegram.sendTelegram).not.toHaveBeenCalled();
    expect(isAlertWorthy({ ...assessment, confidence: 0.7 }, now)).toBe(false);
  });
  it("limits verification requests and concurrent guesses", async () => {
    await alerts.requestTelegramVerification(userId, "123456789");
    await expect(
      alerts.requestTelegramVerification(userId, "987654321")
    ).rejects.toThrow("Wait a minute");
    await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        alerts.confirmTelegramVerification(userId, "000000")
      )
    );
    const settings = await alerts.getAlertSettings(userId);
    expect(settings?.verificationAttempts).toBe(5);
    expect(settings?.enabled).toBe(false);
  });

  it("skips offers that expire in the queue and stops retrying permanent chat failures", async () => {
    await verify();
    await page("live", "expires-in-queue");
    await sql`UPDATE "EmailOffer" SET assessment=jsonb_set(assessment,'{expiresAt}',${JSON.stringify(new Date(Date.now() - 1000).toISOString())}::jsonb) WHERE "userId"=${userId}`;
    expect((await alerts.deliverOfferAlerts(userId)).skipped).toBe(1);
    expect(telegram.sendTelegram).not.toHaveBeenCalled();
    await page("live", "blocked-bot");
    vi.mocked(telegram.sendTelegram).mockRejectedValueOnce(
      new telegram.TelegramError(60, true)
    );
    expect((await alerts.deliverOfferAlerts(userId)).failed).toBe(1);
    expect(await alerts.deliverOfferAlerts(userId)).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    const [blocked] =
      await sql`SELECT * FROM "EmailOfferAlert" WHERE "userId"=${userId} AND "lastError" IS NOT NULL`;
    expect(blocked.skippedAt).toBeTruthy();
    expect(blocked.attempts).toBe(1);
  });
});
