import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OfferAssessment } from "@/lib/email-offers/types";

vi.mock("server-only", () => ({}));

const databaseUrl = process.env.EMAIL_OFFERS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("email offer persistence on PostgreSQL", () => {
  let repository: typeof import("@/lib/email-offers/repository");
  let sql: ReturnType<typeof postgres>;
  let appClient: typeof import("@/lib/db/connection")["client"];
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const mailboxEmail = `${userId}@example.com`;
  const now = new Date("2026-10-24T10:00:00Z");
  const assessment: OfferAssessment = {
    isOffer: true,
    confidence: 0.95,
    title: "Free bet",
    bookmaker: "Test bookmaker",
    type: "free_bet",
    rewardAmount: 100,
    currency: "NOK",
    qualifyingStake: null,
    minOdds: 2,
    wageringMultiplier: 0,
    expiresAt: "2026-10-28T10:00:00Z",
    verdict: "review",
    reasoning: "Eligibility requires checking",
    terms: [],
    unknowns: ["Eligibility"],
  };

  beforeAll(async () => {
    process.env.POSTGRES_URL = databaseUrl!;
    const { default: postgres } = await import("postgres");
    sql = postgres(databaseUrl!, { max: 1 });
    await sql`INSERT INTO "User" (id,email) VALUES (${userId},'email-test@example.com'), (${otherUserId},'other-email-test@example.com')`;
    repository = await import("@/lib/email-offers/repository");
    appClient = (await import("@/lib/db/connection")).client;
  });

  afterAll(async () => {
    if (sql) {
      await sql`DELETE FROM "User" WHERE id IN (${userId},${otherUserId})`;
      await sql.end();
    }
    if (appClient) {
      await appClient.end();
    }
  });

  it("claims one lease, commits offers with the cursor, preserves dismissal on replay, and isolates users", async () => {
    const [first, second] = await Promise.all([
      repository.claimMailboxScan(userId, mailboxEmail, now),
      repository.claimMailboxScan(userId, mailboxEmail, now),
    ]);
    const claim = first || second;
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(claim).toBeTruthy();
    const offers = [
      {
        email: {
          id: "m1",
          threadId: "t1",
          sender: "test@example.com",
          subject: "A real offer",
          receivedAt: now.toISOString(),
          snippet: "private content is not persisted",
        },
        assessment,
      },
    ];

    await expect(
      repository.saveScanPage(
        { ...claim!, leaseToken: randomUUID() },
        now,
        now,
        "page-2",
        offers
      )
    ).rejects.toThrow("lease was lost");
    expect(await repository.listEmailOffers(userId)).toHaveLength(0);
    await repository.saveScanPage(claim!, now, now, "page-2", offers);
    const [state] = await repository.listMailboxScans(userId);
    expect(state.pageToken).toBe("page-2");
    expect(state.checkedUntil).toBeNull();
    const [offer] = await repository.listEmailOffers(userId);
    expect(offer.subject).toBe("A real offer");
    expect(offer).not.toHaveProperty("body");
    expect(offer).not.toHaveProperty("snippet");
    expect(await repository.listEmailOffers(otherUserId)).toHaveLength(0);
    expect(
      await repository.existingMailboxUserIds([
        userId,
        otherUserId,
        randomUUID(),
        "malformed-user-id",
      ])
    ).toEqual(new Set([userId, otherUserId]));
    expect(
      await repository.updateEmailOfferStatus(
        otherUserId,
        offer.id,
        "dismissed"
      )
    ).toBeUndefined();
    await repository.updateEmailOfferStatus(userId, offer.id, "dismissed");
    const retry = await repository.claimMailboxScan(userId, mailboxEmail, now);
    await repository.saveScanPage(retry!, now, now, undefined, offers);
    expect(await repository.listEmailOffers(userId)).toHaveLength(0);
    const [complete] = await repository.listMailboxScans(userId);
    expect(complete.checkedUntil).toEqual(now);
    expect(complete.pageToken).toBeNull();
    const [count] =
      await sql`SELECT count(*)::integer AS n FROM "EmailOffer" WHERE "userId"=${userId}`;
    expect(count.n).toBe(1);
  });
});
