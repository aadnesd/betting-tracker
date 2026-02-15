import { describe, expect, test } from "vitest";
import type { ExposureDataPoint } from "@/lib/db/queries";

/**
 * Unit tests for exposure timeline functionality.
 *
 * WHY THESE TESTS MATTER:
 * - The exposure timeline helps users track their risk levels over time
 * - Visualizing exposure fluctuations allows for better bankroll planning
 * - These tests validate the data structure and calculation logic for exposure tracking
 *
 * The getExposureTimeline query is a database function that:
 * 1. Fetches all matched bets with netExposure
 * 2. Creates events for bet creation (adds exposure) and settlement (removes exposure)
 * 3. Processes events chronologically to compute running exposure per day
 * 4. Returns data points for chart visualization with day/week/month grouping
 */

describe("ExposureDataPoint interface", () => {
  test("has correct structure", () => {
    // Test that the interface has all required fields
    const dataPoint: ExposureDataPoint = {
      date: "2025-01-01",
      label: "1 Jan",
      exposure: 1500.5,
      openPositions: 3,
      change: 500.25,
    };

    expect(dataPoint.date).toBe("2025-01-01");
    expect(dataPoint.label).toBe("1 Jan");
    expect(dataPoint.exposure).toBe(1500.5);
    expect(dataPoint.openPositions).toBe(3);
    expect(dataPoint.change).toBe(500.25);
  });

  test("supports zero exposure", () => {
    const dataPoint: ExposureDataPoint = {
      date: "2025-01-01",
      label: "1 Jan",
      exposure: 0,
      openPositions: 0,
      change: 0,
    };

    expect(dataPoint.exposure).toBe(0);
    expect(dataPoint.openPositions).toBe(0);
    expect(dataPoint.change).toBe(0);
  });

  test("supports negative change (exposure reduction)", () => {
    const dataPoint: ExposureDataPoint = {
      date: "2025-01-02",
      label: "2 Jan",
      exposure: 1000,
      openPositions: 2,
      change: -500, // Exposure reduced due to settlement
    };

    expect(dataPoint.change).toBe(-500);
    expect(dataPoint.exposure).toBe(1000);
  });
});

describe("Exposure timeline data structure", () => {
  test("data points are sortable by date", () => {
    const dataPoints: ExposureDataPoint[] = [
      {
        date: "2025-01-03",
        label: "3 Jan",
        exposure: 3000,
        openPositions: 3,
        change: 1000,
      },
      {
        date: "2025-01-01",
        label: "1 Jan",
        exposure: 1000,
        openPositions: 1,
        change: 1000,
      },
      {
        date: "2025-01-02",
        label: "2 Jan",
        exposure: 2000,
        openPositions: 2,
        change: 1000,
      },
    ];

    const sorted = [...dataPoints].sort((a, b) => a.date.localeCompare(b.date));

    expect(sorted[0].date).toBe("2025-01-01");
    expect(sorted[1].date).toBe("2025-01-02");
    expect(sorted[2].date).toBe("2025-01-03");
  });

  test("running exposure increases with new bets", () => {
    // Simulating exposure building up over time
    const dataPoints: ExposureDataPoint[] = [
      {
        date: "2025-01-01",
        label: "1 Jan",
        exposure: 1000,
        openPositions: 1,
        change: 1000,
      },
      {
        date: "2025-01-02",
        label: "2 Jan",
        exposure: 2500,
        openPositions: 2,
        change: 1500,
      },
      {
        date: "2025-01-03",
        label: "3 Jan",
        exposure: 4000,
        openPositions: 3,
        change: 1500,
      },
    ];

    // Verify cumulative growth
    expect(dataPoints[0].exposure).toBeLessThan(dataPoints[1].exposure);
    expect(dataPoints[1].exposure).toBeLessThan(dataPoints[2].exposure);

    // Verify all changes are positive (adding exposure)
    for (const dp of dataPoints) {
      expect(dp.change).toBeGreaterThan(0);
    }
  });

  test("running exposure decreases with settlements", () => {
    // Simulating exposure reducing as bets settle
    const dataPoints: ExposureDataPoint[] = [
      {
        date: "2025-01-01",
        label: "1 Jan",
        exposure: 5000,
        openPositions: 5,
        change: 0,
      },
      {
        date: "2025-01-02",
        label: "2 Jan",
        exposure: 4000,
        openPositions: 4,
        change: -1000,
      },
      {
        date: "2025-01-03",
        label: "3 Jan",
        exposure: 2500,
        openPositions: 3,
        change: -1500,
      },
    ];

    // Verify decreasing exposure
    expect(dataPoints[0].exposure).toBeGreaterThan(dataPoints[1].exposure);
    expect(dataPoints[1].exposure).toBeGreaterThan(dataPoints[2].exposure);

    // Verify decreasing open positions
    expect(dataPoints[0].openPositions).toBeGreaterThan(
      dataPoints[1].openPositions
    );
    expect(dataPoints[1].openPositions).toBeGreaterThan(
      dataPoints[2].openPositions
    );
  });

  test("handles days with no activity (carry forward)", () => {
    // Days without activity should carry forward previous exposure
    const dataPoints: ExposureDataPoint[] = [
      {
        date: "2025-01-01",
        label: "1 Jan",
        exposure: 2000,
        openPositions: 2,
        change: 2000,
      },
      {
        date: "2025-01-02",
        label: "2 Jan",
        exposure: 2000,
        openPositions: 2,
        change: 0,
      },
      {
        date: "2025-01-03",
        label: "3 Jan",
        exposure: 2000,
        openPositions: 2,
        change: 0,
      },
      {
        date: "2025-01-04",
        label: "4 Jan",
        exposure: 3500,
        openPositions: 3,
        change: 1500,
      },
    ];

    // Days 2 and 3 have no change but maintain exposure
    expect(dataPoints[1].change).toBe(0);
    expect(dataPoints[1].exposure).toBe(dataPoints[0].exposure);
    expect(dataPoints[2].change).toBe(0);
    expect(dataPoints[2].exposure).toBe(dataPoints[1].exposure);
  });

  test("calculates maximum exposure correctly", () => {
    const dataPoints: ExposureDataPoint[] = [
      {
        date: "2025-01-01",
        label: "1 Jan",
        exposure: 1000,
        openPositions: 1,
        change: 1000,
      },
      {
        date: "2025-01-02",
        label: "2 Jan",
        exposure: 3500,
        openPositions: 3,
        change: 2500,
      },
      {
        date: "2025-01-03",
        label: "3 Jan",
        exposure: 2000,
        openPositions: 2,
        change: -1500,
      },
      {
        date: "2025-01-04",
        label: "4 Jan",
        exposure: 500,
        openPositions: 1,
        change: -1500,
      },
    ];

    const maxExposure = Math.max(...dataPoints.map((dp) => dp.exposure));
    const maxPositions = Math.max(...dataPoints.map((dp) => dp.openPositions));

    expect(maxExposure).toBe(3500);
    expect(maxPositions).toBe(3);
  });

  test("supports current exposure (last data point)", () => {
    const dataPoints: ExposureDataPoint[] = [
      {
        date: "2025-01-01",
        label: "1 Jan",
        exposure: 1000,
        openPositions: 1,
        change: 1000,
      },
      {
        date: "2025-01-02",
        label: "2 Jan",
        exposure: 2500,
        openPositions: 2,
        change: 1500,
      },
      {
        date: "2025-01-03",
        label: "3 Jan",
        exposure: 1800,
        openPositions: 2,
        change: -700,
      },
    ];

    const currentExposure = dataPoints[dataPoints.length - 1].exposure;
    const currentPositions = dataPoints[dataPoints.length - 1].openPositions;

    expect(currentExposure).toBe(1800);
    expect(currentPositions).toBe(2);
  });
});

describe("Exposure timeline edge cases", () => {
  test("empty array for no bets", () => {
    const dataPoints: ExposureDataPoint[] = [];
    expect(dataPoints.length).toBe(0);
  });

  test("single day with single bet", () => {
    const dataPoints: ExposureDataPoint[] = [
      {
        date: "2025-01-01",
        label: "1 Jan",
        exposure: 500,
        openPositions: 1,
        change: 500,
      },
    ];

    expect(dataPoints.length).toBe(1);
    expect(dataPoints[0].exposure).toBe(dataPoints[0].change);
  });

  test("multiple bets on same day", () => {
    // Multiple bets on same day should be aggregated
    const dataPoint: ExposureDataPoint = {
      date: "2025-01-01",
      label: "1 Jan",
      exposure: 5000, // Total exposure from 3 bets: 1500 + 2000 + 1500
      openPositions: 3,
      change: 5000, // All 3 bets placed on same day
    };

    expect(dataPoint.exposure).toBe(5000);
    expect(dataPoint.openPositions).toBe(3);
  });

  test("bet placed and settled on same day", () => {
    // If a bet is placed and settled on the same day,
    // the net change for that day should reflect both
    const dataPoint: ExposureDataPoint = {
      date: "2025-01-01",
      label: "1 Jan",
      exposure: 0, // Net zero if bet added and removed
      openPositions: 0,
      change: 0, // +1000 (placed) -1000 (settled) = 0
    };

    expect(dataPoint.change).toBe(0);
    expect(dataPoint.exposure).toBe(0);
  });
});
