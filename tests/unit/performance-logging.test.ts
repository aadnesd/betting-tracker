import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST as screenshotsRoute } from "@/app/(chat)/api/bets/screenshots/route";
import { POST as autoparseRoute } from "@/app/(chat)/api/bets/autoparse/route";
import * as authModule from "@/app/(auth)/auth";
import * as dbQueries from "@/lib/db/queries";
import { parseMatchedBetFromScreenshots } from "@/lib/bet-parser";

vi.mock("@/lib/ai/providers", () => ({
  myProvider: {
    languageModel: () => ({}),
  },
}));

vi.mock("@/lib/bet-parser", () => ({
  parseMatchedBetFromScreenshots: vi.fn(),
  parseMatchedBetWithOcr: vi.fn(),
  isOcrConfigured: vi.fn(() => false),
}));

const user = { id: "user-perf" };

vi.mock("@/app/(auth)/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  saveScreenshotUpload: vi.fn(),
  getScreenshotById: vi.fn(),
  updateScreenshotStatus: vi.fn(),
  getAccountByName: vi.fn(),
}));

const makeBlob = (content = "stub") =>
  new Blob([content], { type: "image/png" });

describe("Performance logging instrumentation", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    (authModule.auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("screenshots route", () => {
    it("logs performance timing with phase breakdown", async () => {
      (dbQueries.saveScreenshotUpload as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: "back-1", url: "http://blob/back", kind: "back" })
        .mockResolvedValueOnce({ id: "lay-1", url: "http://blob/lay", kind: "lay" });

      const form = new FormData();
      form.append("back", makeBlob(), "back.png");
      form.append("lay", makeBlob(), "lay.png");

      await screenshotsRoute(
        new Request("http://localhost/api/bets/screenshots", {
          method: "POST",
          body: form,
        })
      );

      // Verify performance logging was called
      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("[screenshots/upload]")
      );
      expect(logCall).toBeDefined();
      expect(logCall?.[0]).toMatch(/Total: \d+ms/);
      expect(logCall?.[0]).toMatch(/auth=/);
      expect(logCall?.[0]).toMatch(/parseFormData=/);
      expect(logCall?.[0]).toMatch(/blobUpload=/);
      expect(logCall?.[0]).toMatch(/dbSave=/);
    });

    it("logs timing phases in correct order", async () => {
      (dbQueries.saveScreenshotUpload as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: "back-1", url: "http://blob/back", kind: "back" })
        .mockResolvedValueOnce({ id: "lay-1", url: "http://blob/lay", kind: "lay" });

      const form = new FormData();
      form.append("back", makeBlob(), "back.png");
      form.append("lay", makeBlob(), "lay.png");

      await screenshotsRoute(
        new Request("http://localhost/api/bets/screenshots", {
          method: "POST",
          body: form,
        })
      );

      const logCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("[screenshots/upload]")
      );

      // Phases should be in order: auth -> parseFormData -> blobUpload -> dbSave
      const phasesMatch = logCall?.[0].match(/Phases: (.+)/);
      expect(phasesMatch).toBeDefined();
      const phases = phasesMatch?.[1] || "";
      expect(phases.indexOf("auth=")).toBeLessThan(phases.indexOf("parseFormData="));
      expect(phases.indexOf("parseFormData=")).toBeLessThan(phases.indexOf("blobUpload="));
      expect(phases.indexOf("blobUpload=")).toBeLessThan(phases.indexOf("dbSave="));
    });
  });

  describe("autoparse route", () => {
    it("logs performance timing with phase breakdown", async () => {
      (dbQueries.getScreenshotById as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: "back-1", url: "http://blob/back", userId: user.id })
        .mockResolvedValueOnce({ id: "lay-1", url: "http://blob/lay", userId: user.id });

      (dbQueries.getAccountByName as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      (parseMatchedBetFromScreenshots as ReturnType<typeof vi.fn>).mockResolvedValue({
        back: { type: "back", market: "M", selection: "A", odds: 2.0, stake: 10, exchange: "Bet365" },
        lay: { type: "lay", market: "M", selection: "A", odds: 2.0, stake: 10, exchange: "Exchange" },
        needsReview: false,
      });

      await autoparseRoute(
        new Request("http://localhost/api/bets/autoparse", {
          method: "POST",
          body: JSON.stringify({
            backScreenshotId: "11111111-1111-1111-1111-111111111111",
            layScreenshotId: "22222222-2222-2222-2222-222222222222",
          }),
        })
      );

      // Verify performance logging was called (look for the timing log specifically)
      const logCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("[bets/autoparse]") && call[0].includes("Total:")
      );
      expect(logCall).toBeDefined();
      expect(logCall?.[0]).toMatch(/Total: \d+ms/);
      expect(logCall?.[0]).toMatch(/auth=/);
      expect(logCall?.[0]).toMatch(/parsePayload=/);
      expect(logCall?.[0]).toMatch(/fetchScreenshots=/);
      expect(logCall?.[0]).toMatch(/aiParsing=/);
      expect(logCall?.[0]).toMatch(/accountMatching=/);
      expect(logCall?.[0]).toMatch(/updateStatus=/);
    });

    it("logs timing phases in correct order", async () => {
      (dbQueries.getScreenshotById as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: "back-1", url: "http://blob/back", userId: user.id })
        .mockResolvedValueOnce({ id: "lay-1", url: "http://blob/lay", userId: user.id });

      (dbQueries.getAccountByName as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      (parseMatchedBetFromScreenshots as ReturnType<typeof vi.fn>).mockResolvedValue({
        back: { type: "back", market: "M", selection: "A", odds: 2.0, stake: 10, exchange: "Bet365" },
        lay: { type: "lay", market: "M", selection: "A", odds: 2.0, stake: 10, exchange: "Exchange" },
        needsReview: false,
      });

      await autoparseRoute(
        new Request("http://localhost/api/bets/autoparse", {
          method: "POST",
          body: JSON.stringify({
            backScreenshotId: "11111111-1111-1111-1111-111111111111",
            layScreenshotId: "22222222-2222-2222-2222-222222222222",
          }),
        })
      );

      const logCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("[bets/autoparse]") && call[0].includes("Total:")
      );

      // Phases should be in order: auth -> parsePayload -> fetchScreenshots -> aiParsing -> accountMatching -> updateStatus
      const phasesMatch = logCall?.[0].match(/Phases: (.+)/);
      expect(phasesMatch).toBeDefined();
      const phases = phasesMatch?.[1] || "";
      expect(phases.indexOf("auth=")).toBeLessThan(phases.indexOf("parsePayload="));
      expect(phases.indexOf("parsePayload=")).toBeLessThan(phases.indexOf("fetchScreenshots="));
      expect(phases.indexOf("fetchScreenshots=")).toBeLessThan(phases.indexOf("aiParsing="));
      expect(phases.indexOf("aiParsing=")).toBeLessThan(phases.indexOf("accountMatching="));
      expect(phases.indexOf("accountMatching=")).toBeLessThan(phases.indexOf("updateStatus="));
    });
  });

  describe("timer utility", () => {
    it("captures total time as sum of phase times", async () => {
      (dbQueries.saveScreenshotUpload as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: "back-1", url: "http://blob/back", kind: "back" })
        .mockResolvedValueOnce({ id: "lay-1", url: "http://blob/lay", kind: "lay" });

      const form = new FormData();
      form.append("back", makeBlob(), "back.png");
      form.append("lay", makeBlob(), "lay.png");

      await screenshotsRoute(
        new Request("http://localhost/api/bets/screenshots", {
          method: "POST",
          body: form,
        })
      );

      const logCall = consoleSpy.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("[screenshots/upload]")
      );

      // Extract total and phase times
      const totalMatch = logCall?.[0].match(/Total: (\d+)ms/);
      const phaseMatches = [...(logCall?.[0].matchAll(/=(\d+)ms/g) || [])];

      expect(totalMatch).toBeDefined();
      expect(phaseMatches.length).toBeGreaterThan(0);

      const totalMs = Number(totalMatch?.[1]);
      const sumOfPhases = phaseMatches.reduce((sum, m) => sum + Number(m[1]), 0);

      // Total should be >= sum of phases (could be slightly more due to overhead)
      expect(totalMs).toBeGreaterThanOrEqual(sumOfPhases);
    });
  });
});
