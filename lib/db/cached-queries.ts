import { unstable_cache } from "next/cache";
import {
  getFootballMatchById,
  getRecentDepositsForAccount,
  listUpcomingMatches,
  listWalletsByUser,
  searchFootballMatches,
} from "@/lib/db/queries";

const REVALIDATE_60 = 60;
const REVALIDATE_300 = 300;

export const listUpcomingMatchesCached = unstable_cache(
  async (limit: number) => listUpcomingMatches({ daysAhead: 14, limit }),
  ["api-matches-upcoming"],
  { revalidate: REVALIDATE_60 }
);

export const searchFootballMatchesCached = unstable_cache(
  async (searchTerm: string, limit: number, fromDateIso: string) =>
    searchFootballMatches({
      searchTerm,
      fromDate: new Date(fromDateIso),
      limit,
    }),
  ["api-matches-search"],
  { revalidate: REVALIDATE_60 }
);

export const getFootballMatchByIdCached = unstable_cache(
  async (id: string) => getFootballMatchById({ id }),
  ["api-match-by-id"],
  { revalidate: REVALIDATE_300 }
);

export const listWalletsByUserCached = unstable_cache(
  async (userId: string) => listWalletsByUser(userId),
  ["api-wallets-by-user"],
  { revalidate: REVALIDATE_60 }
);

export const getRecentDepositsForAccountCached = unstable_cache(
  async (accountId: string, userId: string, limit = 10) =>
    getRecentDepositsForAccount({ accountId, userId, limit }),
  ["api-recent-deposits"],
  { revalidate: REVALIDATE_60 }
);
