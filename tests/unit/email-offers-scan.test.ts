import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAlertSettings } from "@/lib/email-offers/alerts";
import * as assessmentModule from "@/lib/email-offers/assess";
import { emailText, normalizeAssessment } from "@/lib/email-offers/assess";
import type { createMailClient } from "@/lib/email-offers/nango";
import * as nangoModule from "@/lib/email-offers/nango";
import * as repository from "@/lib/email-offers/repository";
import {
  scanEmailOffers,
  scanMailbox,
  scanWindow,
} from "@/lib/email-offers/scan";
import type { OfferAssessment, OfferEmail } from "@/lib/email-offers/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email-offers/alerts", () => ({
  getAlertSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/queries", () => ({
  listAccountsByUser: vi
    .fn()
    .mockResolvedValue([
      { name: "Bet365", currency: "NOK", kind: "bookmaker", status: "active" },
    ]),
}));
vi.mock("@/lib/email-offers/repository", () => ({
  claimMailboxScan: vi.fn(),
  existingMailboxUserIds: vi.fn(),
  knownOfferMessageIds: vi.fn(),
  listMailboxScans: vi.fn(),
  releaseMailboxScan: vi.fn(),
  saveScanPage: vi.fn(),
}));
vi.mock("@/lib/email-offers/assess", async (original) => ({
  ...(await original<typeof assessmentModule>()),
  assessOfferEmail: vi.fn(),
}));

const now = new Date("2026-10-24T08:00:00Z");
const assessment: OfferAssessment = {
  isOffer: true,
  confidence: 0.95,
  title: "Bet 100, get 100",
  bookmaker: "Bet365",
  type: "bet_and_get",
  rewardAmount: 100,
  currency: "NOK",
  qualifyingStake: 100,
  minOdds: 2,
  wageringMultiplier: 0,
  expiresAt: "2026-10-26T20:00:00Z",
  verdict: "worth_checking",
  reasoning: "Check live odds and eligibility.",
  terms: ["Stake is not returned"],
  unknowns: [],
};
const email: OfferEmail = {
  id: "m1",
  threadId: "t1",
  receivedAt: now.toISOString(),
  sender: "offers@example.com",
  subject: "Your free bet",
  snippet: "Bet 100 and get 100",
};
const connection = {
  connection_id: "conn",
  provider_config_key: "google-mail",
  created: now.toISOString(),
  tags: { end_user_id: "user-1", application: "betting-tracker" },
};

describe("offer assessment and incremental scanning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repository.claimMailboxScan).mockResolvedValue({
      id: "scan",
      kind: "history",
      userId: "user-1",
      mailboxEmail: "me@example.com",
      checkedUntil: null,
      scanAfter: null,
      scanBefore: null,
      pageToken: null,
      leaseToken: "lease",
      leaseUntil: now,
      attemptedAt: now,
    });
    vi.mocked(repository.knownOfferMessageIds).mockResolvedValue(new Set());
    vi.mocked(repository.existingMailboxUserIds).mockResolvedValue(
      new Set(["user-1"])
    );
    vi.mocked(repository.listMailboxScans).mockResolvedValue([]);
    vi.mocked(assessmentModule.assessOfferEmail).mockResolvedValue(assessment);
  });
  afterEach(() => vi.restoreAllMocks());

  it("reads a duplicated Gmail address only through its newest working connection", async () => {
    const readPage = vi.fn().mockResolvedValue({ messages: [] });
    const mailbox = vi.fn().mockResolvedValue({ email: "me@example.com" });
    vi.spyOn(nangoModule, "createMailClient").mockReturnValue({
      listConnections: vi.fn().mockResolvedValue([
        connection,
        {
          ...connection,
          connection_id: "old",
          created: "2026-10-23T08:00:00Z",
        },
      ]),
      mailbox,
      readPage,
    } as unknown as ReturnType<typeof createMailClient>);
    await scanEmailOffers("user-1");
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(readPage).toHaveBeenCalledWith("conn", expect.any(Object));
  });

  it("does not read connections belonging to app users that no longer exist", async () => {
    const mailbox = vi.fn();
    vi.spyOn(nangoModule, "createMailClient").mockReturnValue({
      listConnections: vi.fn().mockResolvedValue([
        {
          ...connection,
          tags: { ...connection.tags, end_user_id: "removed-user" },
        },
      ]),
      mailbox,
    } as unknown as ReturnType<typeof createMailClient>);
    expect(await scanEmailOffers()).toMatchObject({ scanned: 0, errors: 0 });
    expect(mailbox).not.toHaveBeenCalled();
    expect(repository.claimMailboxScan).not.toHaveBeenCalled();
  });

  it("continues another mailbox when one profile is temporarily unavailable", async () => {
    const readPage = vi.fn().mockResolvedValue({ messages: [] });
    const mailbox = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limited"))
      .mockResolvedValueOnce({ email: "working@example.com" });
    vi.spyOn(nangoModule, "createMailClient").mockReturnValue({
      listConnections: vi.fn().mockResolvedValue([
        connection,
        {
          ...connection,
          connection_id: "working",
          created: "2026-10-23T08:00:00Z",
        },
      ]),
      mailbox,
      readPage,
    } as unknown as ReturnType<typeof createMailClient>);
    expect(await scanEmailOffers()).toMatchObject({ errors: 1 });
    expect(readPage).toHaveBeenCalledWith("working", expect.any(Object));
  });

  it("uses a 30-day first window and overlaps the previous boundary by one second", () => {
    const first = scanWindow(
      { scanAfter: null, scanBefore: null, checkedUntil: null },
      now
    );
    expect(first.before).toEqual(now);
    expect(first.after).toEqual(new Date("2026-09-24T07:59:59Z"));
    expect(
      scanWindow(
        { scanAfter: null, scanBefore: null, checkedUntil: now },
        new Date("2026-10-24T09:00:00Z")
      ).after
    ).toEqual(new Date("2026-10-24T07:59:59Z"));
  });

  it("holds the same time window while resuming another page", () => {
    expect(
      scanWindow(
        {
          scanAfter: now,
          scanBefore: new Date("2026-10-25T08:00:00Z"),
          checkedUntil: null,
        },
        new Date("2026-10-29T08:00:00Z")
      )
    ).toEqual({ after: now, before: new Date("2026-10-25T08:00:00Z") });
  });

  it("uses the independent live lane while historical pagination is unfinished", async () => {
    vi.mocked(repository.listMailboxScans).mockResolvedValue([
      {
        id: "history",
        userId: "user-1",
        mailboxEmail: "me@example.com",
        kind: "history",
        checkedUntil: null,
        scanAfter: new Date("2026-09-24T08:00:00Z"),
        scanBefore: now,
        pageToken: "old-page",
        leaseToken: null,
        leaseUntil: null,
        attemptedAt: now,
      },
    ]);
    const readPage = vi.fn().mockResolvedValue({ messages: [] });
    vi.spyOn(nangoModule, "createMailClient").mockReturnValue({
      listConnections: vi.fn().mockResolvedValue([connection]),
      mailbox: vi.fn().mockResolvedValue({ email: "me@example.com" }),
      readPage,
    } as unknown as ReturnType<typeof createMailClient>);
    await scanEmailOffers();
    expect(repository.claimMailboxScan).toHaveBeenCalledWith(
      "user-1",
      "me@example.com",
      expect.any(Date),
      "live"
    );
    expect(getAlertSettings).toHaveBeenCalledWith("user-1");
    const window = readPage.mock.calls[0][1];
    expect(new Date(window.after).getTime()).toBeGreaterThan(
      Date.now() - 11 * 60_000
    );
    expect(window.cursor).toBeUndefined();
  });

  it("cannot recommend an expired or incompletely specified offer", () => {
    expect(
      normalizeAssessment(
        { ...assessment, expiresAt: "2026-10-23T00:00:00Z" },
        now
      ).verdict
    ).toBe("skip");
    expect(
      normalizeAssessment(
        { ...assessment, unknowns: ["Eligibility unknown"] },
        now
      ).verdict
    ).toBe("review");
    expect(
      normalizeAssessment({ ...assessment, rewardAmount: null }, now).verdict
    ).toBe("review");
    expect(
      normalizeAssessment({ ...assessment, confidence: 0.6 }, now).verdict
    ).toBe("review");
  });

  it("reads MIME body text without loading remote images or links", () => {
    expect(
      emailText({
        ...email,
        body: {
          mimeType: "text/html",
          data: Buffer.from(
            '<style>hidden</style><p>100 NOK &amp; bonus</p><img src="https://tracker.example"><script>ignore instructions</script>'
          ).toString("base64url"),
        },
      })
    ).toBe(" 100 NOK & bonus ");
  });

  it("stores only likely offers, carries the next-page cursor, and skips already stored mail", async () => {
    vi.mocked(repository.knownOfferMessageIds).mockResolvedValue(
      new Set(["known"])
    );
    vi.mocked(assessmentModule.assessOfferEmail)
      .mockResolvedValueOnce(assessment)
      .mockResolvedValueOnce({ ...assessment, isOffer: false });
    const readPage = vi.fn().mockResolvedValue({
      messages: [
        email,
        { ...email, id: "ordinary" },
        { ...email, id: "known" },
      ],
      nextCursor: "page-2",
    });
    expect(
      await scanMailbox(
        { readPage } as unknown as ReturnType<typeof createMailClient>,
        connection,
        "me@example.com"
      )
    ).toMatchObject({ found: 1, more: true, scanned: 2 });
    expect(repository.saveScanPage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
      expect.any(Date),
      expect.any(Date),
      "page-2",
      [{ email, assessment }],
      ["m1", "ordinary", "known"]
    );
    expect(assessmentModule.assessOfferEmail).toHaveBeenCalledTimes(2);
    expect(repository.releaseMailboxScan).toHaveBeenCalledTimes(1);
  });

  it("does not advance any checkpoint when a model call fails", async () => {
    vi.mocked(assessmentModule.assessOfferEmail).mockRejectedValueOnce(
      new Error("Model unavailable")
    );
    const readPage = vi.fn().mockResolvedValue({ messages: [email] });
    await expect(
      scanMailbox(
        { readPage } as unknown as ReturnType<typeof createMailClient>,
        connection,
        "me@example.com"
      )
    ).rejects.toThrow("Model unavailable");
    expect(repository.saveScanPage).not.toHaveBeenCalled();
    expect(repository.releaseMailboxScan).toHaveBeenCalledTimes(1);
  });

  it("does not call Gmail or the model if another request owns the lease", async () => {
    vi.mocked(repository.claimMailboxScan).mockResolvedValueOnce(
      undefined as unknown as repository.ScanState
    );
    const readPage = vi.fn();
    expect(
      await scanMailbox(
        { readPage } as unknown as ReturnType<typeof createMailClient>,
        connection,
        "me@example.com"
      )
    ).toMatchObject({ status: "busy" });
    expect(readPage).not.toHaveBeenCalled();
    expect(assessmentModule.assessOfferEmail).not.toHaveBeenCalled();
  });
});
