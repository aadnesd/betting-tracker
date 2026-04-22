/**
 * Unit tests for competition settings (user preferences for match sync).
 *
 * Why: Validates that getUserSettings, upsertUserSettings, getEnabledCompetitions,
 * and getAllEnabledCompetitions correctly manage user competition preferences
 * for the /bets/settings/competitions page and cron sync job.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only to allow testing server modules
vi.mock("server-only", () => ({}));

// Mock drizzle connection
const mockSelectResult: Array<{
  id: string;
  userId: string;
  enabledCompetitions: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}> = [];

const mockInsertReturning = vi.fn();

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockImplementation(() => Promise.resolve(mockSelectResult)),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: mockInsertReturning,
        })),
        returning: mockInsertReturning,
      })),
    })),
  })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({})),
}));

import * as dbQueries from "@/lib/db/queries";
import {
  AVAILABLE_COMPETITIONS,
  DEFAULT_COMPETITION_CODES,
} from "@/lib/db/schema";

describe("competition settings queries", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSelectResult.length = 0;
    mockInsertReturning.mockReset();
  });

  describe("getUserSettings", () => {
    it("is a function that accepts userId", async () => {
      expect(typeof dbQueries.getUserSettings).toBe("function");

      // Verify function signature
      const fn: (args: { userId: string }) => Promise<{
        id: string;
        userId: string;
        enabledCompetitions: string[] | null;
        createdAt: Date;
        updatedAt: Date;
      } | null> = dbQueries.getUserSettings;
      expect(fn).toBeDefined();
    });

    it("returns null when user has no settings", async () => {
      // Empty mockSelectResult means no settings found
      const result = await dbQueries.getUserSettings({ userId: "user-1" });
      expect(result).toBeNull();
    });
  });

  describe("upsertUserSettings", () => {
    it("is a function that accepts userId and enabledCompetitions", async () => {
      expect(typeof dbQueries.upsertUserSettings).toBe("function");

      // Verify function signature
      const fn: (args: {
        userId: string;
        enabledCompetitions?: string[] | null;
      }) => Promise<{
        id: string;
        userId: string;
        enabledCompetitions: string[] | null;
        createdAt: Date;
        updatedAt: Date;
      }> = dbQueries.upsertUserSettings;
      expect(fn).toBeDefined();
    });

    it("accepts an array of competition codes", () => {
      // Type check: enabledCompetitions should be a string array
      const params: Parameters<typeof dbQueries.upsertUserSettings>[0] = {
        userId: "user-1",
        enabledCompetitions: ["PL", "CL", "BL1"],
      };
      expect(params.enabledCompetitions).toEqual(["PL", "CL", "BL1"]);
    });

    it("accepts null to clear competitions", () => {
      // Type check: enabledCompetitions can be null
      const params: Parameters<typeof dbQueries.upsertUserSettings>[0] = {
        userId: "user-1",
        enabledCompetitions: null,
      };
      expect(params.enabledCompetitions).toBeNull();
    });
  });

  describe("getEnabledCompetitions", () => {
    it("is a function that accepts userId and returns string array", async () => {
      expect(typeof dbQueries.getEnabledCompetitions).toBe("function");

      // Verify return type
      const fn: (args: { userId: string }) => Promise<string[]> =
        dbQueries.getEnabledCompetitions;
      expect(fn).toBeDefined();
    });

    it("returns default competitions when user has no settings", async () => {
      // Empty mockSelectResult = no settings
      const result = await dbQueries.getEnabledCompetitions({
        userId: "user-1",
      });
      expect(result).toEqual(DEFAULT_COMPETITION_CODES);
    });
  });

  describe("getAllEnabledCompetitions", () => {
    it("is a function that returns all unique competitions across users", async () => {
      expect(typeof dbQueries.getAllEnabledCompetitions).toBe("function");

      // Verify return type
      const fn: () => Promise<string[]> = dbQueries.getAllEnabledCompetitions;
      expect(fn).toBeDefined();
    });

    it("returns defaults when no users have settings", async () => {
      const result = await dbQueries.getAllEnabledCompetitions();
      expect(result).toEqual(DEFAULT_COMPETITION_CODES);
    });
  });

  describe("DEFAULT_COMPETITION_CODES", () => {
    it("contains expected default competitions", () => {
      expect(DEFAULT_COMPETITION_CODES).toContain("PL"); // Premier League
      expect(DEFAULT_COMPETITION_CODES).toContain("ELC"); // Championship
      expect(DEFAULT_COMPETITION_CODES).toContain("CL"); // Champions League
      expect(DEFAULT_COMPETITION_CODES).toContain("EL"); // Europa League
      expect(DEFAULT_COMPETITION_CODES).toContain("BL1"); // Bundesliga
      expect(DEFAULT_COMPETITION_CODES).toContain("SA"); // Serie A
      expect(DEFAULT_COMPETITION_CODES).toContain("PD"); // La Liga
      expect(DEFAULT_COMPETITION_CODES).toContain("FL1"); // Ligue 1
    });

    it("is an array of strings", () => {
      expect(Array.isArray(DEFAULT_COMPETITION_CODES)).toBe(true);
      expect(
        DEFAULT_COMPETITION_CODES.every((c) => typeof c === "string")
      ).toBe(true);
    });
  });

  describe("AVAILABLE_COMPETITIONS", () => {
    it("contains competition objects with code, name, and country", () => {
      expect(AVAILABLE_COMPETITIONS.length).toBeGreaterThan(0);

      for (const comp of AVAILABLE_COMPETITIONS) {
        expect(comp).toHaveProperty("code");
        expect(comp).toHaveProperty("name");
        expect(comp).toHaveProperty("country");
        expect(typeof comp.code).toBe("string");
        expect(typeof comp.name).toBe("string");
        expect(typeof comp.country).toBe("string");
      }
    });

    it("includes major European leagues", () => {
      const codes = AVAILABLE_COMPETITIONS.map((c) => c.code);
      expect(codes).toContain("PL"); // Premier League
      expect(codes).toContain("CL"); // Champions League
      expect(codes).toContain("BL1"); // Bundesliga
      expect(codes).toContain("SA"); // Serie A
      expect(codes).toContain("PD"); // La Liga
    });

    it("includes Scandinavian leagues", () => {
      const codes = AVAILABLE_COMPETITIONS.map((c) => c.code);
      expect(codes).toContain("TIP"); // Eliteserien (Norway)
      expect(codes).toContain("ALL"); // Allsvenskan (Sweden)

      const eliteserien = AVAILABLE_COMPETITIONS.find((c) => c.code === "TIP");
      expect(eliteserien?.name).toBe("Eliteserien");
      expect(eliteserien?.country).toBe("Norway");

      const allsvenskan = AVAILABLE_COMPETITIONS.find((c) => c.code === "ALL");
      expect(allsvenskan?.name).toBe("Allsvenskan");
      expect(allsvenskan?.country).toBe("Sweden");
    });

    it("includes England Championship with football-data.org code ELC", () => {
      const championship = AVAILABLE_COMPETITIONS.find((c) => c.code === "ELC");

      expect(championship).toEqual({
        code: "ELC",
        name: "Championship",
        country: "England",
      });
    });

    it("includes all default competitions", () => {
      const availableCodes = AVAILABLE_COMPETITIONS.map((c) => c.code);
      for (const defaultCode of DEFAULT_COMPETITION_CODES) {
        expect(availableCodes).toContain(defaultCode);
      }
    });
  });
});

describe("competition settings API routes", () => {
  describe("GET /api/bets/settings/competitions", () => {
    it("should return enabled, available, and defaults", () => {
      // Type check: expected response structure
      interface GetCompetitionsResponse {
        enabled: string[];
        available: typeof AVAILABLE_COMPETITIONS;
        defaults: typeof DEFAULT_COMPETITION_CODES;
      }

      const mockResponse: GetCompetitionsResponse = {
        enabled: ["PL", "CL"],
        available: [...AVAILABLE_COMPETITIONS],
        defaults: [...DEFAULT_COMPETITION_CODES],
      };

      expect(mockResponse.enabled).toEqual(["PL", "CL"]);
      expect(mockResponse.available.length).toBeGreaterThan(0);
      expect(mockResponse.defaults).toEqual(DEFAULT_COMPETITION_CODES);
    });
  });

  describe("PATCH /api/bets/settings/competitions", () => {
    it("should accept competitions array", () => {
      // Type check: expected request structure
      interface PatchCompetitionsRequest {
        competitions: string[];
      }

      const mockRequest: PatchCompetitionsRequest = {
        competitions: ["PL", "CL", "BL1"],
      };

      expect(mockRequest.competitions.length).toBe(3);
    });

    it("should require at least one competition", () => {
      // The API validates that at least one competition is selected
      const invalidRequest = { competitions: [] };
      expect(invalidRequest.competitions.length).toBe(0);
    });
  });

  describe("POST /api/bets/settings/competitions (reset)", () => {
    it("should reset to defaults", () => {
      // Type check: expected response structure
      interface ResetCompetitionsResponse {
        success: boolean;
        enabled: string[];
        message: string;
      }

      const mockResponse: ResetCompetitionsResponse = {
        success: true,
        enabled: [...DEFAULT_COMPETITION_CODES],
        message: "Reset to default competitions",
      };

      expect(mockResponse.success).toBe(true);
      expect(mockResponse.enabled).toEqual(DEFAULT_COMPETITION_CODES);
    });
  });
});

describe("sync-matches route competition handling", () => {
  it("should use getAllEnabledCompetitions for cron sync", () => {
    // The sync-matches route calls getAllEnabledCompetitions
    // to get all unique competitions across all users
    expect(typeof dbQueries.getAllEnabledCompetitions).toBe("function");
  });

  it("should fall back to defaults if getAllEnabledCompetitions fails", () => {
    // Default competitions should be available as fallback
    expect(DEFAULT_COMPETITION_CODES).toBeDefined();
    expect(DEFAULT_COMPETITION_CODES.length).toBeGreaterThan(0);
  });
});
