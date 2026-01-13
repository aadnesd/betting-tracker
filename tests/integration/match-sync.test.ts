/**
 * Integration tests for match syncing from football-data.org API.
 *
 * These tests make real API calls to football-data.org and real database operations.
 * Run with: HOME=$PWD/.home pnpm vitest run tests/integration/match-sync.test.ts
 *
 * Note: Requires FOOTBALL_DATA_API_TOKEN and POSTGRES_URL environment variables.
 * The free tier API has a 10 requests/minute limit, so tests run sequentially
 * with built-in retry logic.
 *
 * Why: Validates the full match sync flow end-to-end including:
 * - API connectivity and authentication
 * - Response parsing
 * - Database upsert operations
 * - Competition filtering
 * - Date range handling
 */

import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Mock server-only to allow testing server modules
vi.mock("server-only", () => ({}));

// Check for required environment variables
const hasApiToken = Boolean(process.env.FOOTBALL_DATA_API_TOKEN);
const hasPostgresUrl = Boolean(process.env.POSTGRES_URL);
const canRunIntegrationTests = hasApiToken && hasPostgresUrl;

/**
 * Helper to wait for rate limit reset.
 */
async function waitForRateLimit(ms: number = 6000): Promise<void> {
  console.log(`[Rate Limit] Waiting ${ms}ms for rate limit reset...`);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Small delay between API tests to stay under rate limit.
 * Free tier: 10 requests/minute = 1 request per 6 seconds.
 */
const API_DELAY_MS = 7000;

// API types from the sync-matches route
interface FootballDataMatch {
  id: number;
  utcDate: string;
  status:
    | "SCHEDULED"
    | "TIMED"
    | "IN_PLAY"
    | "PAUSED"
    | "FINISHED"
    | "POSTPONED"
    | "SUSPENDED"
    | "CANCELLED";
  homeTeam: {
    id: number;
    name: string;
    shortName?: string;
    tla?: string;
  };
  awayTeam: {
    id: number;
    name: string;
    shortName?: string;
    tla?: string;
  };
  competition: {
    id: number;
    name: string;
    code: string;
  };
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
}

interface FootballDataResponse {
  matches: FootballDataMatch[];
  resultSet?: {
    count: number;
    competitions: string;
    first: string;
    last: string;
  };
}

/**
 * Helper to format date as YYYY-MM-DD for the API.
 */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Helper to fetch matches directly from football-data.org API.
 * Includes retry logic for rate limiting.
 */
async function fetchMatchesFromApi({
  dateFrom,
  dateTo,
  competitions,
  status,
  retryCount = 0,
}: {
  dateFrom: Date;
  dateTo: Date;
  competitions?: string[];
  status?: string[];
  retryCount?: number;
}): Promise<FootballDataMatch[]> {
  const apiToken = process.env.FOOTBALL_DATA_API_TOKEN;

  if (!apiToken) {
    throw new Error("FOOTBALL_DATA_API_TOKEN not set");
  }

  const url = new URL("https://api.football-data.org/v4/matches");
  url.searchParams.set("dateFrom", formatDate(dateFrom));
  url.searchParams.set("dateTo", formatDate(dateTo));

  if (competitions?.length) {
    url.searchParams.set("competitions", competitions.join(","));
  }

  if (status?.length) {
    url.searchParams.set("status", status.join(","));
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-Auth-Token": apiToken,
    },
  });

  if (response.status === 429) {
    // Rate limited - wait and retry up to 2 times
    if (retryCount < 2) {
      const retryAfter = response.headers.get("X-RequestCounter-Reset");
      const waitMs = retryAfter ? (parseInt(retryAfter, 10) + 1) * 1000 : 12000;
      console.log(`[Rate Limit] Hit rate limit, waiting ${waitMs}ms before retry ${retryCount + 1}/2`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return fetchMatchesFromApi({ dateFrom, dateTo, competitions, status, retryCount: retryCount + 1 });
    }
    throw new Error("Rate limited by football-data.org API after retries");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data: FootballDataResponse = await response.json();
  return data.matches;
}

describe("Football-data.org API Integration", () => {
  beforeAll(() => {
    if (!hasApiToken) {
      console.warn(
        "⚠️ FOOTBALL_DATA_API_TOKEN not set. Skipping integration tests."
      );
    }
    if (!hasPostgresUrl) {
      console.warn(
        "⚠️ POSTGRES_URL not set. Database tests will be skipped."
      );
    }
  });

  describe.sequential("API Connectivity", () => {
    // Add delay between API tests to respect rate limit
    beforeEach(async () => {
      if (hasApiToken) {
        await waitForRateLimit(API_DELAY_MS);
      }
    });
    
    it.skipIf(!hasApiToken)(
      "connects to football-data.org API successfully",
      { timeout: 45000 },
      async () => {
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch a single day of Premier League matches
        const matches = await fetchMatchesFromApi({
          dateFrom: today,
          dateTo: tomorrow,
          competitions: ["PL"],
          status: ["SCHEDULED", "TIMED", "FINISHED"],
        });

        console.log(`[API Test] Found ${matches.length} matches for today`);

        // Should get back an array (may be empty if no matches today)
        expect(Array.isArray(matches)).toBe(true);
      }
    );

    it.skipIf(!hasApiToken)(
      "fetches upcoming Premier League matches",
      { timeout: 45000 },
      async () => {
        const today = new Date();
        // Free tier API has 10-day limit
        const tenDaysAhead = new Date();
        tenDaysAhead.setDate(tenDaysAhead.getDate() + 10);

        const matches = await fetchMatchesFromApi({
          dateFrom: today,
          dateTo: tenDaysAhead,
          competitions: ["PL"],
          status: ["SCHEDULED", "TIMED"],
        });

        console.log(
          `[API Test] Found ${matches.length} upcoming PL matches in next 10 days`
        );

        // Premier League has ~10 matches per week, so should have some in 10 days
        // But could be during international break, so we just check structure
        if (matches.length > 0) {
          const match = matches[0];
          expect(match).toHaveProperty("id");
          expect(match).toHaveProperty("utcDate");
          expect(match).toHaveProperty("homeTeam");
          expect(match).toHaveProperty("awayTeam");
          expect(match).toHaveProperty("competition");
          expect(match.competition.code).toBe("PL");
          expect(["SCHEDULED", "TIMED"]).toContain(match.status);

          console.log(
            `[API Test] Sample match: ${match.homeTeam.name} vs ${match.awayTeam.name} on ${match.utcDate}`
          );
        }
      }
    );

    it.skipIf(!hasApiToken)(
      "fetches recently finished matches",
      { timeout: 45000 },
      async () => {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const today = new Date();

        const matches = await fetchMatchesFromApi({
          dateFrom: threeDaysAgo,
          dateTo: today,
          competitions: ["PL", "CL", "BL1"],
          status: ["FINISHED"],
        });

        console.log(
          `[API Test] Found ${matches.length} finished matches in last 3 days`
        );

        if (matches.length > 0) {
          const match = matches[0];
          expect(match.status).toBe("FINISHED");
          expect(match.score).toBeDefined();
          expect(match.score.fullTime).toBeDefined();

          // Finished matches should have scores
          if (match.score.fullTime.home !== null) {
            expect(typeof match.score.fullTime.home).toBe("number");
            expect(typeof match.score.fullTime.away).toBe("number");
            console.log(
              `[API Test] Sample result: ${match.homeTeam.name} ${match.score.fullTime.home} - ${match.score.fullTime.away} ${match.awayTeam.name}`
            );
          }
        }
      }
    );

    it.skipIf(!hasApiToken)(
      "handles multiple competitions in one request",
      { timeout: 45000 },
      async () => {
        const today = new Date();
        // Free tier API has 10-day limit
        const sevenDaysAhead = new Date();
        sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

        const matches = await fetchMatchesFromApi({
          dateFrom: today,
          dateTo: sevenDaysAhead,
          competitions: ["PL", "CL", "EL", "BL1", "SA", "PD", "FL1"],
          status: ["SCHEDULED", "TIMED"],
        });

        console.log(
          `[API Test] Found ${matches.length} matches across 7 competitions`
        );

        // Check that we got matches from different competitions
        const competitionCodes = [...new Set(matches.map((m) => m.competition.code))];
        console.log(`[API Test] Competitions represented: ${competitionCodes.join(", ")}`);

        // We should have at least some matches unless it's a complete break
        // Just validate structure
        for (const match of matches.slice(0, 3)) {
          expect(match.id).toBeDefined();
          expect(match.homeTeam.name).toBeDefined();
          expect(match.awayTeam.name).toBeDefined();
        }
      }
    );
  });

  describe.sequential("Match Data Parsing", () => {
    // Add delay between API tests to respect rate limit
    beforeEach(async () => {
      if (hasApiToken) {
        await waitForRateLimit(API_DELAY_MS);
      }
    });
    
    it.skipIf(!hasApiToken)(
      "parseFootballDataMatch transforms API response correctly",
      { timeout: 45000 },
      async () => {
        // Import the parser function
        const { parseFootballDataMatch } = await import(
          "@/app/(chat)/api/cron/sync-matches/route"
        );

        const today = new Date();
        // Free tier API has 10-day limit
        const sevenDaysAhead = new Date();
        sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

        const matches = await fetchMatchesFromApi({
          dateFrom: today,
          dateTo: sevenDaysAhead,
          competitions: ["PL"],
          status: ["SCHEDULED", "TIMED"],
        });

        if (matches.length === 0) {
          console.log("[Parse Test] No matches found, skipping parse test");
          return;
        }

        const apiMatch = matches[0];
        const parsed = parseFootballDataMatch(apiMatch);

        console.log("[Parse Test] Original API match:", JSON.stringify(apiMatch, null, 2));
        console.log("[Parse Test] Parsed match:", JSON.stringify(parsed, null, 2));

        // Validate parsed fields
        expect(parsed.externalId).toBe(apiMatch.id);
        expect(parsed.homeTeam).toBe(apiMatch.homeTeam.name);
        expect(parsed.awayTeam).toBe(apiMatch.awayTeam.name);
        expect(parsed.competition).toBe(apiMatch.competition.name);
        expect(parsed.competitionCode).toBe(apiMatch.competition.code);
        expect(parsed.status).toBe(apiMatch.status);
        expect(parsed.matchDate).toBeInstanceOf(Date);
        // Compare timestamps (API may not include milliseconds, but parsed Date will)
        expect(parsed.matchDate.getTime()).toBe(new Date(apiMatch.utcDate).getTime());
      }
    );

    it.skipIf(!hasApiToken)(
      "parses finished match with scores correctly",
      { timeout: 30000 },
      async () => {
        const { parseFootballDataMatch } = await import(
          "@/app/(chat)/api/cron/sync-matches/route"
        );

        // Free tier has 10-day limit, use 7 days back
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const today = new Date();

        const matches = await fetchMatchesFromApi({
          dateFrom: sevenDaysAgo,
          dateTo: today,
          competitions: ["PL", "BL1", "SA"],
          status: ["FINISHED"],
        });

        // Find a match with actual scores
        const matchWithScores = matches.find(
          (m) => m.score.fullTime.home !== null && m.score.fullTime.away !== null
        );

        if (!matchWithScores) {
          console.log("[Parse Test] No finished matches with scores found");
          return;
        }

        const parsed = parseFootballDataMatch(matchWithScores);

        expect(parsed.homeScore).toBe(matchWithScores.score.fullTime.home);
        expect(parsed.awayScore).toBe(matchWithScores.score.fullTime.away);
        expect(parsed.status).toBe("FINISHED");

        console.log(
          `[Parse Test] Parsed finished match: ${parsed.homeTeam} ${parsed.homeScore} - ${parsed.awayScore} ${parsed.awayTeam}`
        );
      }
    );
  });

  describe.sequential("Database Operations", () => {
    // Database operations don't need delays but mark sequential for consistency
    
    it.skipIf(!canRunIntegrationTests)(
      "upserts match to database successfully",
      { timeout: 45000 },
      async () => {
        const { upsertFootballMatch, getFootballMatchByExternalId } = await import(
          "@/lib/db/queries"
        );

        // Create a test match with a unique external ID
        const testExternalId = 999999999 + Math.floor(Math.random() * 1000);
        const testMatch = {
          externalId: testExternalId,
          homeTeam: "Test Home FC",
          awayTeam: "Test Away United",
          competition: "Test League",
          competitionCode: "TL",
          matchDate: new Date("2026-01-20T15:00:00Z"),
          status: "SCHEDULED" as const,
          homeScore: null,
          awayScore: null,
        };

        console.log(`[DB Test] Upserting test match with externalId: ${testExternalId}`);

        // Upsert the match
        const result = await upsertFootballMatch(testMatch);

        expect(result).toBeDefined();
        expect(result.externalId).toBe(String(testExternalId));
        expect(result.homeTeam).toBe(testMatch.homeTeam);
        expect(result.awayTeam).toBe(testMatch.awayTeam);

        console.log(`[DB Test] Match upserted with ID: ${result.id}`);

        // Verify it exists in the database
        const fetched = await getFootballMatchByExternalId({ externalId: testExternalId });
        expect(fetched).not.toBeNull();
        expect(fetched?.homeTeam).toBe(testMatch.homeTeam);

        // Update the match (simulate result coming in)
        const updatedMatch = {
          ...testMatch,
          status: "FINISHED" as const,
          homeScore: 2,
          awayScore: 1,
        };

        const updateResult = await upsertFootballMatch(updatedMatch);
        expect(updateResult.status).toBe("FINISHED");
        expect(updateResult.homeScore).toBe("2");
        expect(updateResult.awayScore).toBe("1");

        console.log(`[DB Test] Match updated with score: ${updateResult.homeScore}-${updateResult.awayScore}`);
      }
    );

    it.skipIf(!canRunIntegrationTests)(
      "syncs real matches from API to database",
      { timeout: 90000 },
      async () => {
        // Wait for rate limit before API call
        await waitForRateLimit(API_DELAY_MS);
        
        const { parseFootballDataMatch } = await import(
          "@/app/(chat)/api/cron/sync-matches/route"
        );
        const { upsertFootballMatch, getFootballMatchByExternalId } = await import(
          "@/lib/db/queries"
        );

        // Fetch a few real matches (7-day range for free tier)
        const today = new Date();
        const sevenDaysAhead = new Date();
        sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

        let matches = await fetchMatchesFromApi({
          dateFrom: today,
          dateTo: sevenDaysAhead,
          competitions: ["PL"],
          status: ["SCHEDULED", "TIMED", "FINISHED"],
        });

        if (matches.length === 0) {
          console.log("[DB Test] No PL matches in next 7 days, trying finished matches");
          
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          
          matches = await fetchMatchesFromApi({
            dateFrom: sevenDaysAgo,
            dateTo: today,
            competitions: ["PL"],
            status: ["FINISHED"],
          });

          if (matches.length === 0) {
            console.log("[DB Test] No PL matches found, skipping");
            return;
          }
        }

        console.log(`[DB Test] Syncing ${Math.min(matches.length, 3)} matches to database`);

        // Sync first 3 matches
        const syncedIds: number[] = [];
        for (const apiMatch of matches.slice(0, 3)) {
          const params = parseFootballDataMatch(apiMatch);
          const result = await upsertFootballMatch(params);
          syncedIds.push(apiMatch.id);
          console.log(
            `[DB Test] Synced: ${result.homeTeam} vs ${result.awayTeam} (${result.status})`
          );
        }

        // Verify all synced matches exist
        for (const externalId of syncedIds) {
          const match = await getFootballMatchByExternalId({ externalId });
          expect(match).not.toBeNull();
        }

        console.log(`[DB Test] Verified ${syncedIds.length} matches in database`);
      }
    );
  });

  describe.sequential("Competition Settings Integration", () => {
    it.skipIf(!canRunIntegrationTests)(
      "respects user-configured competitions",
      { timeout: 45000 },
      async () => {
        const {
          getAllEnabledCompetitions,
          upsertUserSettings,
        } = await import("@/lib/db/queries");
        const { DEFAULT_COMPETITION_CODES } = await import("@/lib/db/schema");

        // First check what defaults are
        const defaults = await getAllEnabledCompetitions();
        console.log(`[Settings Test] Default competitions: ${defaults.join(", ")}`);

        // Defaults should match the exported constant if no users have settings
        expect(defaults.length).toBeGreaterThan(0);

        // Verify DEFAULT_COMPETITION_CODES is what we expect
        expect(DEFAULT_COMPETITION_CODES).toContain("PL");
        expect(DEFAULT_COMPETITION_CODES).toContain("CL");
      }
    );
  });

  describe.sequential("Rate Limiting", () => {
    // Rate limit test should wait before running
    beforeEach(async () => {
      if (hasApiToken) {
        await waitForRateLimit(API_DELAY_MS);
      }
    });
    
    it.skipIf(!hasApiToken)(
      "handles API response headers correctly",
      { timeout: 45000 },
      async () => {
        const apiToken = process.env.FOOTBALL_DATA_API_TOKEN;

        const today = new Date();
        const url = new URL("https://api.football-data.org/v4/matches");
        url.searchParams.set("dateFrom", formatDate(today));
        url.searchParams.set("dateTo", formatDate(today));
        url.searchParams.set("competitions", "PL");

        const response = await fetch(url.toString(), {
          headers: {
            "X-Auth-Token": apiToken!,
          },
        });

        // Check rate limit headers
        const requestsAvailable = response.headers.get("X-Requests-Available-Minute");
        const requestCounter = response.headers.get("X-RequestCounter-Reset");

        console.log(`[Rate Limit Test] Status: ${response.status}`);
        console.log(`[Rate Limit Test] Requests available: ${requestsAvailable}`);
        console.log(`[Rate Limit Test] Counter reset: ${requestCounter}`);

        // Either we get a successful response, or 429 (rate limited)
        // Both are valid - we just want to verify headers are present
        expect([200, 429]).toContain(response.status);
        
        // If rate limited, the counter reset header should tell us when
        if (response.status === 429) {
          expect(requestCounter).not.toBeNull();
          console.log(`[Rate Limit Test] Rate limited - reset in ${requestCounter}s`);
        } else {
          expect(response.ok).toBe(true);
        }
      }
    );
  });
});

describe.sequential("Match Search API Integration", () => {
  it.skipIf(!canRunIntegrationTests)(
    "searchFootballMatches finds synced matches",
    { timeout: 45000 },
    async () => {
      const { searchFootballMatches, listUpcomingMatches } = await import(
        "@/lib/db/queries"
      );

      // First check if we have any matches in the database
      const upcomingMatches = await listUpcomingMatches({
        fromDate: new Date(),
        limit: 10,
      });

      console.log(`[Search Test] Found ${upcomingMatches.length} upcoming matches in DB`);

      if (upcomingMatches.length === 0) {
        console.log("[Search Test] No matches in DB, skipping search test");
        return;
      }

      // Search for a team name from one of the matches
      const testMatch = upcomingMatches[0];
      const searchTerm = testMatch.homeTeam.split(" ")[0]; // First word of team name

      console.log(`[Search Test] Searching for: "${searchTerm}"`);

      const searchResults = await searchFootballMatches({
        searchTerm,
        fromDate: new Date(),
        limit: 20,
      });

      console.log(`[Search Test] Found ${searchResults.length} matches for "${searchTerm}"`);

      // Should find at least the match we searched for
      expect(searchResults.length).toBeGreaterThan(0);

      // Verify search result contains the term
      const containsSearchTerm = searchResults.some(
        (m) =>
          m.homeTeam.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.awayTeam.toLowerCase().includes(searchTerm.toLowerCase())
      );
      expect(containsSearchTerm).toBe(true);
    }
  );
});
