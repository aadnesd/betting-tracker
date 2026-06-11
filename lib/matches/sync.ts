import {
  batchUpsertFootballMatches,
  countBetsReadyForAutoSettlement,
  getAllEnabledCompetitions,
} from "@/lib/db/queries";
import { DEFAULT_COMPETITION_CODES } from "@/lib/db/schema";
import { getActiveProvider } from "@/lib/matches";

export type MatchSyncResults = {
  provider: string;
  upcoming: { synced: number; errors: number };
  finished: { synced: number; errors: number };
  betsReadyForSettlement: number;
  competitions: string[];
  startedAt: string;
  completedAt: string;
  errors: string[];
};

/** How many days ahead/back the sync covers. */
const UPCOMING_DAYS_AHEAD = 10;
const FINISHED_DAYS_BACK = 3;

/**
 * Run a full match sync against the active provider and upsert into the
 * FootballMatch cache. Shared by the daily cron and the manual-sync endpoint.
 *
 * Throws on a fatal fetch/upsert error so callers can map it to an HTTP error;
 * non-fatal issues (e.g. competition resolution) fall back gracefully.
 */
export async function runMatchSync(): Promise<MatchSyncResults> {
  const provider = getActiveProvider();
  console.log(`[Match Sync] Active provider: ${provider.label}`);

  let userEnabled: string[];
  try {
    userEnabled = await getAllEnabledCompetitions();
  } catch (error) {
    console.warn(
      "[Match Sync] Failed to get user competitions, using defaults:",
      error
    );
    userEnabled = [...DEFAULT_COMPETITION_CODES];
  }

  let competitionsToSync: string[];
  try {
    competitionsToSync = await provider.resolveCompetitions(userEnabled);
  } catch (error) {
    console.warn(
      "[Match Sync] Provider failed to resolve competitions, using user list:",
      error
    );
    competitionsToSync = userEnabled;
  }

  const results: MatchSyncResults = {
    provider: provider.id,
    upcoming: { synced: 0, errors: 0 },
    finished: { synced: 0, errors: 0 },
    betsReadyForSettlement: 0,
    competitions: competitionsToSync,
    startedAt: new Date().toISOString(),
    completedAt: "",
    errors: [],
  };

  const now = new Date();
  const upcomingTo = new Date();
  upcomingTo.setDate(upcomingTo.getDate() + UPCOMING_DAYS_AHEAD);
  const finishedFrom = new Date();
  finishedFrom.setDate(finishedFrom.getDate() - FINISHED_DAYS_BACK);

  // Upcoming matches
  const upcomingParams = await provider.fetchUpcoming({
    competitions: competitionsToSync,
    from: now,
    to: upcomingTo,
  });
  console.log(`[Match Sync] Found ${upcomingParams.length} upcoming matches`);
  const upcomingResult = await batchUpsertFootballMatches(upcomingParams);
  results.upcoming = upcomingResult;

  // Recently finished matches (with scores)
  const finishedParams = await provider.fetchFinished({
    competitions: competitionsToSync,
    from: finishedFrom,
    to: now,
  });
  console.log(`[Match Sync] Found ${finishedParams.length} finished matches`);
  const finishedResult = await batchUpsertFootballMatches(finishedParams);
  results.finished = finishedResult;

  // Count bets now ready for auto-settlement (best-effort)
  try {
    results.betsReadyForSettlement = await countBetsReadyForAutoSettlement();
  } catch (error) {
    console.warn(
      "[Match Sync] Failed to count bets ready for settlement:",
      error
    );
  }

  results.completedAt = new Date().toISOString();
  console.log(
    `[Match Sync] Complete. Upcoming: ${results.upcoming.synced} synced, ${results.upcoming.errors} errors. Finished: ${results.finished.synced} synced, ${results.finished.errors} errors.`
  );

  return results;
}
