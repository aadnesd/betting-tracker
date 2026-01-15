import { describe, expect, test } from "vitest";
import type { ExposureByEvent, FootballMatchStatus } from "@/lib/db/queries";

/**
 * Unit tests for exposure by event (match) functionality.
 *
 * WHY THESE TESTS MATTER:
 * - Users may have multiple bets on the same match (e.g., Match Odds + Over 2.5)
 * - They need to see total exposure to that single event for risk management
 * - The reporting spec requires "Net exposure per event and per day"
 * - These tests validate the data structure for per-event exposure grouping
 *
 * The getExposureByEvent query:
 * 1. Fetches all open matched bets with netExposure
 * 2. Groups bets by matchId (football match they're linked to)
 * 3. Returns aggregated exposure per event with match info
 * 4. Handles unlinked bets (null matchId) separately
 */

describe("ExposureByEvent interface", () => {
  test("has correct structure for linked event", () => {
    const eventExposure: ExposureByEvent = {
      matchId: "match-123",
      match: {
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        competition: "Premier League",
        matchDate: new Date("2025-01-20T15:00:00Z"),
        status: "SCHEDULED" as FootballMatchStatus,
      },
      totalExposure: 2500.5,
      betCount: 3,
      betIds: ["bet-1", "bet-2", "bet-3"],
      promoTypes: ["Free Bet", "Arb"],
    };

    expect(eventExposure.matchId).toBe("match-123");
    expect(eventExposure.match).not.toBeNull();
    expect(eventExposure.match?.homeTeam).toBe("Arsenal");
    expect(eventExposure.match?.awayTeam).toBe("Chelsea");
    expect(eventExposure.match?.competition).toBe("Premier League");
    expect(eventExposure.totalExposure).toBe(2500.5);
    expect(eventExposure.betCount).toBe(3);
    expect(eventExposure.betIds).toHaveLength(3);
    expect(eventExposure.promoTypes).toContain("Free Bet");
  });

  test("has correct structure for unlinked bets", () => {
    const unlinkedExposure: ExposureByEvent = {
      matchId: null,
      match: null,
      totalExposure: 1000,
      betCount: 2,
      betIds: ["bet-4", "bet-5"],
      promoTypes: ["Refund If Lose"],
    };

    expect(unlinkedExposure.matchId).toBeNull();
    expect(unlinkedExposure.match).toBeNull();
    expect(unlinkedExposure.totalExposure).toBe(1000);
    expect(unlinkedExposure.betCount).toBe(2);
  });

  test("supports all match statuses", () => {
    const statuses: FootballMatchStatus[] = [
      "SCHEDULED",
      "TIMED",
      "IN_PLAY",
      "PAUSED",
      "FINISHED",
      "POSTPONED",
      "SUSPENDED",
      "CANCELLED",
    ];

    for (const status of statuses) {
      const eventExposure: ExposureByEvent = {
        matchId: "match-123",
        match: {
          homeTeam: "Team A",
          awayTeam: "Team B",
          competition: "Test League",
          matchDate: new Date(),
          status,
        },
        totalExposure: 100,
        betCount: 1,
        betIds: ["bet-1"],
        promoTypes: [],
      };

      expect(eventExposure.match?.status).toBe(status);
    }
  });
});

describe("Exposure by event data structure", () => {
  test("events are sortable by exposure (highest first)", () => {
    const events: ExposureByEvent[] = [
      {
        matchId: "match-1",
        match: { homeTeam: "A", awayTeam: "B", competition: "PL", matchDate: new Date(), status: "SCHEDULED" },
        totalExposure: 500,
        betCount: 1,
        betIds: ["bet-1"],
        promoTypes: [],
      },
      {
        matchId: "match-2",
        match: { homeTeam: "C", awayTeam: "D", competition: "PL", matchDate: new Date(), status: "SCHEDULED" },
        totalExposure: 2000,
        betCount: 2,
        betIds: ["bet-2", "bet-3"],
        promoTypes: [],
      },
      {
        matchId: "match-3",
        match: { homeTeam: "E", awayTeam: "F", competition: "PL", matchDate: new Date(), status: "SCHEDULED" },
        totalExposure: 1500,
        betCount: 1,
        betIds: ["bet-4"],
        promoTypes: [],
      },
    ];

    const sorted = [...events].sort((a, b) => b.totalExposure - a.totalExposure);

    expect(sorted[0].totalExposure).toBe(2000);
    expect(sorted[1].totalExposure).toBe(1500);
    expect(sorted[2].totalExposure).toBe(500);
  });

  test("aggregates multiple bets on same event", () => {
    // Scenario: User has 3 bets on Arsenal vs Chelsea (Match Odds, Over 2.5, BTTS)
    const eventExposure: ExposureByEvent = {
      matchId: "match-arsenal-chelsea",
      match: {
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        competition: "Premier League",
        matchDate: new Date("2025-01-20T15:00:00Z"),
        status: "SCHEDULED",
      },
      // Aggregate exposure: 1000 + 750 + 500 = 2250
      totalExposure: 2250,
      betCount: 3,
      betIds: ["bet-match-odds", "bet-over-2.5", "bet-btts"],
      promoTypes: ["Free Bet", "Refund If Lose"],
    };

    expect(eventExposure.betCount).toBe(3);
    expect(eventExposure.totalExposure).toBe(2250);
    expect(eventExposure.promoTypes).toHaveLength(2);
  });

  test("separates linked and unlinked bets", () => {
    const events: ExposureByEvent[] = [
      {
        matchId: "match-1",
        match: { homeTeam: "A", awayTeam: "B", competition: "PL", matchDate: new Date(), status: "SCHEDULED" },
        totalExposure: 1000,
        betCount: 1,
        betIds: ["bet-1"],
        promoTypes: [],
      },
      {
        matchId: null,
        match: null,
        totalExposure: 500,
        betCount: 2,
        betIds: ["bet-2", "bet-3"],
        promoTypes: ["Arb"],
      },
    ];

    const linked = events.filter((e) => e.match !== null);
    const unlinked = events.filter((e) => e.match === null);

    expect(linked).toHaveLength(1);
    expect(unlinked).toHaveLength(1);
    expect(unlinked[0].matchId).toBeNull();
  });

  test("calculates total exposure across all events", () => {
    const events: ExposureByEvent[] = [
      { matchId: "m1", match: null, totalExposure: 1000, betCount: 1, betIds: ["b1"], promoTypes: [] },
      { matchId: "m2", match: null, totalExposure: 2000, betCount: 2, betIds: ["b2", "b3"], promoTypes: [] },
      { matchId: null, match: null, totalExposure: 500, betCount: 1, betIds: ["b4"], promoTypes: [] },
    ];

    const totalExposure = events.reduce((sum, e) => sum + e.totalExposure, 0);
    const totalBets = events.reduce((sum, e) => sum + e.betCount, 0);

    expect(totalExposure).toBe(3500);
    expect(totalBets).toBe(4);
  });
});

describe("Exposure by event risk scenarios", () => {
  test("identifies high exposure events", () => {
    const events: ExposureByEvent[] = [
      { matchId: "m1", match: null, totalExposure: 1000, betCount: 1, betIds: [], promoTypes: [] },
      { matchId: "m2", match: null, totalExposure: 6000, betCount: 3, betIds: [], promoTypes: [] },
      { matchId: "m3", match: null, totalExposure: 500, betCount: 1, betIds: [], promoTypes: [] },
    ];

    const warningThreshold = 5000;
    const highExposure = events.filter((e) => e.totalExposure >= warningThreshold);

    expect(highExposure).toHaveLength(1);
    expect(highExposure[0].matchId).toBe("m2");
  });

  test("handles single bet per event", () => {
    const event: ExposureByEvent = {
      matchId: "match-123",
      match: {
        homeTeam: "Man City",
        awayTeam: "Liverpool",
        competition: "Premier League",
        matchDate: new Date(),
        status: "SCHEDULED",
      },
      totalExposure: 1500,
      betCount: 1,
      betIds: ["single-bet-id"],
      promoTypes: ["Free Bet"],
    };

    // Should be able to link directly to the bet
    expect(event.betCount).toBe(1);
    expect(event.betIds[0]).toBe("single-bet-id");
  });

  test("tracks promo types across event bets", () => {
    // Scenario: Different bets on same event use different promos
    const event: ExposureByEvent = {
      matchId: "match-final",
      match: {
        homeTeam: "Real Madrid",
        awayTeam: "Barcelona",
        competition: "La Liga",
        matchDate: new Date(),
        status: "SCHEDULED",
      },
      totalExposure: 5000,
      betCount: 4,
      betIds: ["bet-1", "bet-2", "bet-3", "bet-4"],
      promoTypes: ["Free Bet", "Arb", "Refund If Lose"],
    };

    expect(event.promoTypes).toHaveLength(3);
    expect(event.promoTypes).toContain("Free Bet");
    expect(event.promoTypes).toContain("Arb");
    expect(event.promoTypes).toContain("Refund If Lose");
  });
});

describe("Exposure by event edge cases", () => {
  test("empty array for no open bets", () => {
    const events: ExposureByEvent[] = [];
    expect(events).toHaveLength(0);
  });

  test("all bets are unlinked (null matchId)", () => {
    const events: ExposureByEvent[] = [
      {
        matchId: null,
        match: null,
        totalExposure: 2000,
        betCount: 5,
        betIds: ["b1", "b2", "b3", "b4", "b5"],
        promoTypes: ["Arb"],
      },
    ];

    expect(events).toHaveLength(1);
    expect(events[0].matchId).toBeNull();
    expect(events[0].betCount).toBe(5);
  });

  test("zero exposure event", () => {
    // Unlikely but possible if exposure is computed as zero
    const event: ExposureByEvent = {
      matchId: "match-zero",
      match: {
        homeTeam: "A",
        awayTeam: "B",
        competition: "Test",
        matchDate: new Date(),
        status: "SCHEDULED",
      },
      totalExposure: 0,
      betCount: 1,
      betIds: ["bet-1"],
      promoTypes: [],
    };

    expect(event.totalExposure).toBe(0);
  });

  test("handles live match status", () => {
    const event: ExposureByEvent = {
      matchId: "match-live",
      match: {
        homeTeam: "Team A",
        awayTeam: "Team B",
        competition: "Premier League",
        matchDate: new Date(),
        status: "IN_PLAY",
      },
      totalExposure: 3000,
      betCount: 2,
      betIds: ["bet-1", "bet-2"],
      promoTypes: [],
    };

    expect(event.match?.status).toBe("IN_PLAY");
  });
});
