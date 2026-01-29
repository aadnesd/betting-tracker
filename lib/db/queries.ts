import "server-only";

import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  sum,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ChatSDKError } from "../errors";
import { convertAmountToNok } from "../fx-rates";
import { generateUUID } from "../utils";
import {
  account,
  accountTransaction,
  auditLog,
  backBet,
  balanceSnapshot,
  bonusQualifyingBet,
  depositBonus,
  type DepositBonusStatus,
  footballMatch,
  type FootballMatchStatus,
  freeBet,
  freeBetWageringBet,
  layBet,
  matchedBet,
  promo,
  qualifyingBet,
  screenshotUpload,
  type User,
  user,
  userSettings,
  wallet,
  walletTransaction,
  type WageringBase,
  type WalletType,
  type WalletStatus,
  type WalletTransactionType,
  DEFAULT_COMPETITION_CODES,
} from "./schema";
import { generateHashedPassword } from "./utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

const normalizeAccountName = (name: string) => name.trim().toLowerCase();
const normalizePromoType = (type: string) => type.trim().toLowerCase();

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create user");
  }
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    const [found] = await db.select().from(user).where(eq(user.id, id));
    return found ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get user by id");
  }
}

export async function createOAuthUser(email: string) {
  try {
    const [created] = await db
      .insert(user)
      .values({ email, password: null })
      .returning({ id: user.id, email: user.email });
    return created;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create OAuth user"
    );
  }
}

async function updateUserEmailForOAuth({
  id,
  email,
}: {
  id: string;
  email: string;
}) {
  try {
    const [updated] = await db
      .update(user)
      .set({ email, password: null })
      .where(eq(user.id, id))
      .returning({ id: user.id, email: user.email });
    return updated;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update user for OAuth"
    );
  }
}

async function transferUserData({
  fromUserId,
  toUserId,
}: {
  fromUserId: string;
  toUserId: string;
}) {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(screenshotUpload)
        .set({ userId: toUserId })
        .where(eq(screenshotUpload.userId, fromUserId));
      await tx
        .update(account)
        .set({ userId: toUserId })
        .where(eq(account.userId, fromUserId));
      await tx
        .update(promo)
        .set({ userId: toUserId })
        .where(eq(promo.userId, fromUserId));
      await tx
        .update(accountTransaction)
        .set({ userId: toUserId })
        .where(eq(accountTransaction.userId, fromUserId));
      await tx
        .update(backBet)
        .set({ userId: toUserId })
        .where(eq(backBet.userId, fromUserId));
      await tx
        .update(layBet)
        .set({ userId: toUserId })
        .where(eq(layBet.userId, fromUserId));
      await tx
        .update(matchedBet)
        .set({ userId: toUserId })
        .where(eq(matchedBet.userId, fromUserId));
      await tx
        .update(auditLog)
        .set({ userId: toUserId })
        .where(eq(auditLog.userId, fromUserId));
      await tx
        .update(freeBet)
        .set({ userId: toUserId })
        .where(eq(freeBet.userId, fromUserId));

      const existingSettings = await tx
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, toUserId));
      if (existingSettings.length > 0) {
        await tx
          .delete(userSettings)
          .where(eq(userSettings.userId, fromUserId));
      } else {
        await tx
          .update(userSettings)
          .set({ userId: toUserId })
          .where(eq(userSettings.userId, fromUserId));
      }

      await tx.delete(user).where(eq(user.id, fromUserId));
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to transfer user data"
    );
  }
}

export async function findOrCreateOAuthUser({
  email,
  guestUserId,
}: {
  email: string;
  guestUserId?: string | null;
}) {
  const existingUsers = await getUser(email);
  const existingUser = existingUsers[0];

  if (existingUser) {
    if (guestUserId && guestUserId !== existingUser.id) {
      await transferUserData({
        fromUserId: guestUserId,
        toUserId: existingUser.id,
      });
      return { userId: existingUser.id, linkedFromGuest: true };
    }

    return { userId: existingUser.id, linkedFromGuest: Boolean(guestUserId) };
  }

  if (guestUserId) {
    const updated = await updateUserEmailForOAuth({ id: guestUserId, email });
    if (updated) {
      return { userId: updated.id, linkedFromGuest: true };
    }
  }

  const created = await createOAuthUser(email);
  return { userId: created.id, linkedFromGuest: false };
}

export async function getAccountById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(account)
      .where(and(eq(account.id, id), eq(account.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to fetch account");
  }
}

export async function getAccountByName({
  userId,
  name,
  kind,
}: {
  userId: string;
  name: string;
  kind: "bookmaker" | "exchange";
}) {
  try {
    const normalized = normalizeAccountName(name);
    const [row] = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.nameNormalized, normalized),
          eq(account.kind, kind)
        )
      )
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to fetch account");
  }
}

export async function createAccount({
  userId,
  name,
  kind,
  currency,
  commission,
  limits,
  status,
}: {
  userId: string;
  name: string;
  kind: "bookmaker" | "exchange";
  currency?: string | null;
  commission?: number | null;
  limits?: Record<string, unknown> | null;
  status?: "active" | "archived";
}) {
  try {
    const normalizedName = normalizeAccountName(name);
    const values: typeof account.$inferInsert = {
      createdAt: new Date(),
      userId,
      name: name.trim(),
      nameNormalized: normalizedName,
      kind,
      currency: currency ?? null,
      commission:
        commission === undefined || commission === null
          ? null
          : commission.toString(),
      status: status ?? "active",
      limits: limits ?? null,
    };

    const [row] = await db.insert(account).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create account");
  }
}

export async function getOrCreateAccount({
  userId,
  name,
  kind,
  currency,
}: {
  userId: string;
  name: string;
  kind: "bookmaker" | "exchange";
  currency?: string | null;
}) {
  const trimmed = name.trim();
  const safeName = trimmed.length > 0 ? trimmed : "Unknown";
  const existing = await getAccountByName({
    userId,
    name: safeName,
    kind,
  });
  if (existing) {
    return existing;
  }
  return createAccount({ userId, name: safeName, kind, currency });
}

export async function listAccountsByUser({
  userId,
  limit = 200,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(account)
      .where(eq(account.userId, userId))
      .orderBy(desc(account.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list accounts");
  }
}

export async function updateAccount({
  id,
  userId,
  name,
  kind,
  currency,
  commission,
  status,
  limits,
}: {
  id: string;
  userId: string;
  name?: string;
  kind?: "bookmaker" | "exchange";
  currency?: string | null;
  commission?: number | null;
  status?: "active" | "archived";
  limits?: Record<string, unknown> | null;
}) {
  try {
    const updates: Partial<typeof account.$inferInsert> = {};
    if (name !== undefined) {
      updates.name = name.trim();
      updates.nameNormalized = normalizeAccountName(name);
    }
    if (kind !== undefined) {
      updates.kind = kind;
    }
    if (currency !== undefined) {
      updates.currency = currency;
    }
    if (commission !== undefined) {
      updates.commission = commission === null ? null : commission.toString();
    }
    if (status !== undefined) {
      updates.status = status;
    }
    if (limits !== undefined) {
      updates.limits = limits;
    }

    if (Object.keys(updates).length === 0) {
      const existing = await getAccountById({ id, userId });
      return existing;
    }

    const [row] = await db
      .update(account)
      .set(updates)
      .where(and(eq(account.id, id), eq(account.userId, userId)))
      .returning();
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update account");
  }
}

/**
 * Calculate current balance for a single account by summing all transactions.
 * Deposits and bonuses add, withdrawals and adjustments (negative) subtract.
 */
export async function getAccountBalance({
  userId,
  accountId,
}: {
  userId: string;
  accountId: string;
}): Promise<number> {
  try {
    const result = await db
      .select({
        // Deposits and bonuses add to balance, withdrawals subtract
        balance: sql<string>`COALESCE(
          SUM(
            CASE 
              WHEN ${accountTransaction.type} = 'withdrawal' THEN -1 * ${accountTransaction.amount}::numeric
              ELSE ${accountTransaction.amount}::numeric
            END
          ), 0
        )`,
      })
      .from(accountTransaction)
      .where(
        and(
          eq(accountTransaction.accountId, accountId),
          eq(accountTransaction.userId, userId)
        )
      );
    return Number.parseFloat(result[0]?.balance ?? "0");
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get account balance"
    );
  }
}

export interface AccountWithBalance {
  id: string;
  createdAt: Date;
  userId: string;
  name: string;
  nameNormalized: string;
  kind: "bookmaker" | "exchange";
  currency: string | null;
  commission: string | null;
  status: "active" | "archived";
  limits: unknown;
  currentBalance: number;
  transactionCount: number;
}

/**
 * List all accounts for a user with computed balance from transactions.
 * Returns account info plus currentBalance (sum of transactions).
 */
export async function listAccountsWithBalances({
  userId,
  kind,
  status,
  limit = 200,
}: {
  userId: string;
  kind?: "bookmaker" | "exchange";
  status?: "active" | "archived";
  limit?: number;
}): Promise<AccountWithBalance[]> {
  try {
    const conditions: SQL[] = [eq(account.userId, userId)];
    if (kind) {
      conditions.push(eq(account.kind, kind));
    }
    if (status) {
      conditions.push(eq(account.status, status));
    }

    // Subquery to get transaction sums per account
    const balanceSubquery = db
      .select({
        accountId: accountTransaction.accountId,
        balance: sql<string>`COALESCE(
          SUM(
            CASE 
              WHEN ${accountTransaction.type} = 'withdrawal' THEN -1 * ${accountTransaction.amount}::numeric
              ELSE ${accountTransaction.amount}::numeric
            END
          ), 0
        )`.as("balance"),
        txCount: count(accountTransaction.id).as("tx_count"),
      })
      .from(accountTransaction)
      .where(eq(accountTransaction.userId, userId))
      .groupBy(accountTransaction.accountId)
      .as("balance_agg");

    const rows = await db
      .select({
        id: account.id,
        createdAt: account.createdAt,
        userId: account.userId,
        name: account.name,
        nameNormalized: account.nameNormalized,
        kind: account.kind,
        currency: account.currency,
        commission: account.commission,
        status: account.status,
        limits: account.limits,
        currentBalance: sql<string>`COALESCE(${balanceSubquery.balance}, '0')`,
        transactionCount: sql<number>`COALESCE(${balanceSubquery.txCount}, 0)`,
      })
      .from(account)
      .leftJoin(balanceSubquery, eq(account.id, balanceSubquery.accountId))
      .where(and(...conditions))
      .orderBy(asc(account.kind), asc(account.name))
      .limit(limit);

    return rows.map((row) => ({
      ...row,
      currentBalance: Number.parseFloat(String(row.currentBalance) || "0"),
      transactionCount: Number(row.transactionCount || 0),
    }));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list accounts with balances"
    );
  }
}

/**
 * Bankroll summary type for dashboard display.
 */
export interface BankrollSummary {
  totalCapital: number;
  bookmakerBalance: number;
  exchangeBalance: number;
  accountCount: number;
  activeAccountCount: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalBonuses: number;
  netDeposits: number;
}

/**
 * Get bankroll summary aggregating all account balances and transactions.
 * Converts all balances to NOK for totals (supports fiat + crypto via FX API).
 * Why: Provides holistic view of funds across all accounts for bankroll management.
 */
export async function getBankrollSummary({
  userId,
}: {
  userId: string;
}): Promise<BankrollSummary> {
  try {
    // Get all accounts with balances
    const accounts = await listAccountsWithBalances({
      userId,
      status: "active",
    });

    // Aggregate by kind, converting each balance to NOK
    const bookmakerAccounts = accounts.filter((a) => a.kind === "bookmaker");
    const exchangeAccounts = accounts.filter((a) => a.kind === "exchange");

    // Convert each account balance to NOK for proper aggregation
    const bookmakerBalancesNok = await Promise.all(
      bookmakerAccounts.map((a) =>
        convertAmountToNok(a.currentBalance, a.currency)
      )
    );
    const exchangeBalancesNok = await Promise.all(
      exchangeAccounts.map((a) =>
        convertAmountToNok(a.currentBalance, a.currency)
      )
    );

    const bookmakerBalance = bookmakerBalancesNok.reduce(
      (sum, bal) => sum + bal,
      0
    );
    const exchangeBalance = exchangeBalancesNok.reduce(
      (sum, bal) => sum + bal,
      0
    );

    // Get transaction totals (note: these are mixed currencies, we aggregate them in NOK)
    // For accurate conversion we'd need to join with account currency, but for now
    // we use a simplified approach assuming most transactions are close to NOK
    const [txTotals] = await db
      .select({
        totalDeposits: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'deposit' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
        totalWithdrawals: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'withdrawal' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
        totalBonuses: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'bonus' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
      })
      .from(accountTransaction)
      .where(eq(accountTransaction.userId, userId));

    const totalDeposits = Number.parseFloat(
      String(txTotals?.totalDeposits || "0")
    );
    const totalWithdrawals = Number.parseFloat(
      String(txTotals?.totalWithdrawals || "0")
    );
    const totalBonuses = Number.parseFloat(
      String(txTotals?.totalBonuses || "0")
    );

    // Treat null/undefined status as active for backwards compatibility
    const isActive = (status: string | null | undefined) =>
      status === "active" || !status;

    return {
      totalCapital: bookmakerBalance + exchangeBalance,
      bookmakerBalance,
      exchangeBalance,
      accountCount: accounts.length,
      activeAccountCount: accounts.filter((a) => isActive(a.status)).length,
      totalDeposits,
      totalWithdrawals,
      totalBonuses,
      netDeposits: totalDeposits - totalWithdrawals,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get bankroll summary"
    );
  }
}

/**
 * Open bet stakes per account - shows funds tied up in unsettled bets.
 * Note: openBackStake excludes free bet stakes since they don't lock real money.
 * openFreeBetStake tracks free bet stakes separately for informational purposes.
 */
export interface OpenBetStakes {
  accountId: string;
  /** Real money stakes locked in open back bets (excludes free bets) */
  openBackStake: number;
  /** Free bet stakes in open bets (not locked, for display purposes) */
  openFreeBetStake: number;
  openLayStake: number;
  openLayLiability: number;
  /** Total locked stake = openBackStake + openLayLiability (excludes free bets) */
  totalOpenStake: number;
}

/**
 * Get open (unsettled) bet stakes per account.
 * Sums stakes from back_bet and lay_bet tables where status != 'settled'.
 * For lay bets, also calculates liability = stake * (odds - 1).
 * Why: Shows how much capital is tied up in active positions vs available for withdrawal.
 * 
 * Note: Free bet stakes are EXCLUDED from openBackStake since they don't lock real money.
 * A back bet is considered a free bet if its linked matchedBet has a free bet promo type.
 */
export async function getOpenBetStakesByAccount({
  userId,
}: {
  userId: string;
}): Promise<OpenBetStakes[]> {
  try {
    // Query back bets that are not settled, excluding free bet stakes.
    // Free bets don't lock real money from the account balance.
    // We LEFT JOIN with matchedBet to check if promoType indicates a free bet.
    const backStakes = await db
      .select({
        accountId: backBet.accountId,
        // Only sum stakes where the matched bet is NOT a free bet
        totalStake: sql<string>`COALESCE(SUM(
          CASE WHEN (
            ${matchedBet.promoType} IS NULL OR
            NOT (
              LOWER(${matchedBet.promoType}) LIKE '%free bet%' OR
              LOWER(${matchedBet.promoType}) LIKE '%freebet%' OR
              LOWER(${matchedBet.promoType}) LIKE '%free_bet%'
            )
          ) THEN ${backBet.stake}::numeric ELSE 0 END
        ), 0)`,
        // Sum free bet stakes separately for informational display
        freeBetStake: sql<string>`COALESCE(SUM(
          CASE WHEN (
            ${matchedBet.promoType} IS NOT NULL AND (
              LOWER(${matchedBet.promoType}) LIKE '%free bet%' OR
              LOWER(${matchedBet.promoType}) LIKE '%freebet%' OR
              LOWER(${matchedBet.promoType}) LIKE '%free_bet%'
            )
          ) THEN ${backBet.stake}::numeric ELSE 0 END
        ), 0)`,
      })
      .from(backBet)
      .leftJoin(matchedBet, eq(matchedBet.backBetId, backBet.id))
      .where(
        and(
          eq(backBet.userId, userId),
          isNotNull(backBet.accountId),
          ne(backBet.status, "settled")
        )
      )
      .groupBy(backBet.accountId);

    // Query lay bets that are not settled
    // For lay bets: stake is what you win if bet loses, liability is stake * (odds - 1)
    const layStakes = await db
      .select({
        accountId: layBet.accountId,
        totalStake: sql<string>`COALESCE(SUM(${layBet.stake}::numeric), 0)`,
        totalLiability: sql<string>`COALESCE(SUM(${layBet.stake}::numeric * (${layBet.odds}::numeric - 1)), 0)`,
      })
      .from(layBet)
      .where(
        and(
          eq(layBet.userId, userId),
          isNotNull(layBet.accountId),
          ne(layBet.status, "settled")
        )
      )
      .groupBy(layBet.accountId);

    // Merge results by accountId
    const accountMap = new Map<
      string,
      {
        openBackStake: number;
        openFreeBetStake: number;
        openLayStake: number;
        openLayLiability: number;
      }
    >();

    for (const row of backStakes) {
      if (row.accountId) {
        const existing = accountMap.get(row.accountId) || {
          openBackStake: 0,
          openFreeBetStake: 0,
          openLayStake: 0,
          openLayLiability: 0,
        };
        existing.openBackStake = Number.parseFloat(String(row.totalStake) || "0");
        existing.openFreeBetStake = Number.parseFloat(String(row.freeBetStake) || "0");
        accountMap.set(row.accountId, existing);
      }
    }

    for (const row of layStakes) {
      if (row.accountId) {
        const existing = accountMap.get(row.accountId) || {
          openBackStake: 0,
          openFreeBetStake: 0,
          openLayStake: 0,
          openLayLiability: 0,
        };
        existing.openLayStake = Number.parseFloat(String(row.totalStake) || "0");
        existing.openLayLiability = Number.parseFloat(String(row.totalLiability) || "0");
        accountMap.set(row.accountId, existing);
      }
    }

    // Convert to array with totals
    const results: OpenBetStakes[] = [];
    for (const [accountId, stakes] of accountMap) {
      results.push({
        accountId,
        openBackStake: stakes.openBackStake,
        openFreeBetStake: stakes.openFreeBetStake,
        openLayStake: stakes.openLayStake,
        openLayLiability: stakes.openLayLiability,
        // For bookmakers: back stake is locked. For exchanges: lay liability is locked.
        // Free bet stakes are NOT included in totalOpenStake since they don't lock real money.
        totalOpenStake: stakes.openBackStake + stakes.openLayLiability,
      });
    }

    return results;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get open bet stakes"
    );
  }
}

/**
 * Transaction trend data point for charts.
 */
export interface TransactionTrendPoint {
  date: string;
  label: string;
  deposits: number;
  withdrawals: number;
  bonuses: number;
  net: number;
}

export interface BalanceTrendPoint {
  date: string;
  label: string;
  net: number;
}

/**
 * Get transaction trends grouped by day/week/month for charts.
 * Why: Enables visualization of deposit/withdrawal patterns over time.
 */
export async function getTransactionTrends({
  userId,
  startDate,
  endDate,
  groupBy = "day",
}: {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  groupBy?: "day" | "week" | "month";
}): Promise<TransactionTrendPoint[]> {
  try {
    const conditions: SQL[] = [eq(accountTransaction.userId, userId)];

    if (startDate) {
      conditions.push(gte(accountTransaction.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(accountTransaction.createdAt, endDate));
    }

    // Date truncation based on groupBy
    const dateTrunc =
      groupBy === "month"
        ? sql`DATE_TRUNC('month', ${accountTransaction.createdAt})`
        : groupBy === "week"
          ? sql`DATE_TRUNC('week', ${accountTransaction.createdAt})`
          : sql`DATE_TRUNC('day', ${accountTransaction.createdAt})`;

    const rows = await db
      .select({
        periodDate: sql<string>`${dateTrunc}::date`.as("period_date"),
        deposits: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'deposit' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
        withdrawals: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'withdrawal' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
        bonuses: sql<string>`COALESCE(SUM(CASE WHEN ${accountTransaction.type} = 'bonus' THEN ${accountTransaction.amount}::numeric ELSE 0 END), 0)`,
      })
      .from(accountTransaction)
      .where(and(...conditions))
      .groupBy(dateTrunc)
      .orderBy(asc(sql`${dateTrunc}`));

    return rows.map((row) => {
      const deposits = Number.parseFloat(String(row.deposits || "0"));
      const withdrawals = Number.parseFloat(String(row.withdrawals || "0"));
      const bonuses = Number.parseFloat(String(row.bonuses || "0"));
      const dateStr = String(row.periodDate);
      const date = new Date(dateStr);

      // Format label based on groupBy
      let label: string;
      if (groupBy === "month") {
        label = date.toLocaleDateString("en-GB", {
          month: "short",
          year: "numeric",
        });
      } else if (groupBy === "week") {
        label = `Week of ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
      } else {
        label = date.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        });
      }

      return {
        date: dateStr,
        label,
        deposits,
        withdrawals,
        bonuses,
        net: deposits - withdrawals + bonuses,
      };
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get transaction trends"
    );
  }
}

/**
 * Get balance trends (net deposits/withdrawals/bonuses/adjustments) grouped by day/week/month.
 * Includes both account transactions (bookmakers/exchanges) and wallet transactions.
 * 
 * IMPORTANT: Internal transfers (wallet <-> account) are excluded to avoid double-counting.
 * Only external money flows are counted:
 * - Account deposits/withdrawals NOT linked to wallet transactions
 * - Wallet deposits/withdrawals NOT linked to account transactions
 * 
 * Uses pre-computed amountNok from the database (no FX API calls needed).
 * Falls back to live FX conversion for legacy rows without amountNok.
 */
export async function getBalanceTrends({
  userId,
  startDate,
  endDate,
  groupBy = "day",
}: {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  groupBy?: "day" | "week" | "month";
}): Promise<BalanceTrendPoint[]> {
  try {
    // 1. Fetch account transactions (bookmakers/exchanges)
    // Exclude transactions linked to wallet transactions (internal transfers) to avoid double-counting
    const accountConditions: SQL[] = [
      eq(accountTransaction.userId, userId),
      isNull(accountTransaction.linkedWalletTransactionId), // Exclude internal wallet<->account transfers
    ];

    if (startDate) {
      accountConditions.push(gte(accountTransaction.occurredAt, startDate));
    }
    if (endDate) {
      accountConditions.push(lte(accountTransaction.occurredAt, endDate));
    }

    const accountDateTrunc =
      groupBy === "month"
        ? sql`DATE_TRUNC('month', ${accountTransaction.occurredAt})`
        : groupBy === "week"
          ? sql`DATE_TRUNC('week', ${accountTransaction.occurredAt})`
          : sql`DATE_TRUNC('day', ${accountTransaction.occurredAt})`;

    const accountRows = await db
      .select({
        periodDate: sql<string>`${accountDateTrunc}::date`.as("period_date"),
        amount: accountTransaction.amount,
        amountNok: accountTransaction.amountNok,
        currency: accountTransaction.currency,
        type: accountTransaction.type,
      })
      .from(accountTransaction)
      .where(and(...accountConditions))
      .orderBy(asc(sql`${accountDateTrunc}`));

    // 2. Fetch wallet transactions (excluding those linked to account transactions to avoid double-counting)
    const walletConditions: SQL[] = [
      eq(wallet.userId, userId),
      isNull(walletTransaction.linkedAccountTransactionId), // Exclude linked transfers
    ];

    if (startDate) {
      walletConditions.push(gte(walletTransaction.date, startDate));
    }
    if (endDate) {
      walletConditions.push(lte(walletTransaction.date, endDate));
    }

    const walletDateTrunc =
      groupBy === "month"
        ? sql`DATE_TRUNC('month', ${walletTransaction.date})`
        : groupBy === "week"
          ? sql`DATE_TRUNC('week', ${walletTransaction.date})`
          : sql`DATE_TRUNC('day', ${walletTransaction.date})`;

    const walletRows = await db
      .select({
        periodDate: sql<string>`${walletDateTrunc}::date`.as("period_date"),
        amount: walletTransaction.amount,
        currency: walletTransaction.currency,
        type: walletTransaction.type,
      })
      .from(walletTransaction)
      .innerJoin(wallet, eq(walletTransaction.walletId, wallet.id))
      .where(and(...walletConditions))
      .orderBy(asc(sql`${walletDateTrunc}`));

    const totals = new Map<string, number>();

    // Process account transactions
    for (const row of accountRows) {
      // Use pre-computed amountNok if available, otherwise fall back to live conversion
      let amountNok: number;
      if (row.amountNok != null) {
        amountNok = Number.parseFloat(row.amountNok);
      } else {
        // Legacy row without amountNok - convert on the fly
        const amount = row.amount ? Number.parseFloat(row.amount) : 0;
        const currency = row.currency ?? "NOK";
        amountNok = await convertAmountToNok(amount, currency);
      }
      const signedAmount =
        row.type === "withdrawal" ? -amountNok : amountNok;
      const key = String(row.periodDate);

      totals.set(key, (totals.get(key) ?? 0) + signedAmount);
    }

    // Process wallet transactions
    // Wallet transaction types that increase balance: deposit, transfer_from_account, transfer_from_wallet
    // Wallet transaction types that decrease balance: withdrawal, transfer_to_account, transfer_to_wallet, fee
    const walletOutflowTypes = new Set([
      "withdrawal",
      "transfer_to_account",
      "transfer_to_wallet",
      "fee",
    ]);

    for (const row of walletRows) {
      const amount = row.amount ? Number.parseFloat(row.amount) : 0;
      const currency = row.currency ?? "NOK";
      const amountNok = await convertAmountToNok(amount, currency);

      const signedAmount = walletOutflowTypes.has(row.type)
        ? -amountNok
        : amountNok;
      const key = String(row.periodDate);

      totals.set(key, (totals.get(key) ?? 0) + signedAmount);
    }

    const sortedKeys = Array.from(totals.keys()).sort();

    return sortedKeys.map((dateStr) => {
      const date = new Date(dateStr);
      const label =
        groupBy === "month"
          ? date.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
          : groupBy === "week"
            ? `Week of ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
            : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

      return {
        date: dateStr,
        label,
        net: Math.round((totals.get(dateStr) ?? 0) * 100) / 100,
      };
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get balance trends"
    );
  }
}

export async function getPromoById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(promo)
      .where(and(eq(promo.id, id), eq(promo.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to fetch promo");
  }
}

export async function getPromoByType({
  userId,
  type,
}: {
  userId: string;
  type: string;
}) {
  try {
    const normalized = normalizePromoType(type);
    const [row] = await db
      .select()
      .from(promo)
      .where(
        and(eq(promo.userId, userId), eq(promo.typeNormalized, normalized))
      )
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to fetch promo");
  }
}

export async function createPromo({
  userId,
  type,
  minOdds,
  maxStake,
  expiry,
  terms,
}: {
  userId: string;
  type: string;
  minOdds?: number | null;
  maxStake?: number | null;
  expiry?: Date | null;
  terms?: string | null;
}) {
  try {
    const normalizedType = normalizePromoType(type);
    const values: typeof promo.$inferInsert = {
      createdAt: new Date(),
      userId,
      type: type.trim(),
      typeNormalized: normalizedType,
      minOdds:
        minOdds === undefined || minOdds === null ? null : minOdds.toString(),
      maxStake:
        maxStake === undefined || maxStake === null
          ? null
          : maxStake.toString(),
      expiry: expiry ?? null,
      terms: terms ?? null,
    };

    const [row] = await db.insert(promo).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create promo");
  }
}

export async function getOrCreatePromoByType({
  userId,
  type,
}: {
  userId: string;
  type: string;
}) {
  const trimmed = type.trim();
  const safeType = trimmed.length > 0 ? trimmed : "Unspecified";
  const existing = await getPromoByType({ userId, type: safeType });
  if (existing) {
    return existing;
  }
  return createPromo({ userId, type: safeType });
}

export async function listPromosByUser({
  userId,
  limit = 200,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(promo)
      .where(eq(promo.userId, userId))
      .orderBy(desc(promo.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list promos");
  }
}

export async function createAccountTransaction({
  userId,
  accountId,
  type,
  amount,
  currency,
  occurredAt,
  notes,
  linkedWalletTransactionId,
  linkedBackBetId,
  linkedLayBetId,
}: {
  userId: string;
  accountId: string;
  type: "deposit" | "withdrawal" | "bonus" | "adjustment";
  amount: number;
  currency: string;
  occurredAt?: Date | null;
  notes?: string | null;
  linkedWalletTransactionId?: string | null;
  linkedBackBetId?: string | null;
  linkedLayBetId?: string | null;
}) {
  try {
    // Pre-compute NOK equivalent at write time to avoid FX API calls on read
    const normalizedCurrency = currency.toUpperCase();
    const amountNok = await convertAmountToNok(amount, normalizedCurrency);

    const values: typeof accountTransaction.$inferInsert = {
      createdAt: new Date(),
      userId,
      accountId,
      type,
      amount: amount.toString(),
      currency: normalizedCurrency,
      amountNok: amountNok.toString(),
      occurredAt: occurredAt ?? new Date(),
      notes: notes ?? null,
      linkedWalletTransactionId: linkedWalletTransactionId ?? null,
      linkedBackBetId: linkedBackBetId ?? null,
      linkedLayBetId: linkedLayBetId ?? null,
    };

    const [row] = await db
      .insert(accountTransaction)
      .values(values)
      .returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create transaction"
    );
  }
}

export async function listTransactionsByAccount({
  userId,
  accountId,
  limit = 200,
}: {
  userId: string;
  accountId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(accountTransaction)
      .where(
        and(
          eq(accountTransaction.accountId, accountId),
          eq(accountTransaction.userId, userId)
        )
      )
      .orderBy(desc(accountTransaction.occurredAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list transactions"
    );
  }
}

type BetInputBase = {
  market: string;
  selection: string;
  odds: number;
  stake: number;
  exchange: string;
  matchId?: string | null;
  accountId?: string | null;
  currency?: string | null;
  placedAt?: Date | null;
  settledAt?: Date | null;
  profitLoss?: number | null;
  confidence?: Record<string, number> | null;
  error?: string | null;
  status?:
    | "draft"
    | "placed"
    | "matched"
    | "settled"
    | "needs_review"
    | "error";
  /** Normalized selection for Match Odds: HOME_TEAM, AWAY_TEAM, DRAW */
  normalizedSelection?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
};

export async function saveScreenshotUpload({
  userId,
  kind,
  url,
  filename,
  contentType,
  size,
}: {
  userId: string;
  kind: "back" | "lay";
  url: string;
  filename?: string | null;
  contentType?: string | null;
  size?: number | null;
}) {
  try {
    const values: typeof screenshotUpload.$inferInsert = {
      createdAt: new Date(),
      userId,
      kind,
      url,
      filename: filename ?? null,
      contentType: contentType ?? null,
      size: size ? size.toString() : null,
      status: "uploaded",
    };

    const [row] = await db.insert(screenshotUpload).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to persist screenshot metadata"
    );
  }
}

export async function getScreenshotById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(screenshotUpload)
      .where(
        and(eq(screenshotUpload.id, id), eq(screenshotUpload.userId, userId))
      )
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch screenshot"
    );
  }
}

export async function updateScreenshotStatus({
  id,
  status,
  error,
  parsedOutput,
  confidence,
}: {
  id: string;
  status: "uploaded" | "parsed" | "needs_review" | "error";
  error?: string | null;
  parsedOutput?: unknown | null;
  confidence?: Record<string, number> | null;
}) {
  try {
    const values: Partial<typeof screenshotUpload.$inferInsert> = {
      status,
      error: error ?? null,
    };

    if (parsedOutput !== undefined) {
      values.parsedOutput = parsedOutput;
    }

    if (confidence !== undefined) {
      values.confidence = confidence;
    }

    await db
      .update(screenshotUpload)
      .set(values)
      .where(eq(screenshotUpload.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update screenshot status"
    );
  }
}

export async function saveBackBet({
  userId,
  screenshotId,
  ...bet
}: BetInputBase & { userId: string; screenshotId: string }) {
  try {
    const stakeNok = await convertAmountToNok(bet.stake, bet.currency ?? "NOK");
    const profitLossNok =
      bet.profitLoss === undefined || bet.profitLoss === null
        ? null
        : await convertAmountToNok(bet.profitLoss, bet.currency ?? "NOK");

    const values: typeof backBet.$inferInsert = {
      createdAt: new Date(),
      userId,
      accountId: bet.accountId ?? null,
      screenshotId,
      matchId: bet.matchId ?? null,
      market: bet.market,
      selection: bet.selection,
      normalizedSelection: bet.normalizedSelection ?? null,
      odds: bet.odds.toString(),
      stake: bet.stake.toString(),
      stakeNok: stakeNok.toFixed(2),
      exchange: bet.exchange,
      currency: bet.currency ?? null,
      placedAt: bet.placedAt ?? null,
      settledAt: bet.settledAt ?? null,
      profitLoss:
        bet.profitLoss === undefined || bet.profitLoss === null
          ? null
          : bet.profitLoss.toString(),
      profitLossNok: profitLossNok === null ? null : profitLossNok.toFixed(2),
      confidence: bet.confidence ?? null,
      status: bet.status ?? "draft",
      error: bet.error ?? null,
    };

    const [row] = await db.insert(backBet).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save back bet");
  }
}

export async function saveLayBet({
  userId,
  screenshotId,
  ...bet
}: BetInputBase & { userId: string; screenshotId: string }) {
  try {
    const stakeNok = await convertAmountToNok(bet.stake, bet.currency ?? "NOK");
    const profitLossNok =
      bet.profitLoss === undefined || bet.profitLoss === null
        ? null
        : await convertAmountToNok(bet.profitLoss, bet.currency ?? "NOK");

    const values: typeof layBet.$inferInsert = {
      createdAt: new Date(),
      userId,
      accountId: bet.accountId ?? null,
      screenshotId,
      matchId: bet.matchId ?? null,
      market: bet.market,
      selection: bet.selection,
      normalizedSelection: bet.normalizedSelection ?? null,
      odds: bet.odds.toString(),
      stake: bet.stake.toString(),
      stakeNok: stakeNok.toFixed(2),
      exchange: bet.exchange,
      currency: bet.currency ?? null,
      placedAt: bet.placedAt ?? null,
      settledAt: bet.settledAt ?? null,
      profitLoss:
        bet.profitLoss === undefined || bet.profitLoss === null
          ? null
          : bet.profitLoss.toString(),
      profitLossNok: profitLossNok === null ? null : profitLossNok.toFixed(2),
      confidence: bet.confidence ?? null,
      status: bet.status ?? "draft",
      error: bet.error ?? null,
    };

    const [row] = await db.insert(layBet).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save lay bet");
  }
}

/**
 * Get a back bet by ID
 */
export async function getBackBetById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(backBet)
      .where(and(eq(backBet.id, id), eq(backBet.userId, userId)));
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get back bet");
  }
}

/**
 * Get a lay bet by ID
 */
export async function getLayBetById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(layBet)
      .where(and(eq(layBet.id, id), eq(layBet.userId, userId)));
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get lay bet");
  }
}

/**
 * Update a back bet
 */
export async function updateBackBet({
  id,
  userId,
  status,
  settledAt,
  profitLoss,
  profitLossNok,
}: {
  id: string;
  userId: string;
  status?:
    | "draft"
    | "placed"
    | "matched"
    | "settled"
    | "needs_review"
    | "error";
  settledAt?: Date | null;
  profitLoss?: string | null;
  profitLossNok?: string | null;
}) {
  try {
    const updates: Partial<typeof backBet.$inferInsert> = {};
    if (status !== undefined) updates.status = status;
    if (settledAt !== undefined) updates.settledAt = settledAt;
    if (profitLoss !== undefined) updates.profitLoss = profitLoss;
    if (profitLossNok !== undefined) updates.profitLossNok = profitLossNok;

    const [row] = await db
      .update(backBet)
      .set(updates)
      .where(and(eq(backBet.id, id), eq(backBet.userId, userId)))
      .returning();
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update back bet");
  }
}

/**
 * Update editable back bet fields (market, selection, odds, stake, account, currency, placedAt)
 */
export async function updateBackBetDetails({
  id,
  userId,
  market,
  selection,
  odds,
  stake,
  exchange,
  matchId,
  accountId,
  currency,
  placedAt,
}: {
  id: string;
  userId: string;
  market: string;
  selection: string;
  odds: number;
  stake: number;
  exchange: string;
  matchId?: string | null;
  accountId: string | null;
  currency: string | null;
  placedAt: Date | null;
}) {
  try {
    const stakeNok = await convertAmountToNok(stake, currency ?? "NOK");
    const updates: Partial<typeof backBet.$inferInsert> = {
      market,
      selection,
      odds: odds.toString(),
      stake: stake.toString(),
      stakeNok: stakeNok.toFixed(2),
      exchange,
      matchId: matchId ?? null,
      accountId,
      currency,
      placedAt,
    };

    const [row] = await db
      .update(backBet)
      .set(updates)
      .where(and(eq(backBet.id, id), eq(backBet.userId, userId)))
      .returning();
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update back bet details"
    );
  }
}

/**
 * Update a lay bet
 */
export async function updateLayBet({
  id,
  userId,
  status,
  settledAt,
  profitLoss,
  profitLossNok,
}: {
  id: string;
  userId: string;
  status?:
    | "draft"
    | "placed"
    | "matched"
    | "settled"
    | "needs_review"
    | "error";
  settledAt?: Date | null;
  profitLoss?: string | null;
  profitLossNok?: string | null;
}) {
  try {
    const updates: Partial<typeof layBet.$inferInsert> = {};
    if (status !== undefined) updates.status = status;
    if (settledAt !== undefined) updates.settledAt = settledAt;
    if (profitLoss !== undefined) updates.profitLoss = profitLoss;
    if (profitLossNok !== undefined) updates.profitLossNok = profitLossNok;

    const [row] = await db
      .update(layBet)
      .set(updates)
      .where(and(eq(layBet.id, id), eq(layBet.userId, userId)))
      .returning();
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update lay bet");
  }
}

/**
 * Update editable lay bet fields (market, selection, odds, stake, account, currency, placedAt)
 */
export async function updateLayBetDetails({
  id,
  userId,
  market,
  selection,
  odds,
  stake,
  exchange,
  matchId,
  accountId,
  currency,
  placedAt,
}: {
  id: string;
  userId: string;
  market: string;
  selection: string;
  odds: number;
  stake: number;
  exchange: string;
  matchId?: string | null;
  accountId: string | null;
  currency: string | null;
  placedAt: Date | null;
}) {
  try {
    const stakeNok = await convertAmountToNok(stake, currency ?? "NOK");
    const updates: Partial<typeof layBet.$inferInsert> = {
      market,
      selection,
      odds: odds.toString(),
      stake: stake.toString(),
      stakeNok: stakeNok.toFixed(2),
      exchange,
      matchId: matchId ?? null,
      accountId,
      currency,
      placedAt,
    };

    const [row] = await db
      .update(layBet)
      .set(updates)
      .where(and(eq(layBet.id, id), eq(layBet.userId, userId)))
      .returning();
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update lay bet details"
    );
  }
}

export async function createMatchedBetRecord({
  userId,
  backBetId,
  layBetId,
  matchId,
  market,
  selection,
  normalizedSelection,
  promoId,
  promoType,
  status,
  netExposure,
  notes,
  lastError,
}: {
  userId: string;
  backBetId?: string | null;
  layBetId?: string | null;
  matchId?: string | null;
  market: string;
  selection: string;
  /** Normalized selection for Match Odds: HOME_TEAM, AWAY_TEAM, DRAW */
  normalizedSelection?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  promoId?: string | null;
  promoType?: string | null;
  status?: "draft" | "matched" | "settled" | "needs_review";
  netExposure?: number | null;
  notes?: string | null;
  lastError?: string | null;
}) {
  try {
    const values: typeof matchedBet.$inferInsert = {
      createdAt: new Date(),
      userId,
      backBetId: backBetId ?? null,
      layBetId: layBetId ?? null,
      matchId: matchId ?? null,
      market,
      selection,
      normalizedSelection: normalizedSelection ?? null,
      promoId: promoId ?? null,
      promoType: promoType ?? null,
      status: status ?? "draft",
      netExposure:
        netExposure === undefined || netExposure === null
          ? null
          : netExposure.toString(),
      notes: notes ?? null,
      lastError: lastError ?? null,
    };

    const [row] = await db.insert(matchedBet).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create matched bet"
    );
  }
}

export async function listMatchedBetsByUser({
  userId,
  limit = 50,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select({
        id: matchedBet.id,
        market: matchedBet.market,
        selection: matchedBet.selection,
        status: matchedBet.status,
        netExposure: matchedBet.netExposure,
        createdAt: matchedBet.createdAt,
        backBetId: matchedBet.backBetId,
        layBetId: matchedBet.layBetId,
        promoId: matchedBet.promoId,
      })
      .from(matchedBet)
      .where(eq(matchedBet.userId, userId))
      .orderBy(desc(matchedBet.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list matched bets"
    );
  }
}

export type MatchedBetListItem = {
  id: string;
  market: string;
  selection: string;
  status: "draft" | "matched" | "settled" | "needs_review";
  promoType: string | null;
  netExposure: number | null;
  createdAt: Date;
  notes: string | null;
  back: {
    id: string;
    odds: number;
    stake: number;
    exchange: string;
    currency: string | null;
    status:
      | "draft"
      | "placed"
      | "matched"
      | "settled"
      | "needs_review"
      | "error";
    placedAt: Date | null;
    profitLoss: number | null;
    accountId: string | null;
    accountName: string | null;
  } | null;
  lay: {
    id: string;
    odds: number;
    stake: number;
    exchange: string;
    currency: string | null;
    status:
      | "draft"
      | "placed"
      | "matched"
      | "settled"
      | "needs_review"
      | "error";
    placedAt: Date | null;
    profitLoss: number | null;
    accountId: string | null;
    accountName: string | null;
  } | null;
  footballMatch: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    competition: string;
    matchDate: Date;
    status: FootballMatchStatus;
    homeScore: number | null;
    awayScore: number | null;
  } | null;
};

export async function listMatchedBetsForList({
  userId,
  status,
  fromDate,
  toDate,
  search,
  limit = 100,
}: {
  userId: string;
  status?: "draft" | "matched" | "settled" | "needs_review";
  fromDate?: Date;
  toDate?: Date;
  search?: string;
  limit?: number;
}): Promise<MatchedBetListItem[]> {
  try {
    const conditions: SQL<unknown>[] = [eq(matchedBet.userId, userId)];
    const normalizedSearch = search?.trim().toLowerCase();

    if (status) {
      conditions.push(eq(matchedBet.status, status));
    }
    if (fromDate) {
      conditions.push(gte(matchedBet.createdAt, fromDate));
    }
    if (toDate) {
      conditions.push(lte(matchedBet.createdAt, toDate));
    }
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      conditions.push(
        sql`(LOWER(${matchedBet.market}) LIKE ${pattern} OR LOWER(${matchedBet.selection}) LIKE ${pattern})`
      );
    }

    const backAccount = aliasedTable(account, "backAccount");
    const layAccount = aliasedTable(account, "layAccount");

    const rows = await db
      .select({
        id: matchedBet.id,
        market: matchedBet.market,
        selection: matchedBet.selection,
        status: matchedBet.status,
        promoType: matchedBet.promoType,
        netExposure: matchedBet.netExposure,
        createdAt: matchedBet.createdAt,
        notes: matchedBet.notes,
        back: {
          id: backBet.id,
          odds: backBet.odds,
          stake: backBet.stake,
          exchange: backBet.exchange,
          currency: backBet.currency,
          status: backBet.status,
          placedAt: backBet.placedAt,
          profitLoss: backBet.profitLoss,
          accountId: backBet.accountId,
          accountName: backAccount.name,
        },
        lay: {
          id: layBet.id,
          odds: layBet.odds,
          stake: layBet.stake,
          exchange: layBet.exchange,
          currency: layBet.currency,
          status: layBet.status,
          placedAt: layBet.placedAt,
          profitLoss: layBet.profitLoss,
          accountId: layBet.accountId,
          accountName: layAccount.name,
        },
        footballMatch: {
          id: footballMatch.id,
          homeTeam: footballMatch.homeTeam,
          awayTeam: footballMatch.awayTeam,
          competition: footballMatch.competition,
          matchDate: footballMatch.matchDate,
          status: footballMatch.status,
          homeScore: footballMatch.homeScore,
          awayScore: footballMatch.awayScore,
        },
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .leftJoin(backAccount, eq(backBet.accountId, backAccount.id))
      .leftJoin(layAccount, eq(layBet.accountId, layAccount.id))
      .leftJoin(footballMatch, eq(matchedBet.matchId, footballMatch.id))
      .where(and(...conditions))
      .orderBy(desc(matchedBet.createdAt))
      .limit(limit);

    const parseNumber = (value: unknown) =>
      value === null || value === undefined
        ? null
        : Number.parseFloat(value.toString());

    return rows.map((row) => {
      const back =
        row.back?.id !== null && row.back?.id !== undefined
          ? {
              id: row.back.id,
              odds: Number.parseFloat((row.back.odds ?? 0).toString()),
              stake: Number.parseFloat((row.back.stake ?? 0).toString()),
              exchange: row.back.exchange ?? "",
              currency: row.back.currency ?? null,
              status: row.back.status ?? ("draft" as const),
              placedAt: row.back.placedAt ?? null,
              profitLoss: parseNumber(row.back.profitLoss),
              accountId: row.back.accountId ?? null,
              accountName: row.back.accountName ?? null,
            }
          : null;

      const lay =
        row.lay?.id !== null && row.lay?.id !== undefined
          ? {
              id: row.lay.id,
              odds: Number.parseFloat((row.lay.odds ?? 0).toString()),
              stake: Number.parseFloat((row.lay.stake ?? 0).toString()),
              exchange: row.lay.exchange ?? "",
              currency: row.lay.currency ?? null,
              status: row.lay.status ?? ("draft" as const),
              placedAt: row.lay.placedAt ?? null,
              profitLoss: parseNumber(row.lay.profitLoss),
              accountId: row.lay.accountId ?? null,
              accountName: row.lay.accountName ?? null,
            }
          : null;

      const match =
        row.footballMatch?.id !== null && row.footballMatch?.id !== undefined
          ? {
              id: row.footballMatch.id,
              homeTeam: row.footballMatch.homeTeam ?? "",
              awayTeam: row.footballMatch.awayTeam ?? "",
              competition: row.footballMatch.competition ?? "",
              matchDate: row.footballMatch.matchDate ?? new Date(),
              status:
                row.footballMatch.status ??
                ("SCHEDULED" as FootballMatchStatus),
              homeScore:
                row.footballMatch.homeScore === null
                  ? null
                  : Number.parseFloat(row.footballMatch.homeScore.toString()),
              awayScore:
                row.footballMatch.awayScore === null
                  ? null
                  : Number.parseFloat(row.footballMatch.awayScore.toString()),
            }
          : null;

      return {
        id: row.id,
        market: row.market,
        selection: row.selection,
        status: row.status,
        promoType: row.promoType ?? null,
        netExposure: parseNumber(row.netExposure),
        createdAt: row.createdAt,
        notes: row.notes ?? null,
        back,
        lay,
        footballMatch: match,
      };
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list matched bets"
    );
  }
}

export type IndividualBetListItem = {
  id: string;
  kind: "back" | "lay";
  market: string;
  selection: string;
  odds: number;
  stake: number;
  status: "draft" | "placed" | "matched" | "settled" | "needs_review" | "error";
  currency: string | null;
  placedAt: Date | null;
  createdAt: Date;
  settledAt: Date | null;
  profitLoss: number | null;
  exchange: string;
  accountId: string | null;
  accountName: string | null;
  accountKind: "bookmaker" | "exchange" | null;
  /** Exchange commission rate for lay bets (decimal, e.g., 0.05 for 5%) */
  accountCommission: number | null;
  matchedBetId: string | null;
  matchedBetStatus: "draft" | "matched" | "settled" | "needs_review" | null;
};

export async function listAllBetsByUser({
  userId,
  status,
  accountId,
  fromDate,
  toDate,
  search,
  limit = 50,
}: {
  userId: string;
  status?: "placed" | "settled";
  accountId?: string;
  fromDate?: Date;
  toDate?: Date;
  search?: string;
  limit?: number;
}): Promise<IndividualBetListItem[]> {
  try {
    const normalizedSearch = search?.trim().toLowerCase();
    const backConditions: SQL<unknown>[] = [eq(backBet.userId, userId)];
    const layConditions: SQL<unknown>[] = [eq(layBet.userId, userId)];

    if (status) {
      backConditions.push(eq(backBet.status, status));
      layConditions.push(eq(layBet.status, status));
    }
    if (accountId) {
      backConditions.push(eq(backBet.accountId, accountId));
      layConditions.push(eq(layBet.accountId, accountId));
    }
    if (fromDate) {
      const fromDateStr = fromDate.toISOString();
      backConditions.push(
        sql`COALESCE(${backBet.placedAt}, ${backBet.createdAt}) >= ${fromDateStr}::timestamp`
      );
      layConditions.push(
        sql`COALESCE(${layBet.placedAt}, ${layBet.createdAt}) >= ${fromDateStr}::timestamp`
      );
    }
    if (toDate) {
      const toDateStr = toDate.toISOString();
      backConditions.push(
        sql`COALESCE(${backBet.placedAt}, ${backBet.createdAt}) <= ${toDateStr}::timestamp`
      );
      layConditions.push(
        sql`COALESCE(${layBet.placedAt}, ${layBet.createdAt}) <= ${toDateStr}::timestamp`
      );
    }
    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;
      backConditions.push(
        sql`(LOWER(${backBet.market}) LIKE ${pattern} OR LOWER(${backBet.selection}) LIKE ${pattern} OR LOWER(${backBet.exchange}) LIKE ${pattern})`
      );
      layConditions.push(
        sql`(LOWER(${layBet.market}) LIKE ${pattern} OR LOWER(${layBet.selection}) LIKE ${pattern} OR LOWER(${layBet.exchange}) LIKE ${pattern})`
      );
    }

    const [backRows, layRows] = await Promise.all([
      db
        .select({
          id: backBet.id,
          createdAt: backBet.createdAt,
          placedAt: backBet.placedAt,
          settledAt: backBet.settledAt,
          market: backBet.market,
          selection: backBet.selection,
          odds: backBet.odds,
          stake: backBet.stake,
          status: backBet.status,
          currency: backBet.currency,
          profitLoss: backBet.profitLoss,
          exchange: backBet.exchange,
          accountId: backBet.accountId,
          accountName: account.name,
          accountKind: account.kind,
          accountCommission: account.commission,
          matchedBetId: matchedBet.id,
          matchedBetStatus: matchedBet.status,
        })
        .from(backBet)
        .leftJoin(account, eq(backBet.accountId, account.id))
        .leftJoin(matchedBet, eq(matchedBet.backBetId, backBet.id))
        .where(and(...backConditions))
        .orderBy(desc(sql`COALESCE(${backBet.placedAt}, ${backBet.createdAt})`))
        .limit(limit),
      db
        .select({
          id: layBet.id,
          createdAt: layBet.createdAt,
          placedAt: layBet.placedAt,
          settledAt: layBet.settledAt,
          market: layBet.market,
          selection: layBet.selection,
          odds: layBet.odds,
          stake: layBet.stake,
          status: layBet.status,
          currency: layBet.currency,
          profitLoss: layBet.profitLoss,
          exchange: layBet.exchange,
          accountId: layBet.accountId,
          accountName: account.name,
          accountKind: account.kind,
          accountCommission: account.commission,
          matchedBetId: matchedBet.id,
          matchedBetStatus: matchedBet.status,
        })
        .from(layBet)
        .leftJoin(account, eq(layBet.accountId, account.id))
        .leftJoin(matchedBet, eq(matchedBet.layBetId, layBet.id))
        .where(and(...layConditions))
        .orderBy(desc(sql`COALESCE(${layBet.placedAt}, ${layBet.createdAt})`))
        .limit(limit),
    ]);

    const combined: IndividualBetListItem[] = [
      ...backRows.map((row) => ({
        id: row.id,
        kind: "back" as const,
        market: row.market,
        selection: row.selection,
        odds: Number(row.odds),
        stake: Number(row.stake),
        status: row.status,
        currency: row.currency ?? null,
        placedAt: row.placedAt ?? null,
        createdAt: row.createdAt,
        settledAt: row.settledAt ?? null,
        profitLoss:
          row.profitLoss === null ? null : Number.parseFloat(row.profitLoss),
        exchange: row.exchange,
        accountId: row.accountId ?? null,
        accountName: row.accountName ?? null,
        accountKind: row.accountKind ?? null,
        accountCommission: row.accountCommission
          ? Number.parseFloat(row.accountCommission)
          : null,
        matchedBetId: row.matchedBetId ?? null,
        matchedBetStatus: row.matchedBetStatus ?? null,
      })),
      ...layRows.map((row) => ({
        id: row.id,
        kind: "lay" as const,
        market: row.market,
        selection: row.selection,
        odds: Number(row.odds),
        stake: Number(row.stake),
        status: row.status,
        currency: row.currency ?? null,
        placedAt: row.placedAt ?? null,
        createdAt: row.createdAt,
        settledAt: row.settledAt ?? null,
        profitLoss:
          row.profitLoss === null ? null : Number.parseFloat(row.profitLoss),
        exchange: row.exchange,
        accountId: row.accountId ?? null,
        accountName: row.accountName ?? null,
        accountKind: row.accountKind ?? null,
        accountCommission: row.accountCommission
          ? Number.parseFloat(row.accountCommission)
          : null,
        matchedBetId: row.matchedBetId ?? null,
        matchedBetStatus: row.matchedBetStatus ?? null,
      })),
    ];

    combined.sort((a, b) => {
      const dateA = (a.placedAt ?? a.createdAt).getTime();
      const dateB = (b.placedAt ?? b.createdAt).getTime();
      return dateB - dateA;
    });

    return combined.slice(0, limit);
  } catch (error) {
    console.error("[listAllBetsByUser] Database error:", error);
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list individual bets"
    );
  }
}

export async function getMatchedBetById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(matchedBet)
      .where(and(eq(matchedBet.id, id), eq(matchedBet.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch matched bet"
    );
  }
}

export async function getMatchedBetByLegId({
  betId,
  kind,
  userId,
}: {
  betId: string;
  kind: "back" | "lay";
  userId: string;
}) {
  try {
    const foreignKeyColumn =
      kind === "back" ? matchedBet.backBetId : matchedBet.layBetId;
    const [row] = await db
      .select()
      .from(matchedBet)
      .where(and(eq(foreignKeyColumn, betId), eq(matchedBet.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch matched bet by leg"
    );
  }
}

export async function updateMatchedBetRecord({
  id,
  userId,
  status,
  notes,
  netExposure,
  backBetId,
  layBetId,
  matchId,
  promoId,
  promoType,
  lastError,
  confirmedAt,
}: {
  id: string;
  userId: string;
  status?: "draft" | "matched" | "settled" | "needs_review";
  notes?: string | null;
  netExposure?: number | null;
  backBetId?: string | null;
  layBetId?: string | null;
  matchId?: string | null;
  promoId?: string | null;
  promoType?: string | null;
  lastError?: string | null;
  confirmedAt?: Date | null;
}) {
  try {
    const values: Partial<typeof matchedBet.$inferInsert> = {};

    if (status !== undefined) {
      values.status = status;
    }
    if (notes !== undefined) {
      values.notes = notes;
    }
    if (netExposure !== undefined) {
      values.netExposure = netExposure === null ? null : netExposure.toString();
    }
    if (backBetId !== undefined) {
      values.backBetId = backBetId;
    }
    if (layBetId !== undefined) {
      values.layBetId = layBetId;
    }
    if (matchId !== undefined) {
      values.matchId = matchId;
    }
    if (promoId !== undefined) {
      values.promoId = promoId;
    }
    if (promoType !== undefined) {
      values.promoType = promoType;
    }
    if (lastError !== undefined) {
      values.lastError = lastError;
    }
    if (confirmedAt !== undefined) {
      values.confirmedAt = confirmedAt;
    }

    const [row] = await db
      .update(matchedBet)
      .set(values)
      .where(and(eq(matchedBet.id, id), eq(matchedBet.userId, userId)))
      .returning();

    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update matched bet"
    );
  }
}

export async function getMatchedBetWithParts({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    // First get the matched bet with back/lay bets and football match joined
    const [row] = await db
      .select({
        matched: matchedBet,
        back: backBet,
        lay: layBet,
        footballMatch: footballMatch,
        freeBet: freeBet,
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .leftJoin(footballMatch, eq(matchedBet.matchId, footballMatch.id))
      .leftJoin(freeBet, eq(freeBet.usedInMatchedBetId, matchedBet.id))
      .where(eq(matchedBet.id, id));

    if (!row || row.matched.userId !== userId) {
      return null;
    }

    // Fetch screenshots separately using the screenshot IDs from bets
    let backScreenshot = null;
    let layScreenshot = null;

    if (row.back?.screenshotId) {
      const [backSs] = await db
        .select()
        .from(screenshotUpload)
        .where(eq(screenshotUpload.id, row.back.screenshotId))
        .limit(1);
      backScreenshot = backSs ?? null;
    }

    if (row.lay?.screenshotId) {
      const [laySs] = await db
        .select()
        .from(screenshotUpload)
        .where(eq(screenshotUpload.id, row.lay.screenshotId))
        .limit(1);
      layScreenshot = laySs ?? null;
    }

    return {
      matched: row.matched,
      back: row.back,
      lay: row.lay,
      backScreenshot,
      layScreenshot,
      footballMatch: row.footballMatch,
      freeBet: row.freeBet,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch matched bet details"
    );
  }
}

/**
 * Result type for pending settlement query.
 * Includes matched bet info with optional linked football match data.
 */
export type PendingSettlementBet = {
  id: string;
  market: string;
  selection: string;
  status: string;
  netExposure: string | null;
  createdAt: Date;
  promoType: string | null;
  matchId: string | null;
  // Linked football match info (null if bet not linked to match)
  footballMatch: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    competition: string;
    matchDate: Date;
    status: string;
    homeScore: string | null;
    awayScore: string | null;
  } | null;
};

/**
 * Get matched bets awaiting settlement, optionally filtered by match date range.
 * Bets are considered pending settlement when status is 'matched' (not draft, settled, or needs_review).
 *
 * Results include linked football match info for display in the pending settlement queue.
 * Groups bets by match date to streamline the settlement workflow.
 *
 * @param userId - User ID to filter bets
 * @param filter - Optional filter: 'today', 'thisWeek', or 'all' (default: 'all')
 * @param limit - Maximum number of bets to return (default: 50)
 */
export async function getPendingSettlementBets({
  userId,
  filter = "all",
  limit = 50,
}: {
  userId: string;
  filter?: "today" | "thisWeek" | "all";
  limit?: number;
}): Promise<PendingSettlementBet[]> {
  try {
    // Build date filter conditions based on filter type
    const now = new Date();
    const conditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "matched"),
    ];

    if (filter === "today") {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      // Filter by football match date if linked, otherwise by bet creation date
      conditions.push(
        or(
          and(
            isNotNull(matchedBet.matchId),
            gte(footballMatch.matchDate, startOfDay),
            lte(footballMatch.matchDate, endOfDay)
          ),
          and(
            isNull(matchedBet.matchId),
            gte(matchedBet.createdAt, startOfDay),
            lte(matchedBet.createdAt, endOfDay)
          )
        )!
      );
    } else if (filter === "thisWeek") {
      // Start of current week (Monday)
      const startOfWeek = new Date(now);
      const dayOfWeek = startOfWeek.getDay();
      const diff =
        startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);
      // End of week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      conditions.push(
        or(
          and(
            isNotNull(matchedBet.matchId),
            gte(footballMatch.matchDate, startOfWeek),
            lte(footballMatch.matchDate, endOfWeek)
          ),
          and(
            isNull(matchedBet.matchId),
            gte(matchedBet.createdAt, startOfWeek),
            lte(matchedBet.createdAt, endOfWeek)
          )
        )!
      );
    }

    const rows = await db
      .select({
        id: matchedBet.id,
        market: matchedBet.market,
        selection: matchedBet.selection,
        status: matchedBet.status,
        netExposure: matchedBet.netExposure,
        createdAt: matchedBet.createdAt,
        promoType: matchedBet.promoType,
        matchId: matchedBet.matchId,
        footballMatchId: footballMatch.id,
        homeTeam: footballMatch.homeTeam,
        awayTeam: footballMatch.awayTeam,
        competition: footballMatch.competition,
        matchDate: footballMatch.matchDate,
        matchStatus: footballMatch.status,
        homeScore: footballMatch.homeScore,
        awayScore: footballMatch.awayScore,
      })
      .from(matchedBet)
      .leftJoin(footballMatch, eq(matchedBet.matchId, footballMatch.id))
      .where(and(...conditions))
      .orderBy(
        // Order by match date if available, otherwise by bet creation date
        asc(footballMatch.matchDate),
        desc(matchedBet.createdAt)
      )
      .limit(limit);

    // Transform to result type
    return rows.map((row) => ({
      id: row.id,
      market: row.market,
      selection: row.selection,
      status: row.status,
      netExposure: row.netExposure,
      createdAt: row.createdAt,
      promoType: row.promoType,
      matchId: row.matchId,
      footballMatch: row.footballMatchId
        ? {
            id: row.footballMatchId,
            homeTeam: row.homeTeam!,
            awayTeam: row.awayTeam!,
            competition: row.competition!,
            matchDate: row.matchDate!,
            status: row.matchStatus!,
            homeScore: row.homeScore,
            awayScore: row.awayScore,
          }
        : null,
    }));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get pending settlement bets"
    );
  }
}

/**
 * Count matched bets awaiting settlement.
 * Used for dashboard badge display.
 */
export async function countPendingSettlementBets({
  userId,
}: {
  userId: string;
}): Promise<number> {
  try {
    const [result] = await db
      .select({ count: count(matchedBet.id) })
      .from(matchedBet)
      .where(
        and(eq(matchedBet.userId, userId), eq(matchedBet.status, "matched"))
      );
    return result?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count pending settlement bets"
    );
  }
}

/**
 * Result type for bets ready for auto-settlement.
 * Contains matched bet info with the linked football match result.
 */
export type BetReadyForSettlement = {
  id: string;
  userId: string;
  market: string;
  selection: string;
  /** Normalized selection for Match Odds: HOME_TEAM, AWAY_TEAM, DRAW (if available) */
  normalizedSelection: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  status: string;
  promoType: string | null;
  matchId: string;
  // Back bet info
  backBetId: string | null;
  backOdds: string | null;
  backStake: string | null;
  backAccountId: string | null;
  backBetPlacedAt: Date | null;
  // Lay bet info
  layBetId: string | null;
  layOdds: string | null;
  layStake: string | null;
  layAccountId: string | null;
  /** Exchange commission rate as a decimal (e.g., 0.05 for 5%). Null if no exchange account or commission not set. */
  layAccountCommission: number | null;
  // Football match result
  footballMatch: {
    id: string;
    externalId: number;
    homeTeam: string;
    awayTeam: string;
    competition: string;
    matchDate: Date;
    status: string;
    homeScore: number;
    awayScore: number;
  };
};

/**
 * Find matched bets ready for auto-settlement.
 *
 * A bet is ready for auto-settlement when:
 * 1. Status is 'matched' (not already settled, draft, or needs_review)
 * 2. It's linked to a football match (has matchId)
 * 3. The linked match has status 'FINISHED' with scores available
 *
 * Returns bets with all necessary info to determine outcome and calculate P&L.
 *
 * @param limit - Maximum number of bets to return (default: 100)
 */
export async function findBetsReadyForAutoSettlement({
  limit = 100,
}: {
  limit?: number;
} = {}): Promise<BetReadyForSettlement[]> {
  try {
    // Alias for the exchange account to get commission
    const exchangeAccount = aliasedTable(account, "exchangeAccount");

    const rows = await db
      .select({
        id: matchedBet.id,
        userId: matchedBet.userId,
        market: matchedBet.market,
        selection: matchedBet.selection,
        normalizedSelection: matchedBet.normalizedSelection,
        status: matchedBet.status,
        promoType: matchedBet.promoType,
        matchId: matchedBet.matchId,
        // Back bet
        backBetId: backBet.id,
        backOdds: backBet.odds,
        backStake: backBet.stake,
        backAccountId: backBet.accountId,
        backBetPlacedAt: backBet.placedAt,
        // Lay bet
        layBetId: layBet.id,
        layOdds: layBet.odds,
        layStake: layBet.stake,
        layAccountId: layBet.accountId,
        // Exchange account commission
        layAccountCommission: exchangeAccount.commission,
        // Football match
        footballMatchId: footballMatch.id,
        externalId: footballMatch.externalId,
        homeTeam: footballMatch.homeTeam,
        awayTeam: footballMatch.awayTeam,
        competition: footballMatch.competition,
        matchDate: footballMatch.matchDate,
        matchStatus: footballMatch.status,
        homeScore: footballMatch.homeScore,
        awayScore: footballMatch.awayScore,
      })
      .from(matchedBet)
      .innerJoin(footballMatch, eq(matchedBet.matchId, footballMatch.id))
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .leftJoin(exchangeAccount, eq(layBet.accountId, exchangeAccount.id))
      .where(
        and(
          eq(matchedBet.status, "matched"),
          isNotNull(matchedBet.matchId),
          eq(footballMatch.status, "FINISHED"),
          isNotNull(footballMatch.homeScore),
          isNotNull(footballMatch.awayScore)
        )
      )
      .orderBy(asc(footballMatch.matchDate))
      .limit(limit);

    // Transform and filter only valid rows (with scores)
    return rows
      .filter(
        (row) =>
          row.footballMatchId &&
          row.homeScore !== null &&
          row.awayScore !== null
      )
      .map((row) => ({
        id: row.id,
        userId: row.userId,
        market: row.market,
        selection: row.selection,
        normalizedSelection: row.normalizedSelection as
          | "HOME_TEAM"
          | "AWAY_TEAM"
          | "DRAW"
          | null,
        status: row.status,
        promoType: row.promoType,
        matchId: row.matchId!,
        backBetId: row.backBetId,
        backOdds: row.backOdds,
        backStake: row.backStake,
        backAccountId: row.backAccountId,
        backBetPlacedAt: row.backBetPlacedAt,
        layBetId: row.layBetId,
        layOdds: row.layOdds,
        layStake: row.layStake,
        layAccountId: row.layAccountId,
        layAccountCommission: row.layAccountCommission
          ? Number.parseFloat(row.layAccountCommission)
          : null,
        footballMatch: {
          id: row.footballMatchId!,
          externalId: Number.parseInt(row.externalId!, 10),
          homeTeam: row.homeTeam!,
          awayTeam: row.awayTeam!,
          competition: row.competition!,
          matchDate: row.matchDate!,
          status: row.matchStatus!,
          homeScore: Number.parseInt(row.homeScore!, 10),
          awayScore: Number.parseInt(row.awayScore!, 10),
        },
      }));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to find bets ready for auto-settlement"
    );
  }
}

/**
 * Count bets ready for auto-settlement across all users.
 * Used for sync job summary reporting.
 */
export async function countBetsReadyForAutoSettlement(): Promise<number> {
  try {
    const [result] = await db
      .select({ count: count(matchedBet.id) })
      .from(matchedBet)
      .innerJoin(footballMatch, eq(matchedBet.matchId, footballMatch.id))
      .where(
        and(
          eq(matchedBet.status, "matched"),
          isNotNull(matchedBet.matchId),
          eq(footballMatch.status, "FINISHED"),
          isNotNull(footballMatch.homeScore),
          isNotNull(footballMatch.awayScore)
        )
      );
    return result?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count bets ready for auto-settlement"
    );
  }
}

/**
 * Parameters for applying auto-settlement to a bet.
 */
export interface ApplyAutoSettlementParams {
  /** The matched bet ID */
  matchedBetId: string;
  /** User ID who owns the bet */
  userId: string;
  /** The determined outcome (win/loss/push) */
  outcome: "win" | "loss" | "push";
  /** Calculated profit/loss for back bet */
  backProfitLoss: number;
  /** Calculated profit/loss for lay bet */
  layProfitLoss: number;
  /** ID of the back bet (if exists) */
  backBetId: string | null;
  /** ID of the lay bet (if exists) */
  layBetId: string | null;
  /** Account ID for back bet (for balance adjustment) */
  backAccountId: string | null;
  /** Account ID for lay bet (for balance adjustment) */
  layAccountId: string | null;
  /** Currency for back bet */
  backCurrency: string | null;
  /** Currency for lay bet */
  layCurrency: string | null;
  /** Market description for audit/transaction notes */
  market: string;
  /** Selection description for audit/transaction notes */
  selection: string;
  /** Match result description for audit notes */
  matchResult: string;
}

/**
 * Result of auto-settlement application.
 */
export interface ApplyAutoSettlementResult {
  success: boolean;
  matchedBetId: string;
  transactionsCreated: number;
}

/**
 * Apply auto-settlement to a single matched bet.
 *
 * Updates the matched bet and individual legs to 'settled' status,
 * sets profitLoss and settledAt, and creates account balance adjustment transactions.
 *
 * @param params - Settlement parameters including bet IDs, P&L, and account info
 * @returns Result indicating success and number of transactions created
 */
export async function applyAutoSettlement(
  params: ApplyAutoSettlementParams
): Promise<ApplyAutoSettlementResult> {
  const now = new Date();
  let transactionsCreated = 0;

  try {
    const backProfitLossNok = await convertAmountToNok(
      params.backProfitLoss,
      params.backCurrency ?? "NOK"
    );
    const layProfitLossNok = await convertAmountToNok(
      params.layProfitLoss,
      params.layCurrency ?? "NOK"
    );

    // 1. Update matched bet status to settled
    await db
      .update(matchedBet)
      .set({ status: "settled" })
      .where(
        and(
          eq(matchedBet.id, params.matchedBetId),
          eq(matchedBet.userId, params.userId)
        )
      );

    // 2. Update back bet if exists
    if (params.backBetId) {
      await db
        .update(backBet)
        .set({
          status: "settled",
          profitLoss: params.backProfitLoss.toFixed(2),
          profitLossNok: backProfitLossNok.toFixed(2),
          settledAt: now,
        })
        .where(eq(backBet.id, params.backBetId));

      // Create account adjustment transaction for back bet
      if (params.backAccountId && params.backProfitLoss !== 0) {
        await db.insert(accountTransaction).values({
          createdAt: now,
          userId: params.userId,
          accountId: params.backAccountId,
          type: "adjustment",
          amount: params.backProfitLoss.toFixed(2),
          currency: params.backCurrency ?? "NOK",
          occurredAt: now,
          notes: `Auto-settlement: ${params.market} - ${params.selection} (${params.matchResult})`,
          linkedBackBetId: params.backBetId,
        });
        transactionsCreated++;
      }
    }

    // 3. Update lay bet if exists
    if (params.layBetId) {
      await db
        .update(layBet)
        .set({
          status: "settled",
          profitLoss: params.layProfitLoss.toFixed(2),
          profitLossNok: layProfitLossNok.toFixed(2),
          settledAt: now,
        })
        .where(eq(layBet.id, params.layBetId));

      // Create account adjustment transaction for lay bet
      if (params.layAccountId && params.layProfitLoss !== 0) {
        await db.insert(accountTransaction).values({
          createdAt: now,
          userId: params.userId,
          accountId: params.layAccountId,
          type: "adjustment",
          amount: params.layProfitLoss.toFixed(2),
          currency: params.layCurrency ?? "NOK",
          occurredAt: now,
          notes: `Auto-settlement: ${params.market} - ${params.selection} (${params.matchResult})`,
          linkedLayBetId: params.layBetId,
        });
        transactionsCreated++;
      }
    }

    // 4. Create audit entry
    await db.insert(auditLog).values({
      createdAt: now,
      userId: params.userId,
      entityType: "matched_bet",
      entityId: params.matchedBetId,
      action: "auto_settle_applied",
      changes: {
        outcome: params.outcome,
        backProfitLoss: params.backProfitLoss,
        layProfitLoss: params.layProfitLoss,
        matchResult: params.matchResult,
      },
      notes: `Auto-settled: ${params.outcome} on ${params.market} - ${params.selection}`,
    });

    return {
      success: true,
      matchedBetId: params.matchedBetId,
      transactionsCreated,
    };
  } catch (error) {
    console.error(
      `[applyAutoSettlement] Failed for bet ${params.matchedBetId}:`,
      error
    );
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to apply auto-settlement for bet ${params.matchedBetId}`
    );
  }
}

/**
 * Flag a bet for review instead of auto-settling.
 * Used when outcome confidence is too low for automatic settlement.
 *
 * @param matchedBetId - The matched bet ID
 * @param userId - User ID who owns the bet
 * @param reason - Explanation of why the bet needs review
 */
export async function flagBetForReview({
  matchedBetId,
  userId,
  reason,
}: {
  matchedBetId: string;
  userId: string;
  reason: string;
}): Promise<void> {
  const now = new Date();

  try {
    // Update status to needs_review and add note
    await db
      .update(matchedBet)
      .set({
        status: "needs_review",
        notes: sql`COALESCE(${matchedBet.notes} || E'\n\n', '') || ${`[Auto-settlement] ${reason}`}`,
      })
      .where(
        and(eq(matchedBet.id, matchedBetId), eq(matchedBet.userId, userId))
      );

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: now,
      userId,
      entityType: "matched_bet",
      entityId: matchedBetId,
      action: "auto_settle_detected",
      changes: { flaggedForReview: true, reason },
      notes: `Flagged for review: ${reason}`,
    });
  } catch (error) {
    console.error(`[flagBetForReview] Failed for bet ${matchedBetId}:`, error);
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to flag bet ${matchedBetId} for review`
    );
  }
}

// Audit log type definitions
export type AuditEntityType =
  | "back_bet"
  | "lay_bet"
  | "matched_bet"
  | "account"
  | "screenshot";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "reconcile"
  | "attach_leg"
  | "auto_settle_detected"
  | "auto_settle_applied"
  | "manual_settle";

export async function createAuditEntry({
  userId,
  entityType,
  entityId,
  action,
  changes,
  notes,
}: {
  userId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  changes?: Record<string, unknown> | null;
  notes?: string | null;
}) {
  try {
    const values: typeof auditLog.$inferInsert = {
      createdAt: new Date(),
      userId,
      entityType,
      entityId,
      action,
      changes: changes ?? null,
      notes: notes ?? null,
    };

    const [row] = await db.insert(auditLog).values(values).returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create audit entry"
    );
  }
}

export async function listAuditEntriesByEntity({
  entityType,
  entityId,
  limit = 100,
}: {
  entityType: AuditEntityType;
  entityId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, entityType),
          eq(auditLog.entityId, entityId)
        )
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list audit entries"
    );
  }
}

export async function listAuditEntriesByUser({
  userId,
  limit = 100,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, userId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list audit entries by user"
    );
  }
}

// Reconciliation queue: list matched bets by status filter
type MatchedBetStatus = "draft" | "matched" | "settled" | "needs_review";

export async function listMatchedBetsByStatus({
  userId,
  statuses,
  limit = 100,
}: {
  userId: string;
  statuses: MatchedBetStatus[];
  limit?: number;
}) {
  try {
    return await db
      .select({
        id: matchedBet.id,
        market: matchedBet.market,
        selection: matchedBet.selection,
        status: matchedBet.status,
        netExposure: matchedBet.netExposure,
        createdAt: matchedBet.createdAt,
        backBetId: matchedBet.backBetId,
        layBetId: matchedBet.layBetId,
        promoId: matchedBet.promoId,
        promoType: matchedBet.promoType,
        notes: matchedBet.notes,
        lastError: matchedBet.lastError,
      })
      .from(matchedBet)
      .where(
        and(eq(matchedBet.userId, userId), inArray(matchedBet.status, statuses))
      )
      .orderBy(desc(matchedBet.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list matched bets by status"
    );
  }
}

// Count matched bets by status (for queue badges)
export async function countMatchedBetsByStatus({
  userId,
  statuses,
}: {
  userId: string;
  statuses: MatchedBetStatus[];
}) {
  try {
    const [result] = await db
      .select({ count: count(matchedBet.id) })
      .from(matchedBet)
      .where(
        and(eq(matchedBet.userId, userId), inArray(matchedBet.status, statuses))
      );
    return result?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count matched bets by status"
    );
  }
}

// ============================================================================
// REPORTING QUERIES
// ============================================================================

export type ReportingDateRange = {
  startDate: Date;
  endDate: Date;
};

/**
 * Get all settled matched bets with their back/lay legs for reporting.
 * Includes all data needed for profit, ROI, and qualifying loss calculations.
 */
export async function getSettledMatchedBetsForReporting({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  try {
    const conditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "settled"),
    ];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }

    const rows = await db
      .select({
        matched: matchedBet,
        back: backBet,
        lay: layBet,
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .where(and(...conditions))
      .orderBy(desc(matchedBet.createdAt));

    return rows;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get settled matched bets for reporting"
    );
  }
}

/**
 * Get all matched bets (any status) for exposure and activity reporting.
 */
export async function getMatchedBetsForReporting({
  userId,
  startDate,
  endDate,
  statuses,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
  statuses?: MatchedBetStatus[];
}) {
  try {
    const conditions: SQL<unknown>[] = [eq(matchedBet.userId, userId)];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }
    if (statuses && statuses.length > 0) {
      conditions.push(inArray(matchedBet.status, statuses));
    }

    const rows = await db
      .select({
        matched: matchedBet,
        back: backBet,
        lay: layBet,
        backAccount: account,
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .leftJoin(account, eq(backBet.accountId, account.id))
      .where(and(...conditions))
      .orderBy(desc(matchedBet.createdAt));

    return rows;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get matched bets for reporting"
    );
  }
}

/**
 * Get aggregate statistics for matched bets in a date range.
 * Returns counts by status and total net exposure.
 */
export async function getMatchedBetAggregates({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  try {
    const conditions: SQL<unknown>[] = [eq(matchedBet.userId, userId)];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }

    const [result] = await db
      .select({
        totalCount: count(matchedBet.id),
        totalNetExposure: sum(matchedBet.netExposure),
      })
      .from(matchedBet)
      .where(and(...conditions));

    // Get counts by status
    const statusCounts = await db
      .select({
        status: matchedBet.status,
        count: count(matchedBet.id),
      })
      .from(matchedBet)
      .where(and(...conditions))
      .groupBy(matchedBet.status);

    return {
      totalCount: result?.totalCount ?? 0,
      totalNetExposure: result?.totalNetExposure
        ? Number.parseFloat(result.totalNetExposure)
        : 0,
      statusCounts: statusCounts.reduce(
        (acc, row) => {
          acc[row.status] = row.count;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get matched bet aggregates"
    );
  }
}

/**
 * Get profit/loss aggregates by promo type.
 */
export async function getProfitByPromoType({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  try {
    const conditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "settled"),
    ];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }

    // Sum profitLoss from back and lay bets grouped by promo type (using NOK-converted values)
    const rows = await db
      .select({
        promoType: matchedBet.promoType,
        count: count(matchedBet.id),
        totalBackProfitLossNok: sum(backBet.profitLossNok),
        totalLayProfitLossNok: sum(layBet.profitLossNok),
        totalBackStakeNok: sum(backBet.stakeNok),
        totalLayStakeNok: sum(layBet.stakeNok),
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .where(and(...conditions))
      .groupBy(matchedBet.promoType);

    return rows.map((row) => ({
      promoType: row.promoType ?? "Unspecified",
      count: row.count,
      totalProfitLoss:
        (row.totalBackProfitLossNok
          ? Number.parseFloat(row.totalBackProfitLossNok)
          : 0) +
        (row.totalLayProfitLossNok
          ? Number.parseFloat(row.totalLayProfitLossNok)
          : 0),
      totalStake:
        (row.totalBackStakeNok ? Number.parseFloat(row.totalBackStakeNok) : 0) +
        (row.totalLayStakeNok ? Number.parseFloat(row.totalLayStakeNok) : 0),
    }));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get profit by promo type"
    );
  }
}

/**
 * Get matched set profit/loss aggregates by bookmaker.
 * This calculates the FULL matched bet profit (back P/L + lay P/L) per bookmaker,
 * which is the correct way to evaluate bookmaker performance in matched betting.
 *
 * In matched betting, you always win one leg and lose the other, so showing
 * only the back bet P/L is misleading. The real profit is the net of both legs.
 */
export async function getProfitByBookmaker({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  try {
    const conditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "settled"),
    ];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }

    // Fetch individual matched bets with both legs for proper P/L calculation
    const rows = await db
      .select({
        accountId: backBet.accountId,
        accountName: account.name,
        // Back bet values
        backProfitLoss: backBet.profitLoss,
        backProfitLossNok: backBet.profitLossNok,
        backStake: backBet.stake,
        backStakeNok: backBet.stakeNok,
        backCurrency: backBet.currency,
        // Lay bet values (the other leg of the matched bet)
        layProfitLoss: layBet.profitLoss,
        layProfitLossNok: layBet.profitLossNok,
        layStake: layBet.stake,
        layStakeNok: layBet.stakeNok,
        layCurrency: layBet.currency,
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .leftJoin(account, eq(backBet.accountId, account.id))
      .where(and(...conditions));

    // Aggregate matched set profit by bookmaker
    const accountMap = new Map<
      string,
      {
        accountId: string;
        accountName: string;
        count: number;
        totalProfitLoss: number;
        totalStake: number;
      }
    >();

    for (const row of rows) {
      if (!row.accountId) continue;

      const existing = accountMap.get(row.accountId) ?? {
        accountId: row.accountId,
        accountName: row.accountName ?? "Unknown Bookmaker",
        count: 0,
        totalProfitLoss: 0,
        totalStake: 0,
      };

      // Calculate matched set P/L (back + lay combined) using NOK values
      const backPLNok = row.backProfitLossNok
        ? Number.parseFloat(row.backProfitLossNok)
        : row.backCurrency === "NOK" && row.backProfitLoss
          ? Number.parseFloat(row.backProfitLoss)
          : 0;
      const layPLNok = row.layProfitLossNok
        ? Number.parseFloat(row.layProfitLossNok)
        : row.layCurrency === "NOK" && row.layProfitLoss
          ? Number.parseFloat(row.layProfitLoss)
          : 0;

      // Back stake for ROI
      const stakeNok = row.backStakeNok
        ? Number.parseFloat(row.backStakeNok)
        : row.backCurrency === "NOK" && row.backStake
          ? Number.parseFloat(row.backStake)
          : 0;

      existing.count += 1;
      existing.totalProfitLoss += backPLNok + layPLNok; // Full matched set profit
      existing.totalStake += stakeNok;

      accountMap.set(row.accountId, existing);
    }

    return Array.from(accountMap.values());
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get profit by bookmaker"
    );
  }
}

/**
 * Get matched set profit/loss aggregates by exchange.
 * This calculates the FULL matched bet profit (back P/L + lay P/L) per exchange,
 * which shows which exchange you've used for your most profitable matched sets.
 *
 * Note: This is the same matched set profit as by bookmaker, just grouped by
 * the exchange account instead. Useful for comparing commission impact.
 */
export async function getProfitByExchange({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  try {
    const conditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "settled"),
    ];

    if (startDate) {
      conditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(matchedBet.createdAt, endDate));
    }

    // Alias for lay account
    const layAccount = account;

    // Fetch individual matched bets with both legs
    const rows = await db
      .select({
        accountId: layBet.accountId,
        accountName: layAccount.name,
        // Back bet values
        backProfitLoss: backBet.profitLoss,
        backProfitLossNok: backBet.profitLossNok,
        backCurrency: backBet.currency,
        // Lay bet values
        layProfitLoss: layBet.profitLoss,
        layProfitLossNok: layBet.profitLossNok,
        layStake: layBet.stake,
        layStakeNok: layBet.stakeNok,
        layCurrency: layBet.currency,
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .leftJoin(layAccount, eq(layBet.accountId, layAccount.id))
      .where(and(...conditions));

    // Aggregate matched set profit by exchange
    const accountMap = new Map<
      string,
      {
        accountId: string;
        accountName: string;
        count: number;
        totalProfitLoss: number;
        totalStake: number;
      }
    >();

    for (const row of rows) {
      if (!row.accountId) continue;

      const existing = accountMap.get(row.accountId) ?? {
        accountId: row.accountId,
        accountName: row.accountName ?? "Unknown Exchange",
        count: 0,
        totalProfitLoss: 0,
        totalStake: 0,
      };

      // Calculate matched set P/L (back + lay combined) using NOK values
      const backPLNok = row.backProfitLossNok
        ? Number.parseFloat(row.backProfitLossNok)
        : row.backCurrency === "NOK" && row.backProfitLoss
          ? Number.parseFloat(row.backProfitLoss)
          : 0;
      const layPLNok = row.layProfitLossNok
        ? Number.parseFloat(row.layProfitLossNok)
        : row.layCurrency === "NOK" && row.layProfitLoss
          ? Number.parseFloat(row.layProfitLoss)
          : 0;

      // Lay stake for this exchange
      const stakeNok = row.layStakeNok
        ? Number.parseFloat(row.layStakeNok)
        : row.layCurrency === "NOK" && row.layStake
          ? Number.parseFloat(row.layStake)
          : 0;

      existing.count += 1;
      existing.totalProfitLoss += backPLNok + layPLNok; // Full matched set profit
      existing.totalStake += stakeNok;

      accountMap.set(row.accountId, existing);
    }

    return Array.from(accountMap.values());
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get profit by exchange"
    );
  }
}

export type BookmakerProfitWithBonuses = {
  accountId: string;
  accountName: string;
  /** Number of settled matched bets */
  betCount: number;
  /** Net profit/loss from matched sets (back P/L + lay P/L combined) */
  bettingProfit: number;
  /** Total back stake wagered */
  totalStake: number;
  /** Total bonus/reward transaction amounts */
  bonusTotal: number;
  /** Combined total (bettingProfit + bonusTotal) */
  totalProfit: number;
  /** ROI percentage based on total profit and stake */
  roi: number;
};

/**
 * Get bookmaker profit/loss including bonus/reward transactions.
 * Combines FULL matched bet profit (back + lay P/L) with bonus transactions.
 * This shows which bookmaker offers the best overall value when accounting
 * for both the matched betting results and their bonus programs.
 * All amounts are converted to NOK for consistent aggregation.
 */
export async function getBookmakerProfitWithBonuses({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}): Promise<BookmakerProfitWithBonuses[]> {
  try {
    // Get matched set profit per bookmaker (back + lay P/L combined)
    const bettingConditions: SQL<unknown>[] = [
      eq(matchedBet.userId, userId),
      eq(matchedBet.status, "settled"),
    ];

    if (startDate) {
      bettingConditions.push(gte(matchedBet.createdAt, startDate));
    }
    if (endDate) {
      bettingConditions.push(lte(matchedBet.createdAt, endDate));
    }

    // Fetch individual matched bets with BOTH legs for full P/L calculation
    const bettingRows = await db
      .select({
        accountId: backBet.accountId,
        accountName: account.name,
        // Back bet
        backProfitLoss: backBet.profitLoss,
        backProfitLossNok: backBet.profitLossNok,
        backStake: backBet.stake,
        backStakeNok: backBet.stakeNok,
        backCurrency: backBet.currency,
        // Lay bet (the other leg)
        layProfitLoss: layBet.profitLoss,
        layProfitLossNok: layBet.profitLossNok,
        layStake: layBet.stake,
        layStakeNok: layBet.stakeNok,
        layCurrency: layBet.currency,
      })
      .from(matchedBet)
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
      .leftJoin(account, eq(backBet.accountId, account.id))
      .where(and(...bettingConditions));

    // Get bonus transactions per bookmaker account (with currency)
    const bonusConditions: SQL<unknown>[] = [
      eq(accountTransaction.userId, userId),
      eq(accountTransaction.type, "bonus"),
      eq(account.kind, "bookmaker"),
    ];

    if (startDate) {
      bonusConditions.push(gte(accountTransaction.occurredAt, startDate));
    }
    if (endDate) {
      bonusConditions.push(lte(accountTransaction.occurredAt, endDate));
    }

    const bonusRows = await db
      .select({
        accountId: accountTransaction.accountId,
        accountName: account.name,
        amount: accountTransaction.amount,
        amountNok: accountTransaction.amountNok,
        currency: account.currency,
      })
      .from(accountTransaction)
      .innerJoin(account, eq(accountTransaction.accountId, account.id))
      .where(and(...bonusConditions));

    // Combine betting and bonus data with FX conversion
    const accountMap = new Map<
      string,
      {
        accountId: string;
        accountName: string;
        betCount: number;
        bettingProfit: number;
        totalStake: number;
        bonusTotal: number;
      }
    >();

    // Process betting data - calculate FULL matched set P/L (back + lay)
    for (const row of bettingRows) {
      if (row.accountId) {
        const existing = accountMap.get(row.accountId) ?? {
          accountId: row.accountId,
          accountName: row.accountName ?? "Unknown Bookmaker",
          betCount: 0,
          bettingProfit: 0,
          totalStake: 0,
          bonusTotal: 0,
        };

        // Back bet P/L
        const backCurrency = row.backCurrency ?? "NOK";
        const backPLNok = row.backProfitLossNok
          ? Number.parseFloat(row.backProfitLossNok)
          : backCurrency === "NOK" && row.backProfitLoss
            ? Number.parseFloat(row.backProfitLoss)
            : 0;

        // Lay bet P/L (the other leg of the matched bet)
        const layCurrency = row.layCurrency ?? "NOK";
        const layPLNok = row.layProfitLossNok
          ? Number.parseFloat(row.layProfitLossNok)
          : layCurrency === "NOK" && row.layProfitLoss
            ? Number.parseFloat(row.layProfitLoss)
            : 0;

        // Back stake for ROI
        const stakeNok = row.backStakeNok
          ? Number.parseFloat(row.backStakeNok)
          : backCurrency === "NOK" && row.backStake
            ? Number.parseFloat(row.backStake)
            : 0;

        existing.betCount += 1;
        existing.bettingProfit += backPLNok + layPLNok; // FULL matched set profit
        existing.totalStake += stakeNok;

        accountMap.set(row.accountId, existing);
      }
    }

    // Process bonus data using pre-computed amountNok (with fallback for legacy rows)
    for (const row of bonusRows) {
      const existing = accountMap.get(row.accountId);
      let amountNok: number;
      if (row.amountNok != null) {
        amountNok = Number.parseFloat(row.amountNok);
      } else {
        // Legacy row without amountNok - convert on the fly
        const amount = row.amount ? Number.parseFloat(row.amount) : 0;
        const currency = row.currency ?? "NOK";
        amountNok = await convertAmountToNok(amount, currency);
      }

      if (existing) {
        existing.bonusTotal += amountNok;
      } else {
        // Account has bonuses but no betting activity
        accountMap.set(row.accountId, {
          accountId: row.accountId,
          accountName: row.accountName ?? "Unknown Bookmaker",
          betCount: 0,
          bettingProfit: 0,
          totalStake: 0,
          bonusTotal: amountNok,
        });
      }
    }

    // Calculate totals and ROI
    const results: BookmakerProfitWithBonuses[] = [];
    for (const data of accountMap.values()) {
      const totalProfit =
        Math.round((data.bettingProfit + data.bonusTotal) * 100) / 100;
      const roi =
        data.totalStake > 0 ? (totalProfit / data.totalStake) * 100 : 0;
      results.push({
        accountId: data.accountId,
        accountName: data.accountName,
        betCount: data.betCount,
        bettingProfit: Math.round(data.bettingProfit * 100) / 100,
        totalStake: Math.round(data.totalStake * 100) / 100,
        bonusTotal: Math.round(data.bonusTotal * 100) / 100,
        totalProfit,
        roi: Math.round(roi * 100) / 100,
      });
    }

    // Sort by total profit descending
    results.sort((a, b) => b.totalProfit - a.totalProfit);

    return results;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get bookmaker profit with bonuses"
    );
  }
}

/**
 * Get total bonus/reward transactions for a user within a date range.
 * Used to include bonuses in the overall reporting summary alongside betting profit.
 * All amounts are converted to NOK for consistent aggregation.
 */
export async function getTotalBonusesForUser({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}): Promise<number> {
  try {
    const conditions: SQL<unknown>[] = [
      eq(accountTransaction.userId, userId),
      eq(accountTransaction.type, "bonus"),
    ];

    if (startDate) {
      conditions.push(gte(accountTransaction.occurredAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(accountTransaction.occurredAt, endDate));
    }

    // Fetch individual transactions with pre-computed amountNok
    const transactions = await db
      .select({
        amount: accountTransaction.amount,
        amountNok: accountTransaction.amountNok,
        currency: account.currency,
      })
      .from(accountTransaction)
      .innerJoin(account, eq(accountTransaction.accountId, account.id))
      .where(and(...conditions));

    // Sum using pre-computed amountNok (with fallback for legacy rows)
    let total = 0;
    for (const tx of transactions) {
      if (tx.amountNok != null) {
        total += Number.parseFloat(tx.amountNok);
      } else {
        // Legacy row without amountNok - convert on the fly
        const amount = tx.amount ? Number.parseFloat(tx.amount) : 0;
        const currency = tx.currency ?? "NOK";
        const amountNok = await convertAmountToNok(amount, currency);
        total += amountNok;
      }
    }

    return Math.round(total * 100) / 100;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get total bonuses for user"
    );
  }
}

/**
 * Get total open exposure (non-settled matched bets).
 */
export async function getOpenExposure({ userId }: { userId: string }) {
  try {
    const [result] = await db
      .select({
        totalExposure: sum(matchedBet.netExposure),
        count: count(matchedBet.id),
      })
      .from(matchedBet)
      .where(
        and(
          eq(matchedBet.userId, userId),
          inArray(matchedBet.status, ["draft", "matched", "needs_review"])
        )
      );

    return {
      totalExposure: result?.totalExposure
        ? Number.parseFloat(result.totalExposure)
        : 0,
      count: result?.count ?? 0,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get open exposure"
    );
  }
}

/**
 * Exposure data point for timeline visualization.
 */
export type ExposureDataPoint = {
  /** Date string in ISO format */
  date: string;
  /** Display label for the date */
  label: string;
  /** Total open exposure at end of this period */
  exposure: number;
  /** Number of open positions at end of this period */
  openPositions: number;
  /** Change in exposure during this period */
  change: number;
};

/**
 * Get exposure timeline data for chart visualization.
 * Returns exposure levels over time based on matched bet creation and settlement dates.
 *
 * Algorithm:
 * 1. Get all matched bets with exposure
 * 2. Create events for bet creation (adds exposure) and settlement (removes exposure)
 * 3. Process events chronologically to compute running exposure
 * 4. Group by day to create data points
 */
export async function getExposureTimeline({
  userId,
  daysBack = 30,
}: {
  userId: string;
  daysBack?: number;
}): Promise<ExposureDataPoint[]> {
  try {
    // Get all matched bets that have netExposure
    const bets = await db
      .select({
        id: matchedBet.id,
        createdAt: matchedBet.createdAt,
        status: matchedBet.status,
        netExposure: matchedBet.netExposure,
        confirmedAt: matchedBet.confirmedAt,
      })
      .from(matchedBet)
      .where(
        and(eq(matchedBet.userId, userId), isNotNull(matchedBet.netExposure))
      )
      .orderBy(matchedBet.createdAt);

    if (bets.length === 0) {
      return [];
    }

    // Create exposure events: each bet creates exposure when created
    // and removes exposure when settled
    type ExposureEvent = {
      date: Date;
      exposureChange: number;
      type: "add" | "remove";
    };

    const events: ExposureEvent[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setHours(0, 0, 0, 0);

    for (const bet of bets) {
      const exposure = bet.netExposure ? Number.parseFloat(bet.netExposure) : 0;

      if (exposure === 0) continue;

      // Add event when bet was created
      const createdDate = new Date(bet.createdAt);
      events.push({
        date: createdDate,
        exposureChange: exposure,
        type: "add",
      });

      // Add event when bet was settled (removes exposure)
      if (bet.status === "settled" && bet.confirmedAt) {
        const settledDate = new Date(bet.confirmedAt);
        events.push({
          date: settledDate,
          exposureChange: -exposure,
          type: "remove",
        });
      }
    }

    // Sort events by date
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate running exposure by day
    const dailyExposure = new Map<
      string,
      { exposure: number; change: number; openPositions: number }
    >();
    let runningExposure = 0;
    let openPositions = 0;

    // Process all events to build up the exposure state
    for (const event of events) {
      const dayKey = event.date.toISOString().split("T")[0];

      runningExposure += event.exposureChange;
      if (event.type === "add") {
        openPositions += 1;
      } else {
        openPositions -= 1;
      }

      const existing = dailyExposure.get(dayKey) ?? {
        exposure: 0,
        change: 0,
        openPositions: 0,
      };
      existing.exposure = runningExposure;
      existing.change += event.exposureChange;
      existing.openPositions = openPositions;
      dailyExposure.set(dayKey, existing);
    }

    // Generate data points for the date range
    const result: ExposureDataPoint[] = [];
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Get all days in range
    const allDays: string[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= today) {
      allDays.push(currentDate.toISOString().split("T")[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Fill in the data points, carrying forward exposure from previous days
    let lastExposure = 0;
    let lastOpenPositions = 0;

    // First, find the exposure state at the start date
    for (const event of events) {
      if (event.date < startDate) {
        lastExposure += event.exposureChange;
        if (event.type === "add") {
          lastOpenPositions += 1;
        } else {
          lastOpenPositions -= 1;
        }
      }
    }

    for (const day of allDays) {
      const dayData = dailyExposure.get(day);
      const date = new Date(day);

      if (dayData) {
        result.push({
          date: day,
          label: date.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          }),
          exposure: Math.round(dayData.exposure * 100) / 100,
          openPositions: dayData.openPositions,
          change: Math.round(dayData.change * 100) / 100,
        });
        lastExposure = dayData.exposure;
        lastOpenPositions = dayData.openPositions;
      } else {
        // Carry forward the previous day's exposure
        result.push({
          date: day,
          label: date.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          }),
          exposure: Math.round(lastExposure * 100) / 100,
          openPositions: lastOpenPositions,
          change: 0,
        });
      }
    }

    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get exposure timeline"
    );
  }
}

/**
 * Exposure grouped by event (football match).
 * Provides per-event exposure breakdown for users with multiple bets on same match.
 */
export type ExposureByEvent = {
  /** Match ID (null for bets not linked to a match) */
  matchId: string | null;
  /** Match info if linked */
  match: {
    homeTeam: string;
    awayTeam: string;
    competition: string;
    matchDate: Date;
    status: FootballMatchStatus;
  } | null;
  /** Total exposure for this event */
  totalExposure: number;
  /** Number of bets on this event */
  betCount: number;
  /** List of bet IDs for this event */
  betIds: string[];
  /** Promo types used for bets on this event */
  promoTypes: string[];
};

/**
 * Get open exposure grouped by football match/event.
 * Returns exposure breakdown per event for users with multiple bets on same match.
 *
 * Why: Users may have multiple bets on the same match (e.g., Match Odds + Over 2.5)
 * and need to see their total exposure to that single event for risk management.
 */
export async function getExposureByEvent({
  userId,
}: {
  userId: string;
}): Promise<ExposureByEvent[]> {
  try {
    // Get all open matched bets with their exposure and match info
    const openBets = await db
      .select({
        betId: matchedBet.id,
        matchId: matchedBet.matchId,
        netExposure: matchedBet.netExposure,
        promoType: matchedBet.promoType,
        homeTeam: footballMatch.homeTeam,
        awayTeam: footballMatch.awayTeam,
        competition: footballMatch.competition,
        matchDate: footballMatch.matchDate,
        matchStatus: footballMatch.status,
      })
      .from(matchedBet)
      .leftJoin(footballMatch, eq(matchedBet.matchId, footballMatch.id))
      .where(
        and(
          eq(matchedBet.userId, userId),
          inArray(matchedBet.status, ["draft", "matched", "needs_review"]),
          isNotNull(matchedBet.netExposure)
        )
      );

    if (openBets.length === 0) {
      return [];
    }

    // Group bets by matchId (or null for unlinked bets)
    const exposureMap = new Map<
      string | null,
      {
        matchInfo: ExposureByEvent["match"];
        totalExposure: number;
        betIds: string[];
        promoTypes: Set<string>;
      }
    >();

    for (const bet of openBets) {
      const key = bet.matchId;
      const exposure = bet.netExposure ? Number.parseFloat(bet.netExposure) : 0;

      const existing = exposureMap.get(key);
      if (existing) {
        existing.totalExposure += exposure;
        existing.betIds.push(bet.betId);
        if (bet.promoType) {
          existing.promoTypes.add(bet.promoType);
        }
      } else {
        exposureMap.set(key, {
          matchInfo:
            bet.matchId && bet.homeTeam && bet.awayTeam
              ? {
                  homeTeam: bet.homeTeam,
                  awayTeam: bet.awayTeam,
                  competition: bet.competition || "",
                  matchDate: bet.matchDate!,
                  status: (bet.matchStatus ||
                    "SCHEDULED") as FootballMatchStatus,
                }
              : null,
          totalExposure: exposure,
          betIds: [bet.betId],
          promoTypes: new Set(bet.promoType ? [bet.promoType] : []),
        });
      }
    }

    // Convert map to array and sort by exposure (highest first)
    const result: ExposureByEvent[] = Array.from(exposureMap.entries())
      .map(([matchId, data]) => ({
        matchId,
        match: data.matchInfo,
        totalExposure: Math.round(data.totalExposure * 100) / 100,
        betCount: data.betIds.length,
        betIds: data.betIds,
        promoTypes: Array.from(data.promoTypes),
      }))
      .sort((a, b) => b.totalExposure - a.totalExposure);

    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get exposure by event"
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Operations
// ─────────────────────────────────────────────────────────────────────────────

export type CreateScreenshotForImportParams = {
  userId: string;
  kind: "back" | "lay";
  parsedData: {
    source: string;
    market: string;
    selection: string;
    odds: number;
    stake: number;
    exchange: string;
    currency: string;
  };
};

/**
 * Create a placeholder screenshot for imported bet data.
 * Screenshots are required by the bet schema, so we create a "parsed" placeholder.
 */
export async function createScreenshotForImport({
  userId,
  kind,
  parsedData,
}: CreateScreenshotForImportParams) {
  try {
    const now = new Date();
    const [result] = await db
      .insert(screenshotUpload)
      .values({
        createdAt: now,
        userId,
        kind,
        url: `import://csv/${now.getTime()}-${generateUUID()}`,
        filename: "csv-import",
        contentType: "text/csv",
        status: "parsed",
        parsedOutput: parsedData,
      })
      .returning();
    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create screenshot for import"
    );
  }
}

export type CreateBetForImportParams = {
  userId: string;
  kind: "back" | "lay";
  screenshotId: string;
  market: string;
  selection: string;
  odds: number;
  stake: number;
  exchange: string;
  currency: string;
  accountId?: string | null;
  placedAt?: Date | null;
  notes?: string | null;
};

/**
 * Create a back or lay bet from imported data with status "placed".
 */
export async function createBetForImport(params: CreateBetForImportParams) {
  try {
    const now = new Date();
    const betInput: BetInputBase = {
      market: params.market,
      selection: params.selection,
      odds: params.odds,
      stake: params.stake,
      exchange: params.exchange,
      currency: params.currency,
      accountId: params.accountId ?? null,
      placedAt: params.placedAt ?? null,
      status: "placed",
    };

    const result =
      params.kind === "back"
        ? await saveBackBet({
            userId: params.userId,
            screenshotId: params.screenshotId,
            ...betInput,
          })
        : await saveLayBet({
            userId: params.userId,
            screenshotId: params.screenshotId,
            ...betInput,
          });

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: now,
      userId: params.userId,
      entityType: params.kind === "back" ? "back_bet" : "lay_bet",
      entityId: result.id,
      action: "create",
      changes: { source: "csv_import" },
      notes: params.notes,
    });

    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create bet from import"
    );
  }
}

export type CreateTransactionForImportParams = {
  userId: string;
  accountId: string;
  type: "deposit" | "withdrawal" | "bonus" | "adjustment";
  amount: string;
  currency: string;
  occurredAt: Date;
  notes?: string | null;
};

/**
 * Create a transaction from imported balance data.
 */
export async function createTransactionForImport(
  params: CreateTransactionForImportParams
) {
  try {
    const [result] = await db
      .insert(accountTransaction)
      .values({
        createdAt: new Date(),
        userId: params.userId,
        accountId: params.accountId,
        type: params.type,
        amount: params.amount,
        currency: params.currency,
        occurredAt: params.occurredAt,
        notes: params.notes,
      })
      .returning();
    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create transaction from import"
    );
  }
}

/**
 * Find or create an account by normalized name.
 */
export async function findOrCreateAccount({
  userId,
  name,
  currency,
}: {
  userId: string;
  name: string;
  currency: string;
}) {
  try {
    const normalized = normalizeAccountName(name);

    // Check for existing account
    const existing = await db
      .select()
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.nameNormalized, normalized))
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // Create new account
    const [newAccount] = await db
      .insert(account)
      .values({
        createdAt: new Date(),
        userId,
        name,
        nameNormalized: normalized,
        kind: "bookmaker",
        currency,
        status: "active",
      })
      .returning();

    return newAccount;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to find or create account"
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  /** Total profit/loss from all settled bets (NOK) */
  totalProfit: number;
  /** Number of settled bets */
  settledCount: number;
  /** Open exposure from non-settled bets (NOK) */
  openExposure: number;
  /** Number of open positions */
  openPositions: number;
  /** Number of bets pending review */
  pendingReviewCount: number;
  /** Number of bets from last 7 days */
  recentActivityCount: number;
  /** Total ROI percentage */
  roi: number;
}

/**
 * Get dashboard summary statistics for a user.
 * Aggregates key metrics for the dashboard overview cards.
 * All profits are normalized to NOK for consistent aggregation.
 */
export async function getDashboardSummary({
  userId,
}: {
  userId: string;
}): Promise<DashboardSummary> {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel for performance
    const [settledAggregates, openExposureData, pendingReview, recentActivity] =
      await Promise.all([
        // Aggregate settled bets using stored NOK values
        db
          .select({
            totalBackProfitLossNok: sql<string>`COALESCE(${sum(backBet.profitLossNok)}, 0)`,
            totalLayProfitLossNok: sql<string>`COALESCE(${sum(layBet.profitLossNok)}, 0)`,
            totalBackStakeNok: sql<string>`COALESCE(${sum(backBet.stakeNok)}, 0)`,
            settledCount: count(matchedBet.id),
          })
          .from(matchedBet)
          .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
          .leftJoin(layBet, eq(matchedBet.layBetId, layBet.id))
          .where(
            and(eq(matchedBet.userId, userId), eq(matchedBet.status, "settled"))
          ),

        // Open exposure
        getOpenExposure({ userId }),

        // Pending review count
        db
          .select({ count: count(matchedBet.id) })
          .from(matchedBet)
          .where(
            and(
              eq(matchedBet.userId, userId),
              inArray(matchedBet.status, ["needs_review", "draft"])
            )
          ),

        // Recent activity (last 7 days)
        db
          .select({ count: count(matchedBet.id) })
          .from(matchedBet)
          .where(
            and(
              eq(matchedBet.userId, userId),
              gte(matchedBet.createdAt, sevenDaysAgo)
            )
          ),
      ]);

    const totals = settledAggregates[0];
    const backProfitNok = totals?.totalBackProfitLossNok
      ? Number.parseFloat(totals.totalBackProfitLossNok)
      : 0;
    const layProfitNok = totals?.totalLayProfitLossNok
      ? Number.parseFloat(totals.totalLayProfitLossNok)
      : 0;
    const totalProfit = backProfitNok + layProfitNok;
    const totalStake = totals?.totalBackStakeNok
      ? Number.parseFloat(totals.totalBackStakeNok)
      : 0;
    const settledCount = totals?.settledCount ?? 0;
    const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;

    return {
      totalProfit: Math.round(totalProfit * 100) / 100,
      settledCount,
      openExposure: openExposureData.totalExposure,
      openPositions: openExposureData.count,
      pendingReviewCount: pendingReview[0]?.count ?? 0,
      recentActivityCount: recentActivity[0]?.count ?? 0,
      roi: Math.round(roi * 100) / 100,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get dashboard summary"
    );
  }
}

/**
 * Create a placeholder screenshot record for manual entry (Quick Add).
 * This allows bets to be created without an actual uploaded screenshot.
 */
export async function createManualScreenshot({
  userId,
  kind,
}: {
  userId: string;
  kind: "back" | "lay";
}) {
  try {
    const now = new Date();
    const [result] = await db
      .insert(screenshotUpload)
      .values({
        createdAt: now,
        userId,
        kind,
        url: `manual://quick-add/${now.getTime()}-${generateUUID()}`,
        filename: "manual-entry",
        contentType: "application/x-manual",
        status: "parsed",
        parsedOutput: { source: "quick_add", createdAt: now.toISOString() },
      })
      .returning();
    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create manual screenshot"
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Free Bet / Promo Inventory
// ─────────────────────────────────────────────────────────────────────────────

export type FreeBetStatus = "active" | "used" | "expired" | "locked";

export type CreateFreeBetParams = {
  userId: string;
  accountId: string;
  name: string;
  value: number;
  currency: string;
  minOdds?: number | null;
  expiresAt?: Date | null;
  notes?: string | null;
  stakeReturned?: boolean;
  winWageringMultiplier?: number | null;
  winWageringMinOdds?: number | null;
};

/**
 * Create a new free bet record.
 * Free bets track promotional credits received from bookmakers.
 */
export async function createFreeBet(params: CreateFreeBetParams) {
  try {
    const [result] = await db
      .insert(freeBet)
      .values({
        createdAt: new Date(),
        userId: params.userId,
        accountId: params.accountId,
        name: params.name,
        value: params.value.toString(),
        currency: params.currency.toUpperCase(),
        minOdds: params.minOdds != null ? params.minOdds.toString() : null,
        expiresAt: params.expiresAt ?? null,
        status: "active",
        notes: params.notes ?? null,
        stakeReturned: params.stakeReturned ?? false,
        winWageringMultiplier:
          params.winWageringMultiplier != null
            ? params.winWageringMultiplier.toString()
            : null,
        winWageringMinOdds:
          params.winWageringMinOdds != null
            ? params.winWageringMinOdds.toString()
            : null,
        winWageringProgress: "0",
      })
      .returning();

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId: params.userId,
      entityType: "account",
      entityId: params.accountId,
      action: "create",
      changes: { freeBetId: result.id, value: params.value },
      notes: `Created free bet: ${params.name}`,
    });

    return result;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create free bet");
  }
}

/**
 * Get a free bet by ID.
 */
export async function getFreeBetById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(freeBet)
      .where(and(eq(freeBet.id, id), eq(freeBet.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to fetch free bet");
  }
}

/**
 * List all free bets for a user.
 * Can optionally filter by status.
 */
export async function listFreeBetsByUser({
  userId,
  status,
  limit = 100,
}: {
  userId: string;
  status?: FreeBetStatus;
  limit?: number;
}) {
  try {
    const conditions: SQL[] = [eq(freeBet.userId, userId)];
    if (status) {
      conditions.push(eq(freeBet.status, status));
    }

    return await db
      .select({
        id: freeBet.id,
        createdAt: freeBet.createdAt,
        userId: freeBet.userId,
        accountId: freeBet.accountId,
        name: freeBet.name,
        value: freeBet.value,
        currency: freeBet.currency,
        minOdds: freeBet.minOdds,
        expiresAt: freeBet.expiresAt,
        status: freeBet.status,
        usedInMatchedBetId: freeBet.usedInMatchedBetId,
        notes: freeBet.notes,
        accountName: account.name,
        // Unlock requirement fields
        unlockType: freeBet.unlockType,
        unlockTarget: freeBet.unlockTarget,
        unlockMinOdds: freeBet.unlockMinOdds,
        unlockProgress: freeBet.unlockProgress,
        stakeReturned: freeBet.stakeReturned,
        winWageringMultiplier: freeBet.winWageringMultiplier,
        winWageringMinOdds: freeBet.winWageringMinOdds,
        winWageringRequirement: freeBet.winWageringRequirement,
        winWageringProgress: freeBet.winWageringProgress,
        winWageringStartedAt: freeBet.winWageringStartedAt,
        winWageringCompletedAt: freeBet.winWageringCompletedAt,
      })
      .from(freeBet)
      .leftJoin(account, eq(freeBet.accountId, account.id))
      .where(and(...conditions))
      .orderBy(asc(freeBet.expiresAt), desc(freeBet.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list free bets");
  }
}

/**
 * List free bets for a specific account.
 */
export async function listFreeBetsByAccount({
  userId,
  accountId,
  status,
  limit = 100,
}: {
  userId: string;
  accountId: string;
  status?: FreeBetStatus;
  limit?: number;
}) {
  try {
    const conditions: SQL[] = [
      eq(freeBet.userId, userId),
      eq(freeBet.accountId, accountId),
    ];
    if (status) {
      conditions.push(eq(freeBet.status, status));
    }

    return await db
      .select()
      .from(freeBet)
      .where(and(...conditions))
      .orderBy(asc(freeBet.expiresAt), desc(freeBet.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list free bets by account"
    );
  }
}

export type UpdateFreeBetParams = {
  id: string;
  userId: string;
  name?: string;
  value?: number;
  currency?: string;
  minOdds?: number | null;
  expiresAt?: Date | null;
  status?: FreeBetStatus;
  notes?: string | null;
  stakeReturned?: boolean;
  winWageringMultiplier?: number | null;
  winWageringMinOdds?: number | null;
};

/**
 * Update a free bet's details.
 */
export async function updateFreeBet(params: UpdateFreeBetParams) {
  try {
    const updates: Partial<typeof freeBet.$inferInsert> = {};

    if (params.name !== undefined) {
      updates.name = params.name;
    }
    if (params.value !== undefined) {
      updates.value = params.value.toString();
    }
    if (params.currency !== undefined) {
      updates.currency = params.currency.toUpperCase();
    }
    if (params.minOdds !== undefined) {
      updates.minOdds =
        params.minOdds === null ? null : params.minOdds.toString();
    }
    if (params.expiresAt !== undefined) {
      updates.expiresAt = params.expiresAt;
    }
    if (params.status !== undefined) {
      updates.status = params.status;
    }
    if (params.notes !== undefined) {
      updates.notes = params.notes;
    }
    if (params.stakeReturned !== undefined) {
      updates.stakeReturned = params.stakeReturned;
    }
    if (params.winWageringMultiplier !== undefined) {
      updates.winWageringMultiplier =
        params.winWageringMultiplier === null
          ? null
          : params.winWageringMultiplier.toString();
    }
    if (params.winWageringMinOdds !== undefined) {
      updates.winWageringMinOdds =
        params.winWageringMinOdds === null
          ? null
          : params.winWageringMinOdds.toString();
    }

    if (Object.keys(updates).length === 0) {
      return await getFreeBetById({ id: params.id, userId: params.userId });
    }

    const [result] = await db
      .update(freeBet)
      .set(updates)
      .where(and(eq(freeBet.id, params.id), eq(freeBet.userId, params.userId)))
      .returning();

    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update free bet");
  }
}

/**
 * Mark a free bet as used and link it to a matched bet.
 * This is called when a matched bet is created using a free bet.
 */
export async function markFreeBetAsUsed({
  id,
  userId,
  matchedBetId,
}: {
  id: string;
  userId: string;
  matchedBetId: string;
}) {
  try {
    const [result] = await db
      .update(freeBet)
      .set({
        status: "used",
        usedInMatchedBetId: matchedBetId,
      })
      .where(and(eq(freeBet.id, id), eq(freeBet.userId, userId)))
      .returning();

    if (result) {
      // Create audit entry
      await db.insert(auditLog).values({
        createdAt: new Date(),
        userId,
        entityType: "matched_bet",
        entityId: matchedBetId,
        action: "update",
        changes: { freeBetId: id, freeBetValue: result.value },
        notes: `Used free bet: ${result.name}`,
      });
    }

    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to mark free bet as used"
    );
  }
}

/**
 * Get a free bet by the matched bet it was used in.
 */
export async function getFreeBetByMatchedBetId({
  matchedBetId,
  userId,
}: {
  matchedBetId: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select()
      .from(freeBet)
      .where(
        and(
          eq(freeBet.usedInMatchedBetId, matchedBetId),
          eq(freeBet.userId, userId)
        )
      )
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch free bet by matched bet"
    );
  }
}

/**
 * Activate wagering requirements when a free bet wins.
 */
export async function activateFreeBetWageringOnWin({
  freeBetId,
  userId,
  winAmount,
}: {
  freeBetId: string;
  userId: string;
  winAmount: number;
}) {
  try {
    const fb = await getFreeBetById({ id: freeBetId, userId });
    if (!fb) {
      return null;
    }

    const multiplier = fb.winWageringMultiplier
      ? Number.parseFloat(fb.winWageringMultiplier)
      : 0;
    if (!multiplier || winAmount <= 0) {
      return fb;
    }

    const existingRequirement = fb.winWageringRequirement
      ? Number.parseFloat(fb.winWageringRequirement)
      : 0;
    if (existingRequirement > 0) {
      return fb;
    }

    const requirement = winAmount * multiplier;
    const now = new Date();

    const [result] = await db
      .update(freeBet)
      .set({
        winWageringRequirement: requirement.toFixed(2),
        winWageringProgress: "0",
        winWageringStartedAt: now,
        winWageringCompletedAt: null,
      })
      .where(and(eq(freeBet.id, freeBetId), eq(freeBet.userId, userId)))
      .returning();

    await db.insert(auditLog).values({
      createdAt: now,
      userId,
      entityType: "free_bet",
      entityId: freeBetId,
      action: "update",
      changes: {
        winWageringRequirement: requirement,
        winAmount,
        multiplier,
      },
      notes: `Free bet winnings wagering activated: ${requirement.toFixed(2)}`,
    });

    return result ?? fb;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to activate free bet wagering"
    );
  }
}

/**
 * Add a wager that contributes to free bet winnings wagering.
 */
export async function addFreeBetWageringBet({
  freeBetId,
  backBetId,
  matchedBetId,
  stake,
  odds,
  userId,
}: {
  freeBetId: string;
  backBetId?: string | null;
  matchedBetId?: string | null;
  stake: number;
  odds: number;
  userId: string;
}) {
  try {
    const fb = await getFreeBetById({ id: freeBetId, userId });
    if (!fb || !fb.winWageringRequirement) {
      throw new ChatSDKError(
        "bad_request:api",
        "Free bet wagering requirements not active"
      );
    }

    const minOdds = fb.winWageringMinOdds
      ? Number.parseFloat(fb.winWageringMinOdds)
      : 0;
    const qualified = odds >= minOdds;

    const [wager] = await db
      .insert(freeBetWageringBet)
      .values({
        createdAt: new Date(),
        freeBetId,
        backBetId: backBetId ?? null,
        matchedBetId: matchedBetId ?? null,
        stake: stake.toFixed(2),
        odds: odds.toFixed(4),
        qualified: qualified ? "true" : "false",
      })
      .returning();

    let newProgress = Number.parseFloat(fb.winWageringProgress ?? "0");
    const requirement = Number.parseFloat(fb.winWageringRequirement ?? "0");
    const updates: Partial<typeof freeBet.$inferInsert> = {};

    if (qualified) {
      newProgress = Math.min(requirement, newProgress + stake);
      updates.winWageringProgress = newProgress.toFixed(2);
      if (newProgress >= requirement) {
        updates.winWageringCompletedAt = new Date();
      }

      await db
        .update(freeBet)
        .set(updates)
        .where(eq(freeBet.id, freeBetId));
    }

    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId,
      entityType: "free_bet",
      entityId: freeBetId,
      action: "update",
      changes: {
        wagerId: wager.id,
        stake,
        odds,
        qualified,
        newProgress,
      },
      notes: qualified
        ? `Winnings wagering progress: ${newProgress.toFixed(2)} / ${requirement.toFixed(2)}`
        : "Winnings wagering bet did not qualify (min odds not met)",
    });

    return { wager, qualified, newProgress };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to add free bet wagering bet"
    );
  }
}

/**
 * Process wagering progress for free bet winnings when a back bet settles.
 */
export async function processFreeBetWageringProgressOnSettle({
  accountId,
  userId,
  backBetId,
  matchedBetId,
  stake,
  odds,
  placedAt,
}: {
  accountId: string;
  userId: string;
  backBetId?: string | null;
  matchedBetId?: string | null;
  stake: number;
  odds: number;
  placedAt: Date;
}) {
  try {
    const activeFreeBets = await db
      .select()
      .from(freeBet)
      .where(
        and(
          eq(freeBet.userId, userId),
          eq(freeBet.accountId, accountId),
          isNotNull(freeBet.winWageringRequirement),
          isNotNull(freeBet.winWageringStartedAt)
        )
      );

    for (const fb of activeFreeBets) {
      const requirement = Number.parseFloat(fb.winWageringRequirement ?? "0");
      const progress = Number.parseFloat(fb.winWageringProgress ?? "0");
      const startedAt = fb.winWageringStartedAt;

      if (!startedAt || progress >= requirement) {
        continue;
      }

      if (placedAt < startedAt) {
        continue;
      }

      await addFreeBetWageringBet({
        freeBetId: fb.id,
        backBetId: backBetId ?? null,
        matchedBetId: matchedBetId ?? null,
        stake,
        odds,
        userId,
      });
    }
  } catch (error) {
    console.error("[processFreeBetWageringProgressOnSettle] Error:", error);
  }
}

/**
 * Count active free bets that are expiring within the given number of days.
 * Used for dashboard warnings.
 */
export async function countExpiringFreeBets({
  userId,
  daysUntilExpiry = 7,
}: {
  userId: string;
  daysUntilExpiry?: number;
}) {
  try {
    const now = new Date();
    const expiryThreshold = new Date(
      now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000
    );

    const [result] = await db
      .select({ count: count(freeBet.id) })
      .from(freeBet)
      .where(
        and(
          eq(freeBet.userId, userId),
          eq(freeBet.status, "active"),
          lte(freeBet.expiresAt, expiryThreshold)
        )
      );

    return result?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count expiring free bets"
    );
  }
}

/**
 * Get total value of active free bets for a user.
 * Used for dashboard summary.
 */
export async function getActiveFreeBetsSummary({ userId }: { userId: string }) {
  try {
    const [result] = await db
      .select({
        count: count(freeBet.id),
        totalValue: sum(freeBet.value),
      })
      .from(freeBet)
      .where(and(eq(freeBet.userId, userId), eq(freeBet.status, "active")));

    return {
      count: result?.count ?? 0,
      totalValue: result?.totalValue ? Number.parseFloat(result.totalValue) : 0,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get active free bets summary"
    );
  }
}

/**
 * Delete a free bet by ID.
 * Only allows deletion of active or expired free bets, not used ones.
 */
export async function deleteFreeBet({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    // Verify the free bet exists and belongs to user
    const existing = await getFreeBetById({ id, userId });
    if (!existing) {
      return null;
    }

    if (existing.status === "used") {
      throw new ChatSDKError(
        "bad_request:api",
        "Cannot delete a used free bet"
      );
    }

    await db
      .delete(freeBet)
      .where(and(eq(freeBet.id, id), eq(freeBet.userId, userId)));

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId,
      entityType: "account",
      entityId: existing.accountId,
      action: "delete",
      changes: { freeBetId: id, value: existing.value },
      notes: `Deleted free bet: ${existing.name}`,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to delete free bet");
  }
}

// ============================================================================
// Promo Progress Tracking Queries
// ============================================================================

export type FreeBetWithProgress = {
  id: string;
  name: string;
  value: string;
  currency: string;
  status: string;
  expiresAt: Date | null;
  accountId: string;
  accountName: string;
  unlockType: "stake" | "bets" | null;
  unlockTarget: string | null;
  unlockMinOdds: string | null;
  unlockProgress: string;
  progressPercent: number;
  isLocked: boolean;
};

/**
 * List free bets with their unlock progress for a user.
 * Includes computed progress percentage and lock status.
 */
export async function listFreeBetsWithProgress({
  userId,
  status,
}: {
  userId: string;
  status?: "active" | "locked" | "used" | "expired";
}): Promise<FreeBetWithProgress[]> {
  try {
    const conditions: SQL[] = [eq(freeBet.userId, userId)];
    if (status) {
      conditions.push(eq(freeBet.status, status));
    }

    const rows = await db
      .select({
        id: freeBet.id,
        name: freeBet.name,
        value: freeBet.value,
        currency: freeBet.currency,
        status: freeBet.status,
        expiresAt: freeBet.expiresAt,
        accountId: freeBet.accountId,
        accountName: account.name,
        unlockType: freeBet.unlockType,
        unlockTarget: freeBet.unlockTarget,
        unlockMinOdds: freeBet.unlockMinOdds,
        unlockProgress: freeBet.unlockProgress,
      })
      .from(freeBet)
      .innerJoin(account, eq(freeBet.accountId, account.id))
      .where(and(...conditions))
      .orderBy(desc(freeBet.createdAt));

    return rows.map((row) => {
      const target = row.unlockTarget ? Number.parseFloat(row.unlockTarget) : 0;
      const progress = row.unlockProgress
        ? Number.parseFloat(row.unlockProgress)
        : 0;
      const progressPercent =
        target > 0 ? Math.min((progress / target) * 100, 100) : 100;
      const isLocked = row.unlockType !== null && progress < target;

      return {
        id: row.id,
        name: row.name,
        value: row.value,
        currency: row.currency,
        status: row.status,
        expiresAt: row.expiresAt,
        accountId: row.accountId,
        accountName: row.accountName,
        unlockType: row.unlockType as "stake" | "bets" | null,
        unlockTarget: row.unlockTarget,
        unlockMinOdds: row.unlockMinOdds,
        unlockProgress: row.unlockProgress ?? "0",
        progressPercent,
        isLocked,
      };
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list free bets with progress"
    );
  }
}

export interface QualifyingBetInfo {
  id: string;
  createdAt: Date;
  matchedBetId: string;
  contribution: string;
  market: string | null;
  selection: string | null;
  backStake: string | null;
  backOdds: string | null;
}

/**
 * List qualifying bets for a specific free bet/promo.
 * Returns the bets that contribute to unlocking the promo.
 */
export async function listQualifyingBetsForPromo({
  freeBetId,
  userId,
}: {
  freeBetId: string;
  userId: string;
}): Promise<QualifyingBetInfo[]> {
  try {
    // Verify ownership
    const fb = await getFreeBetById({ id: freeBetId, userId });
    if (!fb) {
      throw new ChatSDKError(
        "bad_request:api",
        "Free bet not found or access denied"
      );
    }

    const rows = await db
      .select({
        id: qualifyingBet.id,
        createdAt: qualifyingBet.createdAt,
        matchedBetId: qualifyingBet.matchedBetId,
        contribution: qualifyingBet.contribution,
        market: matchedBet.market,
        selection: matchedBet.selection,
        backStake: backBet.stake,
        backOdds: backBet.odds,
      })
      .from(qualifyingBet)
      .innerJoin(matchedBet, eq(qualifyingBet.matchedBetId, matchedBet.id))
      .leftJoin(backBet, eq(matchedBet.backBetId, backBet.id))
      .where(eq(qualifyingBet.freeBetId, freeBetId))
      .orderBy(desc(qualifyingBet.createdAt));

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      matchedBetId: row.matchedBetId,
      contribution: row.contribution,
      market: row.market,
      selection: row.selection,
      backStake: row.backStake,
      backOdds: row.backOdds,
    }));
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list qualifying bets"
    );
  }
}

/**
 * Add a qualifying bet to a promo, updating its progress.
 * This is called when a bet is placed that contributes to unlocking a promo.
 */
export async function addQualifyingBet({
  freeBetId,
  matchedBetId,
  userId,
  contribution,
}: {
  freeBetId: string;
  matchedBetId: string;
  userId: string;
  contribution: number;
}) {
  try {
    // Verify ownership and get current progress
    const fb = await getFreeBetById({ id: freeBetId, userId });
    if (!fb) {
      throw new ChatSDKError(
        "bad_request:api",
        "Free bet not found or access denied"
      );
    }

    if (fb.status !== "locked") {
      throw new ChatSDKError(
        "bad_request:api",
        "Can only add qualifying bets to locked promos"
      );
    }

    // Insert qualifying bet record
    const [qb] = await db
      .insert(qualifyingBet)
      .values({
        createdAt: new Date(),
        freeBetId,
        matchedBetId,
        contribution: String(contribution),
      })
      .returning();

    // Update progress
    const currentProgress = fb.unlockProgress
      ? Number.parseFloat(fb.unlockProgress)
      : 0;
    const newProgress = currentProgress + contribution;
    const target = fb.unlockTarget ? Number.parseFloat(fb.unlockTarget) : 0;

    // Check if unlocked
    const isUnlocked = newProgress >= target;

    await db
      .update(freeBet)
      .set({
        unlockProgress: String(newProgress),
        status: isUnlocked ? "active" : "locked",
      })
      .where(eq(freeBet.id, freeBetId));

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId,
      entityType: "free_bet",
      entityId: freeBetId,
      action: "update",
      changes: {
        qualifyingBetId: qb.id,
        contribution,
        newProgress,
        unlocked: isUnlocked,
      },
      notes: isUnlocked
        ? `Promo unlocked! Progress: ${newProgress}/${target}`
        : `Added qualifying bet. Progress: ${newProgress}/${target}`,
    });

    return {
      qualifyingBet: qb,
      newProgress,
      isUnlocked,
    };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to add qualifying bet"
    );
  }
}

/**
 * Remove a qualifying bet from a promo, updating its progress.
 * Called when a bet is voided or deleted.
 */
export async function removeQualifyingBet({
  qualifyingBetId,
  userId,
}: {
  qualifyingBetId: string;
  userId: string;
}) {
  try {
    // Get the qualifying bet
    const [qb] = await db
      .select()
      .from(qualifyingBet)
      .where(eq(qualifyingBet.id, qualifyingBetId));

    if (!qb) {
      throw new ChatSDKError("bad_request:api", "Qualifying bet not found");
    }

    // Verify ownership via the free bet
    const fb = await getFreeBetById({ id: qb.freeBetId, userId });
    if (!fb) {
      throw new ChatSDKError("bad_request:api", "Access denied");
    }

    // Remove the qualifying bet
    await db.delete(qualifyingBet).where(eq(qualifyingBet.id, qualifyingBetId));

    // Update progress
    const currentProgress = fb.unlockProgress
      ? Number.parseFloat(fb.unlockProgress)
      : 0;
    const contribution = Number.parseFloat(qb.contribution);
    const newProgress = Math.max(0, currentProgress - contribution);

    await db
      .update(freeBet)
      .set({
        unlockProgress: String(newProgress),
        status: "locked", // If we removed a qualifying bet, it's likely locked again
      })
      .where(eq(freeBet.id, qb.freeBetId));

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId,
      entityType: "free_bet",
      entityId: qb.freeBetId,
      action: "update",
      changes: {
        qualifyingBetId,
        removedContribution: contribution,
        newProgress,
      },
      notes: `Removed qualifying bet. Progress: ${newProgress}`,
    });

    return { success: true, newProgress };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to remove qualifying bet"
    );
  }
}

/**
 * Create a locked promo with unlock requirements.
 * Different from createFreeBet as this creates a promo that must be unlocked.
 */
export async function createLockedPromo({
  userId,
  accountId,
  name,
  value,
  currency,
  minOdds,
  expiresAt,
  notes,
  unlockType,
  unlockTarget,
  unlockMinOdds,
  stakeReturned,
  winWageringMultiplier,
  winWageringMinOdds,
}: {
  userId: string;
  accountId: string;
  name: string;
  value: number;
  currency: string;
  minOdds?: number;
  expiresAt?: Date;
  notes?: string;
  unlockType: "stake" | "bets";
  unlockTarget: number;
  unlockMinOdds?: number;
  stakeReturned?: boolean;
  winWageringMultiplier?: number | null;
  winWageringMinOdds?: number | null;
}) {
  try {
    const [result] = await db
      .insert(freeBet)
      .values({
        createdAt: new Date(),
        userId,
        accountId,
        name,
        value: String(value),
        currency,
        minOdds: minOdds ? String(minOdds) : null,
        expiresAt: expiresAt ?? null,
        notes: notes ?? null,
        status: "locked",
        unlockType,
        unlockTarget: String(unlockTarget),
        unlockMinOdds: unlockMinOdds ? String(unlockMinOdds) : null,
        unlockProgress: "0",
        stakeReturned: stakeReturned ?? false,
        winWageringMultiplier:
          winWageringMultiplier != null
            ? String(winWageringMultiplier)
            : null,
        winWageringMinOdds:
          winWageringMinOdds != null ? String(winWageringMinOdds) : null,
        winWageringProgress: "0",
      })
      .returning();

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId,
      entityType: "free_bet",
      entityId: result.id,
      action: "create",
      changes: {
        name,
        value,
        unlockType,
        unlockTarget,
      },
      notes: `Created locked promo: ${name} (unlock: ${unlockType} ${unlockTarget})`,
    });

    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create locked promo"
    );
  }
}

// ============================================================================
// FootballMatch Queries
// ============================================================================

/**
 * Parameters for creating or upserting a football match.
 */
export interface CreateFootballMatchParams {
  externalId: number;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  competitionCode?: string;
  matchDate: Date;
  status?: FootballMatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
}

/**
 * Create a new football match record.
 */
export async function createFootballMatch(params: CreateFootballMatchParams) {
  try {
    const now = new Date();
    const [result] = await db
      .insert(footballMatch)
      .values({
        createdAt: now,
        externalId: String(params.externalId),
        homeTeam: params.homeTeam,
        awayTeam: params.awayTeam,
        competition: params.competition,
        competitionCode: params.competitionCode ?? null,
        matchDate: params.matchDate,
        status: params.status ?? "SCHEDULED",
        homeScore: params.homeScore != null ? String(params.homeScore) : null,
        awayScore: params.awayScore != null ? String(params.awayScore) : null,
        lastSyncedAt: now,
      })
      .returning();
    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create football match"
    );
  }
}

/**
 * Get a football match by its internal UUID.
 */
export async function getFootballMatchById({ id }: { id: string }) {
  try {
    const [row] = await db
      .select()
      .from(footballMatch)
      .where(eq(footballMatch.id, id))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch football match"
    );
  }
}

/**
 * Get a football match by its external ID from football-data.org.
 */
export async function getFootballMatchByExternalId({
  externalId,
}: {
  externalId: number;
}) {
  try {
    const [row] = await db
      .select()
      .from(footballMatch)
      .where(eq(footballMatch.externalId, String(externalId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch football match by external ID"
    );
  }
}

/**
 * Upsert a football match - create if not exists, update if exists based on externalId.
 */
export async function upsertFootballMatch(params: CreateFootballMatchParams) {
  try {
    const now = new Date();
    const [result] = await db
      .insert(footballMatch)
      .values({
        createdAt: now,
        externalId: String(params.externalId),
        homeTeam: params.homeTeam,
        awayTeam: params.awayTeam,
        competition: params.competition,
        competitionCode: params.competitionCode ?? null,
        matchDate: params.matchDate,
        status: params.status ?? "SCHEDULED",
        homeScore: params.homeScore != null ? String(params.homeScore) : null,
        awayScore: params.awayScore != null ? String(params.awayScore) : null,
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: footballMatch.externalId,
        set: {
          homeTeam: params.homeTeam,
          awayTeam: params.awayTeam,
          competition: params.competition,
          competitionCode: params.competitionCode ?? null,
          matchDate: params.matchDate,
          status: params.status ?? "SCHEDULED",
          homeScore: params.homeScore != null ? String(params.homeScore) : null,
          awayScore: params.awayScore != null ? String(params.awayScore) : null,
          lastSyncedAt: now,
        },
      })
      .returning();
    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to upsert football match"
    );
  }
}

/**
 * Batch upsert football matches - more efficient for syncing many matches at once.
 * Uses a single INSERT ... ON CONFLICT statement for all matches.
 */
export async function batchUpsertFootballMatches(
  matches: CreateFootballMatchParams[]
): Promise<{ synced: number; errors: number }> {
  if (matches.length === 0) {
    return { synced: 0, errors: 0 };
  }

  const now = new Date();
  const values = matches.map((params) => ({
    createdAt: now,
    externalId: String(params.externalId),
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    competition: params.competition,
    competitionCode: params.competitionCode ?? null,
    matchDate: params.matchDate,
    status: params.status ?? "SCHEDULED",
    homeScore: params.homeScore != null ? String(params.homeScore) : null,
    awayScore: params.awayScore != null ? String(params.awayScore) : null,
    lastSyncedAt: now,
  }));

  try {
    const results = await db
      .insert(footballMatch)
      .values(values)
      .onConflictDoUpdate({
        target: footballMatch.externalId,
        set: {
          homeTeam: sql`excluded."homeTeam"`,
          awayTeam: sql`excluded."awayTeam"`,
          competition: sql`excluded."competition"`,
          competitionCode: sql`excluded."competitionCode"`,
          matchDate: sql`excluded."matchDate"`,
          status: sql`excluded."status"`,
          homeScore: sql`excluded."homeScore"`,
          awayScore: sql`excluded."awayScore"`,
          lastSyncedAt: sql`excluded."lastSyncedAt"`,
        },
      })
      .returning();

    return { synced: results.length, errors: 0 };
  } catch (error) {
    console.error("[batchUpsertFootballMatches] Error:", error);
    // Fall back to individual upserts if batch fails
    let synced = 0;
    let errors = 0;
    for (const params of matches) {
      try {
        await upsertFootballMatch(params);
        synced++;
      } catch {
        errors++;
      }
    }
    return { synced, errors };
  }
}

/**
 * List all football matches with optional filters.
 */
export async function listFootballMatches({
  competitionCode,
  status,
  fromDate,
  toDate,
  limit = 100,
}: {
  competitionCode?: string;
  status?: FootballMatchStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
} = {}) {
  try {
    const conditions: SQL<unknown>[] = [];

    if (competitionCode) {
      conditions.push(eq(footballMatch.competitionCode, competitionCode));
    }
    if (status) {
      conditions.push(eq(footballMatch.status, status));
    }
    if (fromDate) {
      conditions.push(gte(footballMatch.matchDate, fromDate));
    }
    if (toDate) {
      conditions.push(lte(footballMatch.matchDate, toDate));
    }

    const rows = await db
      .select()
      .from(footballMatch)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(footballMatch.matchDate))
      .limit(limit);

    return rows;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list football matches"
    );
  }
}

/**
 * List upcoming matches (next N days) that are scheduled.
 * Used for syncing and match picker in bet creation.
 */
export async function listUpcomingMatches({
  daysAhead = 14,
  competitionCode,
}: {
  daysAhead?: number;
  competitionCode?: string;
} = {}) {
  try {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const conditions: SQL<unknown>[] = [
      gte(footballMatch.matchDate, now),
      lte(footballMatch.matchDate, futureDate),
      inArray(footballMatch.status, ["SCHEDULED", "TIMED"]),
    ];

    if (competitionCode) {
      conditions.push(eq(footballMatch.competitionCode, competitionCode));
    }

    const rows = await db
      .select()
      .from(footballMatch)
      .where(and(...conditions))
      .orderBy(asc(footballMatch.matchDate));

    return rows;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list upcoming matches"
    );
  }
}

/**
 * List recently finished matches (last N days).
 * Used for syncing results and auto-settlement detection.
 */
export async function listRecentlyFinishedMatches({
  daysBack = 3,
  competitionCode,
}: {
  daysBack?: number;
  competitionCode?: string;
} = {}) {
  try {
    const now = new Date();
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - daysBack);

    const conditions: SQL<unknown>[] = [
      gte(footballMatch.matchDate, pastDate),
      lte(footballMatch.matchDate, now),
      eq(footballMatch.status, "FINISHED"),
    ];

    if (competitionCode) {
      conditions.push(eq(footballMatch.competitionCode, competitionCode));
    }

    const rows = await db
      .select()
      .from(footballMatch)
      .where(and(...conditions))
      .orderBy(desc(footballMatch.matchDate));

    return rows;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list recently finished matches"
    );
  }
}

/**
 * Update a football match with new data (e.g., scores, status).
 */
export async function updateFootballMatch({
  id,
  status,
  homeScore,
  awayScore,
}: {
  id: string;
  status?: FootballMatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
}) {
  try {
    const updates: Partial<typeof footballMatch.$inferInsert> = {
      lastSyncedAt: new Date(),
    };

    if (status !== undefined) {
      updates.status = status;
    }
    if (homeScore !== undefined) {
      updates.homeScore = homeScore != null ? String(homeScore) : null;
    }
    if (awayScore !== undefined) {
      updates.awayScore = awayScore != null ? String(awayScore) : null;
    }

    const [result] = await db
      .update(footballMatch)
      .set(updates)
      .where(eq(footballMatch.id, id))
      .returning();

    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update football match"
    );
  }
}

/**
 * Search for matches by team name using trigram fuzzy matching.
 * Uses pg_trgm extension for similarity search - handles typos and abbreviations.
 *
 * Examples that will match "Manchester United FC":
 * - "Man United" (similarity ~0.4)
 * - "Manchster United" (typo, similarity ~0.7)
 * - "Manchester Utd" (similarity ~0.6)
 */
export async function searchFootballMatches({
  searchTerm,
  fromDate,
  limit = 20,
  similarityThreshold = 0.2,
}: {
  searchTerm: string;
  fromDate?: Date;
  limit?: number;
  /** Minimum similarity score (0-1). Lower = more fuzzy. Default 0.2 */
  similarityThreshold?: number;
}) {
  try {
    const term = searchTerm.trim();

    // Use trigram similarity for fuzzy matching
    // GREATEST picks the higher similarity between home and away team
    const conditions: SQL<unknown>[] = [
      sql`(
        similarity(${footballMatch.homeTeam}, ${term}) > ${similarityThreshold}
        OR similarity(${footballMatch.awayTeam}, ${term}) > ${similarityThreshold}
      )`,
    ];

    if (fromDate) {
      conditions.push(gte(footballMatch.matchDate, fromDate));
    }

    const rows = await db
      .select({
        id: footballMatch.id,
        externalId: footballMatch.externalId,
        homeTeam: footballMatch.homeTeam,
        awayTeam: footballMatch.awayTeam,
        competition: footballMatch.competition,
        competitionCode: footballMatch.competitionCode,
        matchDate: footballMatch.matchDate,
        status: footballMatch.status,
        homeScore: footballMatch.homeScore,
        awayScore: footballMatch.awayScore,
        lastSyncedAt: footballMatch.lastSyncedAt,
        // Include similarity score for ordering
        similarity: sql<number>`GREATEST(
          similarity(${footballMatch.homeTeam}, ${term}),
          similarity(${footballMatch.awayTeam}, ${term})
        )`.as("similarity"),
      })
      .from(footballMatch)
      .where(and(...conditions))
      // Order by similarity (best matches first), then by date
      .orderBy(
        sql`GREATEST(similarity(${footballMatch.homeTeam}, ${term}), similarity(${footballMatch.awayTeam}, ${term})) DESC`,
        asc(footballMatch.matchDate)
      )
      .limit(limit);

    return rows;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to search football matches"
    );
  }
}

// =============================================================================
// USER SETTINGS QUERIES
// =============================================================================

/**
 * Get user settings by user ID.
 * Returns null if no settings exist for the user.
 */
export async function getUserSettings({ userId }: { userId: string }) {
  try {
    const [result] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user settings"
    );
  }
}

/**
 * Create or update user settings.
 * Uses upsert to handle both new and existing settings.
 */
export async function upsertUserSettings({
  userId,
  enabledCompetitions,
}: {
  userId: string;
  enabledCompetitions?: string[] | null;
}) {
  try {
    const now = new Date();

    const [result] = await db
      .insert(userSettings)
      .values({
        userId,
        enabledCompetitions,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          enabledCompetitions,
          updatedAt: now,
        },
      })
      .returning();

    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to upsert user settings"
    );
  }
}

/**
 * Get enabled competitions for a user.
 * Returns default competitions if user has no settings or hasn't configured any.
 */
export async function getEnabledCompetitions({
  userId,
}: {
  userId: string;
}): Promise<string[]> {
  try {
    const settings = await getUserSettings({ userId });

    // Return user's competitions if set, otherwise return defaults
    if (
      settings?.enabledCompetitions &&
      settings.enabledCompetitions.length > 0
    ) {
      return settings.enabledCompetitions;
    }

    return DEFAULT_COMPETITION_CODES;
  } catch (_error) {
    // On error, return defaults rather than failing
    console.error(
      "Failed to get enabled competitions, using defaults:",
      _error
    );
    return DEFAULT_COMPETITION_CODES;
  }
}

/**
 * Get all unique competition codes enabled by any user.
 * Used by the cron job to sync matches for all competitions that users care about.
 * Falls back to defaults if no users have configured settings.
 */
export async function getAllEnabledCompetitions(): Promise<string[]> {
  try {
    const allSettings = await db.select().from(userSettings);

    // Collect all unique competition codes
    const allCodes = new Set<string>();

    for (const settings of allSettings) {
      if (
        settings.enabledCompetitions &&
        Array.isArray(settings.enabledCompetitions)
      ) {
        for (const code of settings.enabledCompetitions) {
          allCodes.add(code);
        }
      }
    }

    // If no users have settings, return defaults
    if (allCodes.size === 0) {
      return DEFAULT_COMPETITION_CODES;
    }

    return Array.from(allCodes);
  } catch (_error) {
    console.error(
      "Failed to get all enabled competitions, using defaults:",
      _error
    );
    return DEFAULT_COMPETITION_CODES;
  }
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete an account transaction by ID.
 * Only the owner can delete transactions. Creates an audit entry.
 * If the transaction is linked to a wallet transaction, that is also deleted.
 */
export async function deleteAccountTransaction({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    // Verify the transaction exists and belongs to user
    const [existing] = await db
      .select()
      .from(accountTransaction)
      .where(
        and(
          eq(accountTransaction.id, id),
          eq(accountTransaction.userId, userId)
        )
      );

    if (!existing) {
      return null;
    }

    // If there's a linked wallet transaction, delete it first
    if (existing.linkedWalletTransactionId) {
      await db
        .delete(walletTransaction)
        .where(eq(walletTransaction.id, existing.linkedWalletTransactionId));
    }

    await db
      .delete(accountTransaction)
      .where(
        and(
          eq(accountTransaction.id, id),
          eq(accountTransaction.userId, userId)
        )
      );

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId,
      entityType: "account",
      entityId: existing.accountId,
      action: "delete",
      changes: {
        transactionId: id,
        type: existing.type,
        amount: existing.amount,
        currency: existing.currency,
        linkedWalletTransactionId: existing.linkedWalletTransactionId,
      },
      notes: existing.linkedWalletTransactionId
        ? `Deleted ${existing.type} transaction: ${existing.currency} ${existing.amount} (and linked wallet transaction)`
        : `Deleted ${existing.type} transaction: ${existing.currency} ${existing.amount}`,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete account transaction"
    );
  }
}

/**
 * Delete an account by ID.
 * Only allows deletion if the account has no linked bets or transactions.
 * Creates an audit entry.
 */
export async function deleteAccount({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    // Verify the account exists and belongs to user
    const existing = await getAccountById({ id, userId });
    if (!existing) {
      return null;
    }

    // Check for linked bets (back or lay)
    const [linkedBackBet] = await db
      .select({ id: backBet.id })
      .from(backBet)
      .where(eq(backBet.accountId, id))
      .limit(1);

    const [linkedLayBet] = await db
      .select({ id: layBet.id })
      .from(layBet)
      .where(eq(layBet.accountId, id))
      .limit(1);

    if (linkedBackBet || linkedLayBet) {
      throw new ChatSDKError(
        "bad_request:api",
        "Cannot delete account with linked bets. Archive it instead."
      );
    }

    // Check for linked transactions
    const [linkedTransaction] = await db
      .select({ id: accountTransaction.id })
      .from(accountTransaction)
      .where(eq(accountTransaction.accountId, id))
      .limit(1);

    if (linkedTransaction) {
      throw new ChatSDKError(
        "bad_request:api",
        "Cannot delete account with transactions. Archive it instead."
      );
    }

    // Check for linked free bets
    const [linkedFreeBet] = await db
      .select({ id: freeBet.id })
      .from(freeBet)
      .where(eq(freeBet.accountId, id))
      .limit(1);

    if (linkedFreeBet) {
      throw new ChatSDKError(
        "bad_request:api",
        "Cannot delete account with linked free bets. Archive it instead."
      );
    }

    await db
      .delete(account)
      .where(and(eq(account.id, id), eq(account.userId, userId)));

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId,
      entityType: "account",
      entityId: id,
      action: "delete",
      changes: {
        name: existing.name,
        kind: existing.kind,
        currency: existing.currency,
      },
      notes: `Deleted account: ${existing.name}`,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to delete account");
  }
}

/**
 * Delete a single bet (back or lay) by ID.
 * If the bet is part of a matched bet, unlinks it from the matched bet first.
 * Creates audit entries.
 */
export async function deleteBet({
  id,
  kind,
  userId,
}: {
  id: string;
  kind: "back" | "lay";
  userId: string;
}) {
  try {
    const betTable = kind === "back" ? backBet : layBet;
    const foreignKeyColumn =
      kind === "back" ? matchedBet.backBetId : matchedBet.layBetId;

    // Verify the bet exists and belongs to user
    const [existing] = await db
      .select()
      .from(betTable)
      .where(and(eq(betTable.id, id), eq(betTable.userId, userId)));

    if (!existing) {
      return null;
    }

    // Check if this bet is linked to a matched bet
    const [linkedMatchedBet] = await db
      .select({ id: matchedBet.id, status: matchedBet.status })
      .from(matchedBet)
      .where(eq(foreignKeyColumn, id));

    if (linkedMatchedBet) {
      // Unlink the bet from matched bet (set to null)
      await db
        .update(matchedBet)
        .set({
          [kind === "back" ? "backBetId" : "layBetId"]: null,
          status: "draft",
          netExposure: null,
          confirmedAt: null,
        })
        .where(eq(matchedBet.id, linkedMatchedBet.id));

      // Create audit entry for the unlinking
      await db.insert(auditLog).values({
        createdAt: new Date(),
        userId,
        entityType: "matched_bet",
        entityId: linkedMatchedBet.id,
        action: "update",
        changes: {
          [`${kind}BetId`]: null,
          status: { from: linkedMatchedBet.status, to: "draft" },
          reason: "bet_deleted",
        },
        notes: `Unlinked ${kind} bet due to deletion`,
      });
    }

    // Delete the bet's screenshot if it's a manual/placeholder one
    const [screenshot] = await db
      .select()
      .from(screenshotUpload)
      .where(eq(screenshotUpload.id, existing.screenshotId));

    // Note: Linked account transactions (settlement) will be automatically deleted
    // via cascade delete on the linkedBackBetId/linkedLayBetId foreign keys.
    // For legacy transactions created before this linking was added, we explicitly
    // delete any transactions that reference this bet by matching selection in notes.
    if (existing.accountId && existing.status === "settled") {
      const betIdentifier = `${existing.selection} @ ${existing.odds}`;
      // Delete legacy settlement/reversal transactions that mention this bet
      await db
        .delete(accountTransaction)
        .where(
          and(
            eq(accountTransaction.accountId, existing.accountId),
            eq(accountTransaction.type, "adjustment"),
            sql`${accountTransaction.notes} LIKE ${"%" + betIdentifier + "%"}`
          )
        );
    }

    // Handle bonus qualifying bet records - update wagering progress before deleting
    if (kind === "back") {
      // Get all qualifying bets that reference this back bet
      const qualifyingBets = await db
        .select({
          id: bonusQualifyingBet.id,
          depositBonusId: bonusQualifyingBet.depositBonusId,
          stake: bonusQualifyingBet.stake,
          qualified: bonusQualifyingBet.qualified,
        })
        .from(bonusQualifyingBet)
        .where(eq(bonusQualifyingBet.backBetId, id));

      // Decrement wagering progress for each qualified bet
      for (const qb of qualifyingBets) {
        if (qb.qualified === "true") {
          const stakeValue = Number.parseFloat(qb.stake);

          // Get the deposit bonus
          const [bonus] = await db
            .select()
            .from(depositBonus)
            .where(eq(depositBonus.id, qb.depositBonusId));

          if (bonus) {
            const currentProgress = Number.parseFloat(bonus.wageringProgress ?? "0");
            const requirement = Number.parseFloat(bonus.wageringRequirement ?? "0");
            const newProgress = Math.max(0, currentProgress - stakeValue);

            const updates: Record<string, unknown> = {
              wageringProgress: newProgress.toString(),
            };

            // If bonus was cleared but now falls below requirement, revert to active
            if (bonus.status === "cleared" && newProgress < requirement) {
              updates.status = "active";
              updates.clearedAt = null;
            }

            await db
              .update(depositBonus)
              .set(updates)
              .where(eq(depositBonus.id, qb.depositBonusId));

            // Create audit entry for progress update
            await db.insert(auditLog).values({
              createdAt: new Date(),
              userId,
              entityType: "deposit_bonus",
              entityId: qb.depositBonusId,
              action: "update",
              changes: {
                previousProgress: currentProgress,
                removedStake: stakeValue,
                newProgress,
                reason: "qualifying_bet_deleted",
                statusReverted: updates.status === "active" ? true : undefined,
              },
              notes: `Wagering progress reduced due to bet deletion: ${newProgress.toFixed(2)} / ${requirement.toFixed(2)}`,
            });
          }
        }
      }

      // Now delete the qualifying bet records
      await db
        .delete(bonusQualifyingBet)
        .where(eq(bonusQualifyingBet.backBetId, id));

      // Handle free bet winnings wagering bets
      const wageringBets = await db
        .select({
          id: freeBetWageringBet.id,
          freeBetId: freeBetWageringBet.freeBetId,
          stake: freeBetWageringBet.stake,
          qualified: freeBetWageringBet.qualified,
        })
        .from(freeBetWageringBet)
        .where(eq(freeBetWageringBet.backBetId, id));

      for (const wager of wageringBets) {
        if (wager.qualified === "true") {
          const stakeValue = Number.parseFloat(wager.stake);

          const [fb] = await db
            .select()
            .from(freeBet)
            .where(eq(freeBet.id, wager.freeBetId));

          if (fb) {
            const currentProgress = Number.parseFloat(
              fb.winWageringProgress ?? "0"
            );
            const requirement = Number.parseFloat(
              fb.winWageringRequirement ?? "0"
            );
            const newProgress = Math.max(0, currentProgress - stakeValue);

            const updates: Record<string, unknown> = {
              winWageringProgress: newProgress.toString(),
            };

            if (
              fb.winWageringCompletedAt &&
              newProgress < requirement
            ) {
              updates.winWageringCompletedAt = null;
            }

            await db
              .update(freeBet)
              .set(updates)
              .where(eq(freeBet.id, wager.freeBetId));

            await db.insert(auditLog).values({
              createdAt: new Date(),
              userId,
              entityType: "free_bet",
              entityId: wager.freeBetId,
              action: "update",
              changes: {
                previousProgress: currentProgress,
                removedStake: stakeValue,
                newProgress,
                reason: "wagering_bet_deleted",
              },
              notes: `Winnings wagering progress reduced due to bet deletion: ${newProgress.toFixed(2)} / ${requirement.toFixed(2)}`,
            });
          }
        }
      }

      await db
        .delete(freeBetWageringBet)
        .where(eq(freeBetWageringBet.backBetId, id));
    }

    // Delete the bet
    await db.delete(betTable).where(eq(betTable.id, id));

    // Delete the screenshot if it was created for this bet only
    if (screenshot) {
      // Check if other bets reference this screenshot
      const [otherBackBet] = await db
        .select({ id: backBet.id })
        .from(backBet)
        .where(eq(backBet.screenshotId, screenshot.id))
        .limit(1);

      const [otherLayBet] = await db
        .select({ id: layBet.id })
        .from(layBet)
        .where(eq(layBet.screenshotId, screenshot.id))
        .limit(1);

      if (!otherBackBet && !otherLayBet) {
        await db
          .delete(screenshotUpload)
          .where(eq(screenshotUpload.id, screenshot.id));
      }
    }

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId,
      entityType: kind === "back" ? "back_bet" : "lay_bet",
      entityId: id,
      action: "delete",
      changes: {
        market: existing.market,
        selection: existing.selection,
        odds: existing.odds,
        stake: existing.stake,
        status: existing.status,
        profitLoss: existing.profitLoss ?? null,
        linkedTransactionsDeleted: existing.status === "settled",
      },
      notes: `Deleted ${kind} bet: ${existing.selection} @ ${existing.odds}`,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to delete bet");
  }
}

/**
 * Delete a matched bet by ID.
 * Options:
 * - cascade: true = also delete the linked back/lay bets and their screenshots
 * - cascade: false = only delete the matched bet, leave back/lay bets orphaned
 * Creates audit entries.
 */
export async function deleteMatchedBet({
  id,
  userId,
  cascade = false,
}: {
  id: string;
  userId: string;
  cascade?: boolean;
}) {
  try {
    // Verify the matched bet exists and belongs to user
    const [existing] = await db
      .select()
      .from(matchedBet)
      .where(and(eq(matchedBet.id, id), eq(matchedBet.userId, userId)));

    if (!existing) {
      return null;
    }

    // Check for linked free bets that used this matched bet
    const linkedFreeBets = await db
      .select({ id: freeBet.id })
      .from(freeBet)
      .where(eq(freeBet.usedInMatchedBetId, id));

    // Unlink free bets - set usedInMatchedBetId to null and status back to active
    for (const fb of linkedFreeBets) {
      await db
        .update(freeBet)
        .set({ usedInMatchedBetId: null, status: "active" })
        .where(eq(freeBet.id, fb.id));
    }

    // Check for qualifying bets referencing this matched bet
    const linkedQualifyingBets = await db
      .select({
        id: qualifyingBet.id,
        freeBetId: qualifyingBet.freeBetId,
        contribution: qualifyingBet.contribution,
      })
      .from(qualifyingBet)
      .where(eq(qualifyingBet.matchedBetId, id));

    // Remove qualifying bet references and update progress
    for (const qb of linkedQualifyingBets) {
      // Get the free bet to update progress
      const [fb] = await db
        .select()
        .from(freeBet)
        .where(eq(freeBet.id, qb.freeBetId));

      if (fb) {
        const currentProgress = Number.parseFloat(fb.unlockProgress ?? "0");
        const contribution = Number.parseFloat(qb.contribution);
        const newProgress = Math.max(0, currentProgress - contribution);

        await db
          .update(freeBet)
          .set({ unlockProgress: newProgress.toString() })
          .where(eq(freeBet.id, fb.id));
      }

      // Delete the qualifying bet link
      await db.delete(qualifyingBet).where(eq(qualifyingBet.id, qb.id));
    }

    // Handle bonus qualifying bets referencing this matched bet (deposit bonus progress)
    const linkedBonusQualifyingBets = await db
      .select({
        id: bonusQualifyingBet.id,
        depositBonusId: bonusQualifyingBet.depositBonusId,
        stake: bonusQualifyingBet.stake,
        qualified: bonusQualifyingBet.qualified,
      })
      .from(bonusQualifyingBet)
      .where(eq(bonusQualifyingBet.matchedBetId, id));

    // Remove bonus qualifying bet references and update deposit bonus progress
    for (const bqb of linkedBonusQualifyingBets) {
      if (bqb.qualified === "true") {
        const stakeValue = Number.parseFloat(bqb.stake);

        // Get the deposit bonus
        const [bonus] = await db
          .select()
          .from(depositBonus)
          .where(eq(depositBonus.id, bqb.depositBonusId));

        if (bonus) {
          const currentProgress = Number.parseFloat(bonus.wageringProgress ?? "0");
          const requirement = Number.parseFloat(bonus.wageringRequirement ?? "0");
          const newProgress = Math.max(0, currentProgress - stakeValue);

          const updates: Record<string, unknown> = {
            wageringProgress: newProgress.toString(),
          };

          // If bonus was cleared but now falls below requirement, revert to active
          if (bonus.status === "cleared" && newProgress < requirement) {
            updates.status = "active";
            updates.clearedAt = null;
          }

          await db
            .update(depositBonus)
            .set(updates)
            .where(eq(depositBonus.id, bqb.depositBonusId));

          // Create audit entry for progress update
          await db.insert(auditLog).values({
            createdAt: new Date(),
            userId,
            entityType: "deposit_bonus",
            entityId: bqb.depositBonusId,
            action: "update",
            changes: {
              previousProgress: currentProgress,
              removedStake: stakeValue,
              newProgress,
              reason: "matched_bet_deleted",
              statusReverted: updates.status === "active" ? true : undefined,
            },
            notes: `Wagering progress reduced due to matched bet deletion: ${newProgress.toFixed(2)} / ${requirement.toFixed(2)}`,
          });
        }
      }

      // Delete the bonus qualifying bet link
      await db.delete(bonusQualifyingBet).where(eq(bonusQualifyingBet.id, bqb.id));
    }

    // Handle free bet winnings wagering bets referencing this matched bet
    const linkedFreeBetWageringBets = await db
      .select({
        id: freeBetWageringBet.id,
        freeBetId: freeBetWageringBet.freeBetId,
        stake: freeBetWageringBet.stake,
        qualified: freeBetWageringBet.qualified,
      })
      .from(freeBetWageringBet)
      .where(eq(freeBetWageringBet.matchedBetId, id));

    for (const wager of linkedFreeBetWageringBets) {
      if (wager.qualified === "true") {
        const stakeValue = Number.parseFloat(wager.stake);
        const [fb] = await db
          .select()
          .from(freeBet)
          .where(eq(freeBet.id, wager.freeBetId));

        if (fb) {
          const currentProgress = Number.parseFloat(
            fb.winWageringProgress ?? "0"
          );
          const requirement = Number.parseFloat(
            fb.winWageringRequirement ?? "0"
          );
          const newProgress = Math.max(0, currentProgress - stakeValue);

          const updates: Record<string, unknown> = {
            winWageringProgress: newProgress.toString(),
          };

          if (fb.winWageringCompletedAt && newProgress < requirement) {
            updates.winWageringCompletedAt = null;
          }

          await db
            .update(freeBet)
            .set(updates)
            .where(eq(freeBet.id, wager.freeBetId));

          await db.insert(auditLog).values({
            createdAt: new Date(),
            userId,
            entityType: "free_bet",
            entityId: wager.freeBetId,
            action: "update",
            changes: {
              previousProgress: currentProgress,
              removedStake: stakeValue,
              newProgress,
              reason: "matched_bet_deleted",
            },
            notes: `Winnings wagering progress reduced due to matched bet deletion: ${newProgress.toFixed(2)} / ${requirement.toFixed(2)}`,
          });
        }
      }

      await db
        .delete(freeBetWageringBet)
        .where(eq(freeBetWageringBet.id, wager.id));
    }

    if (cascade) {
      // Delete back bet if exists
      if (existing.backBetId) {
        await deleteBet({ id: existing.backBetId, kind: "back", userId });
      }
      // Delete lay bet if exists
      if (existing.layBetId) {
        await deleteBet({ id: existing.layBetId, kind: "lay", userId });
      }
    }

    // Delete audit entries for this matched bet (after cascade cleanup)
    await db
      .delete(auditLog)
      .where(
        and(eq(auditLog.entityType, "matched_bet"), eq(auditLog.entityId, id))
      );

    // Delete the matched bet
    await db.delete(matchedBet).where(eq(matchedBet.id, id));

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId,
      entityType: "matched_bet",
      entityId: id,
      action: "delete",
      changes: {
        market: existing.market,
        selection: existing.selection,
        promoType: existing.promoType,
        cascade,
      },
      notes: `Deleted matched bet: ${existing.selection}${cascade ? " (with cascade)" : ""}`,
    });

    return { success: true, cascade };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete matched bet"
    );
  }
}

// ============================================================================
// iOS Shortcut API Key Management
// ============================================================================

/**
 * Generate a new shortcut API key for a user.
 * Returns the plaintext key (only time it's visible) and stores the hash.
 * The key is a 64-character hex string (256-bit random).
 *
 * Why: Enables authentication for iOS Shortcut API requests without session cookies.
 */
export async function generateShortcutApiKey({
  userId,
}: {
  userId: string;
}): Promise<{
  key: string;
  hint: string;
  createdAt: Date;
}> {
  try {
    // Generate 32 random bytes (256 bits) as hex string
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const key = Array.from(keyBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Hash the key using SHA-256 for storage
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(key)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Get last 8 characters for display hint
    const hint = key.slice(-8);
    const now = new Date();

    await db
      .insert(userSettings)
      .values({
        userId,
        shortcutApiKeyHash: hash,
        shortcutApiKeyHint: hint,
        shortcutApiKeyCreatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          shortcutApiKeyHash: hash,
          shortcutApiKeyHint: hint,
          shortcutApiKeyCreatedAt: now,
          updatedAt: now,
        },
      });

    return { key, hint, createdAt: now };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to generate API key"
    );
  }
}

/**
 * Validate a shortcut API key and return the user ID if valid.
 * Also checks rate limiting (10 seconds between requests).
 *
 * Returns: { valid: true, userId } or { valid: false, error, retryAfter? }
 */
export async function validateShortcutApiKey(
  key: string
): Promise<
  | { valid: true; userId: string }
  | { valid: false; error: "invalid" | "rate_limited"; retryAfter?: number }
> {
  try {
    // Hash the provided key
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(key)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Look up the user by hash
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.shortcutApiKeyHash, hash))
      .limit(1);

    if (!settings) {
      return { valid: false, error: "invalid" };
    }

    // Check rate limiting (10 seconds between requests)
    const now = new Date();
    if (settings.lastShortcutRequestAt) {
      const elapsed = now.getTime() - settings.lastShortcutRequestAt.getTime();
      const minInterval = 10000; // 10 seconds
      if (elapsed < minInterval) {
        const retryAfter = Math.ceil((minInterval - elapsed) / 1000);
        return { valid: false, error: "rate_limited", retryAfter };
      }
    }

    // Update last request timestamp
    await db
      .update(userSettings)
      .set({ lastShortcutRequestAt: now, updatedAt: now })
      .where(eq(userSettings.id, settings.id));

    return { valid: true, userId: settings.userId };
  } catch (_error) {
    // On error, treat as invalid to avoid leaking information
    return { valid: false, error: "invalid" };
  }
}

/**
 * Revoke a user's shortcut API key.
 * Immediately invalidates the key.
 */
export async function revokeShortcutApiKey({
  userId,
}: {
  userId: string;
}): Promise<boolean> {
  try {
    const [result] = await db
      .update(userSettings)
      .set({
        shortcutApiKeyHash: null,
        shortcutApiKeyHint: null,
        shortcutApiKeyCreatedAt: null,
        lastShortcutRequestAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, userId))
      .returning({ id: userSettings.id });

    return !!result;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to revoke API key");
  }
}

/**
 * Get the shortcut API key info for display (hint only, not the full key).
 */
export async function getShortcutApiKeyInfo({
  userId,
}: {
  userId: string;
}): Promise<{
  hasKey: boolean;
  hint: string | null;
  createdAt: Date | null;
} | null> {
  try {
    const settings = await getUserSettings({ userId });

    if (!settings) {
      return { hasKey: false, hint: null, createdAt: null };
    }

    return {
      hasKey: !!settings.shortcutApiKeyHash,
      hint: settings.shortcutApiKeyHint ?? null,
      createdAt: settings.shortcutApiKeyCreatedAt ?? null,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get API key info"
    );
  }
}

// =============================================================================
// WALLET QUERIES
// =============================================================================

/**
 * Wallet type definitions for API responses and form data
 */
export interface CreateWalletParams {
  userId: string;
  name: string;
  type: WalletType;
  currency: string;
  notes?: string | null;
}

export interface UpdateWalletParams {
  name?: string;
  type?: WalletType;
  currency?: string;
  notes?: string | null;
  status?: WalletStatus;
}

export interface WalletWithBalance {
  id: string;
  createdAt: Date;
  userId: string;
  name: string;
  type: WalletType;
  currency: string;
  notes: string | null;
  status: WalletStatus;
  balance: number;
}

/**
 * Create a new wallet for a user.
 */
export async function createWallet(params: CreateWalletParams) {
  try {
    const [created] = await db
      .insert(wallet)
      .values({
        userId: params.userId,
        name: params.name,
        type: params.type,
        currency: params.currency,
        notes: params.notes ?? null,
        status: "active",
        createdAt: new Date(),
      })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create wallet");
  }
}

/**
 * Get a wallet by ID.
 */
export async function getWalletById(id: string) {
  try {
    const [found] = await db.select().from(wallet).where(eq(wallet.id, id));
    return found ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get wallet");
  }
}

/**
 * List all wallets for a user with calculated balances.
 */
export async function listWalletsByUser(
  userId: string
): Promise<WalletWithBalance[]> {
  try {
    const wallets = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, userId))
      .orderBy(desc(wallet.createdAt));

    // Calculate balance for each wallet
    const walletsWithBalance: WalletWithBalance[] = [];
    for (const w of wallets) {
      const balance = await calculateWalletBalance(w.id);
      walletsWithBalance.push({
        id: w.id,
        createdAt: w.createdAt,
        userId: w.userId,
        name: w.name,
        type: w.type as WalletType,
        currency: w.currency,
        notes: w.notes,
        status: w.status as WalletStatus,
        balance,
      });
    }

    return walletsWithBalance;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list wallets");
  }
}

/**
 * List active wallets for a user (for dropdown selectors).
 */
export async function listActiveWalletsByUser(userId: string) {
  try {
    return await db
      .select()
      .from(wallet)
      .where(and(eq(wallet.userId, userId), eq(wallet.status, "active")))
      .orderBy(asc(wallet.name));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list active wallets"
    );
  }
}

/**
 * Update a wallet.
 */
export async function updateWallet(id: string, params: UpdateWalletParams) {
  try {
    const [updated] = await db
      .update(wallet)
      .set(params)
      .where(eq(wallet.id, id))
      .returning();
    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update wallet");
  }
}

/**
 * Archive a wallet (soft delete).
 */
export async function archiveWallet(id: string) {
  return updateWallet(id, { status: "archived" });
}

/**
 * Delete a wallet and all its transactions (hard delete).
 */
export async function deleteWallet(id: string) {
  try {
    // First delete all transactions
    await db
      .delete(walletTransaction)
      .where(eq(walletTransaction.walletId, id));
    // Then delete the wallet
    await db.delete(wallet).where(eq(wallet.id, id));
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to delete wallet");
  }
}

/**
 * Calculate wallet balance from transactions.
 * Balance = deposits + transfer_from_account + transfer_from_wallet + adjustment
 *         - withdrawals - transfer_to_account - transfer_to_wallet - fee
 */
export async function calculateWalletBalance(
  walletId: string
): Promise<number> {
  try {
    const transactions = await db
      .select({
        type: walletTransaction.type,
        amount: walletTransaction.amount,
      })
      .from(walletTransaction)
      .where(eq(walletTransaction.walletId, walletId));

    let balance = 0;
    for (const tx of transactions) {
      const amount = Number(tx.amount);
      switch (tx.type) {
        case "deposit":
        case "transfer_from_account":
        case "transfer_from_wallet":
          balance += amount;
          break;
        case "withdrawal":
        case "transfer_to_account":
        case "transfer_to_wallet":
        case "fee":
          balance -= amount;
          break;
        case "adjustment":
          balance += amount; // Can be positive or negative
          break;
      }
    }

    return balance;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to calculate wallet balance"
    );
  }
}

// =============================================================================
// WALLET TRANSACTION QUERIES
// =============================================================================

export interface CreateWalletTransactionParams {
  walletId: string;
  type: WalletTransactionType;
  amount: number;
  currency: string;
  date: Date;
  relatedAccountId?: string | null;
  relatedWalletId?: string | null;
  linkedAccountTransactionId?: string | null;
  externalRef?: string | null;
  notes?: string | null;
}

/**
 * Create a wallet transaction.
 */
export async function createWalletTransaction(
  params: CreateWalletTransactionParams
) {
  try {
    const [created] = await db
      .insert(walletTransaction)
      .values({
        walletId: params.walletId,
        type: params.type,
        amount: params.amount.toString(),
        currency: params.currency,
        date: params.date,
        relatedAccountId: params.relatedAccountId ?? null,
        relatedWalletId: params.relatedWalletId ?? null,
        linkedAccountTransactionId: params.linkedAccountTransactionId ?? null,
        externalRef: params.externalRef ?? null,
        notes: params.notes ?? null,
        createdAt: new Date(),
      })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create wallet transaction"
    );
  }
}

/**
 * Get wallet transaction by ID.
 */
export async function getWalletTransactionById(id: string) {
  try {
    const [found] = await db
      .select()
      .from(walletTransaction)
      .where(eq(walletTransaction.id, id));
    return found ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get wallet transaction"
    );
  }
}

/**
 * List transactions for a wallet.
 */
export async function listWalletTransactions(walletId: string) {
  try {
    return await db
      .select()
      .from(walletTransaction)
      .where(eq(walletTransaction.walletId, walletId))
      .orderBy(desc(walletTransaction.date), desc(walletTransaction.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list wallet transactions"
    );
  }
}

/**
 * List wallet transactions with related entity names.
 */
export async function listWalletTransactionsWithDetails(walletId: string) {
  try {
    const relatedAccount = aliasedTable(account, "relatedAccount");
    const relatedWallet = aliasedTable(wallet, "relatedWallet");

    const transactions = await db
      .select({
        id: walletTransaction.id,
        createdAt: walletTransaction.createdAt,
        walletId: walletTransaction.walletId,
        type: walletTransaction.type,
        amount: walletTransaction.amount,
        currency: walletTransaction.currency,
        relatedAccountId: walletTransaction.relatedAccountId,
        relatedWalletId: walletTransaction.relatedWalletId,
        externalRef: walletTransaction.externalRef,
        date: walletTransaction.date,
        notes: walletTransaction.notes,
        relatedAccountName: relatedAccount.name,
        relatedWalletName: relatedWallet.name,
      })
      .from(walletTransaction)
      .leftJoin(
        relatedAccount,
        eq(walletTransaction.relatedAccountId, relatedAccount.id)
      )
      .leftJoin(
        relatedWallet,
        eq(walletTransaction.relatedWalletId, relatedWallet.id)
      )
      .where(eq(walletTransaction.walletId, walletId))
      .orderBy(desc(walletTransaction.date), desc(walletTransaction.createdAt));

    return transactions;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list wallet transactions"
    );
  }
}

/**
 * Delete a wallet transaction.
 * If the transaction is linked to an account transaction, that is also deleted.
 */
export async function deleteWalletTransaction(id: string, userId?: string) {
  try {
    // First get the transaction to check for linked account transaction
    const [existing] = await db
      .select()
      .from(walletTransaction)
      .where(eq(walletTransaction.id, id));

    if (!existing) {
      return null;
    }

    // If there's a linked account transaction, delete it first
    if (existing.linkedAccountTransactionId && userId) {
      await db
        .delete(accountTransaction)
        .where(
          and(
            eq(accountTransaction.id, existing.linkedAccountTransactionId),
            eq(accountTransaction.userId, userId)
          )
        );
    }

    await db.delete(walletTransaction).where(eq(walletTransaction.id, id));
    return { success: true };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete wallet transaction"
    );
  }
}

/**
 * Create a linked transfer from wallet to betting account.
 * Creates both a WalletTransaction and an AccountTransaction.
 * Supports cross-currency transfers with separate amounts for wallet and account.
 * The transactions are linked so deleting one will delete the other.
 */
export async function createTransferToAccount(params: {
  walletId: string;
  accountId: string;
  amount: number; // Account amount
  currency: string; // Account currency
  walletAmount?: number; // Wallet amount (defaults to amount)
  walletCurrency?: string; // Wallet currency (defaults to currency)
  date: Date;
  notes?: string | null;
  userId: string;
}) {
  const walletAmount = params.walletAmount ?? params.amount;
  const walletCurrency = params.walletCurrency ?? params.currency;

  try {
    // First create the wallet transaction (outgoing)
    const walletTx = await createWalletTransaction({
      walletId: params.walletId,
      type: "transfer_to_account",
      amount: walletAmount,
      currency: walletCurrency,
      date: params.date,
      relatedAccountId: params.accountId,
      notes: params.notes,
    });

    // Create account transaction (incoming deposit) with link to wallet tx
    const accountTx = await createAccountTransaction({
      userId: params.userId,
      accountId: params.accountId,
      type: "deposit",
      amount: params.amount,
      currency: params.currency,
      occurredAt: params.date,
      notes: params.notes
        ? `From wallet: ${params.notes}`
        : "Transfer from wallet",
      linkedWalletTransactionId: walletTx.id,
    });

    // Update wallet transaction with link back to account tx
    await db
      .update(walletTransaction)
      .set({ linkedAccountTransactionId: accountTx.id })
      .where(eq(walletTransaction.id, walletTx.id));

    return { walletTx: { ...walletTx, linkedAccountTransactionId: accountTx.id }, accountTx };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create transfer to account"
    );
  }
}

/**
 * Create a linked transfer from betting account to wallet.
 * Creates both an AccountTransaction and a WalletTransaction.
 * Supports cross-currency transfers with separate amounts for wallet and account.
 * The transactions are linked so deleting one will delete the other.
 */
export async function createTransferFromAccount(params: {
  walletId: string;
  accountId: string;
  amount: number; // Account amount
  currency: string; // Account currency
  walletAmount?: number; // Wallet amount (defaults to amount)
  walletCurrency?: string; // Wallet currency (defaults to currency)
  date: Date;
  notes?: string | null;
  userId: string;
}) {
  const walletAmount = params.walletAmount ?? params.amount;
  const walletCurrency = params.walletCurrency ?? params.currency;

  try {
    // First create the account transaction (outgoing withdrawal)
    const accountTx = await createAccountTransaction({
      userId: params.userId,
      accountId: params.accountId,
      type: "withdrawal",
      amount: params.amount, // Positive - balance calculation handles sign based on type
      currency: params.currency,
      occurredAt: params.date,
      notes: params.notes ? `To wallet: ${params.notes}` : "Transfer to wallet",
    });

    // Create wallet transaction (incoming) with link to account tx
    const walletTx = await createWalletTransaction({
      walletId: params.walletId,
      type: "transfer_from_account",
      amount: walletAmount,
      currency: walletCurrency,
      date: params.date,
      relatedAccountId: params.accountId,
      notes: params.notes,
      linkedAccountTransactionId: accountTx.id,
    });

    // Update account transaction with link back to wallet tx
    await db
      .update(accountTransaction)
      .set({ linkedWalletTransactionId: walletTx.id })
      .where(eq(accountTransaction.id, accountTx.id));

    return { walletTx, accountTx: { ...accountTx, linkedWalletTransactionId: walletTx.id } };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create transfer from account"
    );
  }
}

/**
 * Create a linked transfer between two wallets.
 * Creates transactions on both wallets.
 */
export async function createTransferBetweenWallets(params: {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  currency: string;
  date: Date;
  notes?: string | null;
}) {
  try {
    // Create outgoing transaction on source wallet
    const fromTx = await createWalletTransaction({
      walletId: params.fromWalletId,
      type: "transfer_to_wallet",
      amount: params.amount,
      currency: params.currency,
      date: params.date,
      relatedWalletId: params.toWalletId,
      notes: params.notes,
    });

    // Create incoming transaction on destination wallet
    const toTx = await createWalletTransaction({
      walletId: params.toWalletId,
      type: "transfer_from_wallet",
      amount: params.amount,
      currency: params.currency,
      date: params.date,
      relatedWalletId: params.fromWalletId,
      notes: params.notes,
    });

    return { fromTx, toTx };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create transfer between wallets"
    );
  }
}

/**
 * Get total wallet balances for a user, converted to NOK.
 * Returns zero values if wallet table doesn't exist or query fails.
 */
export async function getWalletTotals(userId: string): Promise<{
  totalBalanceNok: number;
  fiatBalanceNok: number;
  cryptoBalanceNok: number;
  walletCount: number;
}> {
  try {
    const wallets = await listWalletsByUser(userId);
    const activeWallets = wallets.filter((w) => w.status === "active");

    let totalBalanceNok = 0;
    let fiatBalanceNok = 0;
    let cryptoBalanceNok = 0;

    for (const w of activeWallets) {
      const balanceNok = await convertAmountToNok(w.balance, w.currency);
      totalBalanceNok += balanceNok;

      if (w.type === "crypto") {
        cryptoBalanceNok += balanceNok;
      } else {
        fiatBalanceNok += balanceNok;
      }
    }

    return {
      totalBalanceNok,
      fiatBalanceNok,
      cryptoBalanceNok,
      walletCount: activeWallets.length,
    };
  } catch (_error) {
    // Return empty data if wallet table doesn't exist yet or query fails
    // This allows the bankroll page to work before migrations are run
    return {
      totalBalanceNok: 0,
      fiatBalanceNok: 0,
      cryptoBalanceNok: 0,
      walletCount: 0,
    };
  }
}

// ============================================================================
// Balance Snapshots
// ============================================================================

/**
 * Create a balance snapshot for a user.
 * Called by cron job twice daily to track total capital over time.
 */
export async function createBalanceSnapshot({
  userId,
  totalCapitalNok,
  accountsNok,
  walletsNok,
}: {
  userId: string;
  totalCapitalNok: number;
  accountsNok?: number;
  walletsNok?: number;
}): Promise<void> {
  try {
    await db.insert(balanceSnapshot).values({
      createdAt: new Date(),
      userId,
      totalCapitalNok: totalCapitalNok.toFixed(2),
      accountsNok: accountsNok?.toFixed(2) ?? null,
      walletsNok: walletsNok?.toFixed(2) ?? null,
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create balance snapshot"
    );
  }
}

/**
 * Get balance snapshots for a user within a date range.
 * Returns snapshots for building the balance trend chart.
 */
export async function getBalanceSnapshots({
  userId,
  startDate,
  endDate,
  limit = 1000,
}: {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<
  Array<{
    createdAt: Date;
    totalCapitalNok: number;
    accountsNok: number | null;
    walletsNok: number | null;
  }>
> {
  try {
    const conditions: SQL[] = [eq(balanceSnapshot.userId, userId)];

    if (startDate) {
      conditions.push(gte(balanceSnapshot.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(balanceSnapshot.createdAt, endDate));
    }

    const rows = await db
      .select({
        createdAt: balanceSnapshot.createdAt,
        totalCapitalNok: balanceSnapshot.totalCapitalNok,
        accountsNok: balanceSnapshot.accountsNok,
        walletsNok: balanceSnapshot.walletsNok,
      })
      .from(balanceSnapshot)
      .where(and(...conditions))
      .orderBy(asc(balanceSnapshot.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      createdAt: row.createdAt,
      totalCapitalNok: Number.parseFloat(row.totalCapitalNok ?? "0"),
      accountsNok: row.accountsNok
        ? Number.parseFloat(row.accountsNok)
        : null,
      walletsNok: row.walletsNok ? Number.parseFloat(row.walletsNok) : null,
    }));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get balance snapshots"
    );
  }
}

/**
 * Get all user IDs for taking balance snapshots.
 * Used by cron job to iterate over all users.
 */
export async function getAllUserIds(): Promise<string[]> {
  try {
    const rows = await db.select({ id: user.id }).from(user);
    return rows.map((r) => r.id);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get user IDs");
  }
}

// ============================================================================
// DEPOSIT BONUS QUERIES
// ============================================================================

export type CreateDepositBonusParams = {
  userId: string;
  accountId: string;
  name: string;
  depositAmount: number;
  bonusAmount: number;
  currency: string;
  wageringMultiplier: number;
  wageringBase: WageringBase;
  minOdds: number;
  maxBetPercent?: number | null;
  expiresAt?: Date | null;
  linkedTransactionId?: string | null;
  notes?: string | null;
};

/**
 * Calculate wagering requirement based on base type.
 */
function calculateWageringRequirement(
  depositAmount: number,
  bonusAmount: number,
  wageringBase: WageringBase,
  wageringMultiplier: number
): number {
  let base: number;
  switch (wageringBase) {
    case "deposit":
      base = depositAmount;
      break;
    case "bonus":
      base = bonusAmount;
      break;
    case "deposit_plus_bonus":
      base = depositAmount + bonusAmount;
      break;
    default:
      base = depositAmount;
  }
  return base * wageringMultiplier;
}

/**
 * Create a new deposit bonus.
 */
export async function createDepositBonus(params: CreateDepositBonusParams) {
  try {
    const wageringRequirement = calculateWageringRequirement(
      params.depositAmount,
      params.bonusAmount,
      params.wageringBase,
      params.wageringMultiplier
    );

    const [result] = await db
      .insert(depositBonus)
      .values({
        createdAt: new Date(),
        userId: params.userId,
        accountId: params.accountId,
        name: params.name,
        depositAmount: params.depositAmount.toString(),
        bonusAmount: params.bonusAmount.toString(),
        currency: params.currency.toUpperCase(),
        wageringMultiplier: params.wageringMultiplier.toString(),
        wageringBase: params.wageringBase,
        wageringRequirement: wageringRequirement.toString(),
        wageringProgress: "0",
        minOdds: params.minOdds.toString(),
        maxBetPercent: params.maxBetPercent?.toString() ?? null,
        expiresAt: params.expiresAt ?? null,
        status: "active",
        linkedTransactionId: params.linkedTransactionId ?? null,
        notes: params.notes ?? null,
      })
      .returning();

    // Create audit entry
    await db.insert(auditLog).values({
      createdAt: new Date(),
      userId: params.userId,
      entityType: "deposit_bonus",
      entityId: result.id,
      action: "create",
      changes: {
        depositAmount: params.depositAmount,
        bonusAmount: params.bonusAmount,
        wageringRequirement,
      },
      notes: `Created deposit bonus: ${params.name}`,
    });

    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create deposit bonus"
    );
  }
}

/**
 * Get a deposit bonus by ID.
 */
export async function getDepositBonusById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .select({
        id: depositBonus.id,
        createdAt: depositBonus.createdAt,
        userId: depositBonus.userId,
        accountId: depositBonus.accountId,
        name: depositBonus.name,
        depositAmount: depositBonus.depositAmount,
        bonusAmount: depositBonus.bonusAmount,
        currency: depositBonus.currency,
        wageringMultiplier: depositBonus.wageringMultiplier,
        wageringBase: depositBonus.wageringBase,
        wageringRequirement: depositBonus.wageringRequirement,
        wageringProgress: depositBonus.wageringProgress,
        minOdds: depositBonus.minOdds,
        maxBetPercent: depositBonus.maxBetPercent,
        expiresAt: depositBonus.expiresAt,
        status: depositBonus.status,
        linkedTransactionId: depositBonus.linkedTransactionId,
        clearedAt: depositBonus.clearedAt,
        notes: depositBonus.notes,
        accountName: account.name,
      })
      .from(depositBonus)
      .leftJoin(account, eq(depositBonus.accountId, account.id))
      .where(and(eq(depositBonus.id, id), eq(depositBonus.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to fetch deposit bonus"
    );
  }
}

/**
 * List all deposit bonuses for a user.
 * Can optionally filter by status.
 */
export async function listDepositBonusesByUser({
  userId,
  status,
  limit = 100,
}: {
  userId: string;
  status?: DepositBonusStatus;
  limit?: number;
}) {
  try {
    const conditions: SQL[] = [eq(depositBonus.userId, userId)];
    if (status) {
      conditions.push(eq(depositBonus.status, status));
    }

    return await db
      .select({
        id: depositBonus.id,
        createdAt: depositBonus.createdAt,
        userId: depositBonus.userId,
        accountId: depositBonus.accountId,
        name: depositBonus.name,
        depositAmount: depositBonus.depositAmount,
        bonusAmount: depositBonus.bonusAmount,
        currency: depositBonus.currency,
        wageringMultiplier: depositBonus.wageringMultiplier,
        wageringBase: depositBonus.wageringBase,
        wageringRequirement: depositBonus.wageringRequirement,
        wageringProgress: depositBonus.wageringProgress,
        minOdds: depositBonus.minOdds,
        maxBetPercent: depositBonus.maxBetPercent,
        expiresAt: depositBonus.expiresAt,
        status: depositBonus.status,
        linkedTransactionId: depositBonus.linkedTransactionId,
        clearedAt: depositBonus.clearedAt,
        notes: depositBonus.notes,
        accountName: account.name,
      })
      .from(depositBonus)
      .leftJoin(account, eq(depositBonus.accountId, account.id))
      .where(and(...conditions))
      .orderBy(desc(depositBonus.createdAt))
      .limit(limit);
  } catch (_error) {
    console.error("listDepositBonusesByUser error:", _error);
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list deposit bonuses"
    );
  }
}

/**
 * List active deposit bonuses for a specific account.
 * Used to check if settled bets should contribute to wagering.
 */
export async function listActiveDepositBonusesForAccount({
  accountId,
  userId,
}: {
  accountId: string;
  userId: string;
}) {
  try {
    return await db
      .select()
      .from(depositBonus)
      .where(
        and(
          eq(depositBonus.accountId, accountId),
          eq(depositBonus.userId, userId),
          eq(depositBonus.status, "active")
        )
      )
      .orderBy(asc(depositBonus.expiresAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list active deposit bonuses for account"
    );
  }
}

export type UpdateDepositBonusParams = {
  id: string;
  userId: string;
  name?: string;
  expiresAt?: Date | null;
  notes?: string | null;
  status?: DepositBonusStatus;
};

/**
 * Update a deposit bonus.
 */
export async function updateDepositBonus(params: UpdateDepositBonusParams) {
  try {
    const updates: Record<string, unknown> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.expiresAt !== undefined) updates.expiresAt = params.expiresAt;
    if (params.notes !== undefined) updates.notes = params.notes;
    if (params.status !== undefined) updates.status = params.status;

    if (Object.keys(updates).length === 0) {
      return await getDepositBonusById({
        id: params.id,
        userId: params.userId,
      });
    }

    const [result] = await db
      .update(depositBonus)
      .set(updates)
      .where(
        and(eq(depositBonus.id, params.id), eq(depositBonus.userId, params.userId))
      )
      .returning();

    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update deposit bonus"
    );
  }
}

/**
 * Update wagering progress for a deposit bonus.
 * If progress >= requirement, automatically mark as cleared.
 */
export async function updateDepositBonusProgress({
  id,
  userId,
  additionalProgress,
}: {
  id: string;
  userId: string;
  additionalProgress: number;
}) {
  try {
    // Get current bonus state
    const bonus = await getDepositBonusById({ id, userId });
    if (!bonus || bonus.status !== "active") {
      return null;
    }

    const currentProgress = Number.parseFloat(bonus.wageringProgress ?? "0");
    const requirement = Number.parseFloat(bonus.wageringRequirement ?? "0");
    const newProgress = currentProgress + additionalProgress;

    const updates: Record<string, unknown> = {
      wageringProgress: newProgress.toString(),
    };

    // Check if wagering is now complete
    if (newProgress >= requirement) {
      updates.status = "cleared";
      updates.clearedAt = new Date();
    }

    const [result] = await db
      .update(depositBonus)
      .set(updates)
      .where(
        and(eq(depositBonus.id, id), eq(depositBonus.userId, userId))
      )
      .returning();

    // Create audit entry for progress update
    if (result) {
      await db.insert(auditLog).values({
        createdAt: new Date(),
        userId,
        entityType: "deposit_bonus",
        entityId: id,
        action: updates.status === "cleared" ? "status_change" : "update",
        changes: {
          previousProgress: currentProgress,
          additionalProgress,
          newProgress,
          cleared: updates.status === "cleared",
        },
        notes: updates.status === "cleared"
          ? "Wagering complete - bonus cleared"
          : `Wagering progress updated: ${newProgress.toFixed(2)} / ${requirement.toFixed(2)}`,
      });
    }

    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update deposit bonus progress"
    );
  }
}

/**
 * Mark a deposit bonus as forfeited.
 */
export async function forfeitDepositBonus({
  id,
  userId,
  reason,
}: {
  id: string;
  userId: string;
  reason?: string;
}) {
  try {
    const [result] = await db
      .update(depositBonus)
      .set({ status: "forfeited" })
      .where(
        and(eq(depositBonus.id, id), eq(depositBonus.userId, userId))
      )
      .returning();

    if (result) {
      await db.insert(auditLog).values({
        createdAt: new Date(),
        userId,
        entityType: "deposit_bonus",
        entityId: id,
        action: "status_change",
        changes: { status: "forfeited" },
        notes: reason ?? "Bonus forfeited",
      });
    }

    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to forfeit deposit bonus"
    );
  }
}

/**
 * Delete a deposit bonus and its qualifying bets.
 */
export async function deleteDepositBonus({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    // Delete qualifying bets first
    await db
      .delete(bonusQualifyingBet)
      .where(eq(bonusQualifyingBet.depositBonusId, id));

    // Delete the bonus
    const [result] = await db
      .delete(depositBonus)
      .where(
        and(eq(depositBonus.id, id), eq(depositBonus.userId, userId))
      )
      .returning();

    if (result) {
      await db.insert(auditLog).values({
        createdAt: new Date(),
        userId,
        entityType: "deposit_bonus",
        entityId: id,
        action: "delete",
        changes: { name: result.name },
        notes: `Deleted deposit bonus: ${result.name}`,
      });
    }

    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete deposit bonus"
    );
  }
}

/**
 * Add a qualifying bet to a deposit bonus.
 * If the bet meets min odds, it contributes to wagering progress.
 */
export async function addBonusQualifyingBet({
  depositBonusId,
  backBetId,
  matchedBetId,
  stake,
  odds,
  userId,
}: {
  depositBonusId: string;
  backBetId?: string | null;
  matchedBetId?: string | null;
  stake: number;
  odds: number;
  userId: string;
}) {
  try {
    // Get the bonus to check min odds
    const bonus = await getDepositBonusById({ id: depositBonusId, userId });
    if (!bonus || bonus.status !== "active") {
      return null;
    }

    const minOdds = Number.parseFloat(bonus.minOdds ?? "0");
    const qualified = odds >= minOdds;

    // Insert the qualifying bet record
    const [result] = await db
      .insert(bonusQualifyingBet)
      .values({
        createdAt: new Date(),
        depositBonusId,
        backBetId: backBetId ?? null,
        matchedBetId: matchedBetId ?? null,
        stake: stake.toString(),
        odds: odds.toString(),
        qualified: qualified ? "true" : "false",
      })
      .returning();

    // If qualified, update wagering progress
    if (qualified) {
      await updateDepositBonusProgress({
        id: depositBonusId,
        userId,
        additionalProgress: stake,
      });
    }

    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to add bonus qualifying bet"
    );
  }
}

/**
 * List qualifying bets for a deposit bonus.
 */
export async function listBonusQualifyingBets({
  depositBonusId,
  limit = 100,
}: {
  depositBonusId: string;
  limit?: number;
}) {
  try {
    return await db
      .select({
        id: bonusQualifyingBet.id,
        createdAt: bonusQualifyingBet.createdAt,
        depositBonusId: bonusQualifyingBet.depositBonusId,
        backBetId: bonusQualifyingBet.backBetId,
        matchedBetId: bonusQualifyingBet.matchedBetId,
        stake: bonusQualifyingBet.stake,
        odds: bonusQualifyingBet.odds,
        qualified: bonusQualifyingBet.qualified,
        // Join back bet info
        backBetMarket: backBet.market,
        backBetSelection: backBet.selection,
        backBetPlacedAt: backBet.placedAt,
        // Join matched bet info
        matchedBetMarket: matchedBet.market,
        matchedBetSelection: matchedBet.selection,
      })
      .from(bonusQualifyingBet)
      .leftJoin(backBet, eq(bonusQualifyingBet.backBetId, backBet.id))
      .leftJoin(matchedBet, eq(bonusQualifyingBet.matchedBetId, matchedBet.id))
      .where(eq(bonusQualifyingBet.depositBonusId, depositBonusId))
      .orderBy(desc(bonusQualifyingBet.createdAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list bonus qualifying bets"
    );
  }
}

/**
 * Get summary of active deposit bonuses for a user.
 */
export async function getActiveDepositBonusesSummary({
  userId,
}: {
  userId: string;
}): Promise<{
  count: number;
  totalBonusValue: number;
  totalWageringRemaining: number;
}> {
  try {
    const bonuses = await listDepositBonusesByUser({ userId, status: "active" });
    
    let totalBonusValue = 0;
    let totalWageringRemaining = 0;

    for (const bonus of bonuses) {
      totalBonusValue += Number.parseFloat(bonus.bonusAmount ?? "0");
      const requirement = Number.parseFloat(bonus.wageringRequirement ?? "0");
      const progress = Number.parseFloat(bonus.wageringProgress ?? "0");
      totalWageringRemaining += Math.max(0, requirement - progress);
    }

    return {
      count: bonuses.length,
      totalBonusValue,
      totalWageringRemaining,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get deposit bonus summary"
    );
  }
}

/**
 * Count deposit bonuses expiring within N days.
 */
export async function countExpiringDepositBonuses({
  userId,
  daysUntilExpiry = 7,
}: {
  userId: string;
  daysUntilExpiry?: number;
}): Promise<number> {
  try {
    const now = new Date();
    const expiryThreshold = new Date(
      now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000
    );

    const [result] = await db
      .select({ count: count() })
      .from(depositBonus)
      .where(
        and(
          eq(depositBonus.userId, userId),
          eq(depositBonus.status, "active"),
          isNotNull(depositBonus.expiresAt),
          lte(depositBonus.expiresAt, expiryThreshold)
        )
      );

    return result?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count expiring deposit bonuses"
    );
  }
}

/**
 * Get recent deposit transactions for an account (for linking to bonus).
 */
export async function getRecentDepositsForAccount({
  accountId,
  userId,
  limit = 10,
}: {
  accountId: string;
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select({
        id: accountTransaction.id,
        amount: accountTransaction.amount,
        currency: accountTransaction.currency,
        occurredAt: accountTransaction.occurredAt,
        notes: accountTransaction.notes,
      })
      .from(accountTransaction)
      .where(
        and(
          eq(accountTransaction.accountId, accountId),
          eq(accountTransaction.userId, userId),
          eq(accountTransaction.type, "deposit")
        )
      )
      .orderBy(desc(accountTransaction.occurredAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get recent deposits"
    );
  }
}

/**
 * Process wagering progress when a back bet settles.
 * Checks all active deposit bonuses for the account and adds qualifying bets.
 * Only counts bets placed AFTER the bonus was created.
 *
 * @param accountId - The account the bet was placed on
 * @param userId - The user ID
 * @param backBetId - The back bet ID (for standalone bets)
 * @param matchedBetId - The matched bet ID (for matched bets)
 * @param stake - The back bet stake amount
 * @param odds - The back bet odds
 * @param placedAt - When the bet was placed (to compare against bonus creation)
 */
export async function processWageringProgressOnSettle({
  accountId,
  userId,
  backBetId,
  matchedBetId,
  stake,
  odds,
  placedAt,
}: {
  accountId: string;
  userId: string;
  backBetId?: string | null;
  matchedBetId?: string | null;
  stake: number;
  odds: number;
  placedAt: Date;
}): Promise<{ bonusesUpdated: number; totalProgressAdded: number }> {
  let bonusesUpdated = 0;
  let totalProgressAdded = 0;

  try {
    // Get all active deposit bonuses for this account
    const activeBonuses = await listActiveDepositBonusesForAccount({
      accountId,
      userId,
    });

    for (const bonus of activeBonuses) {
      // Only count bets placed AFTER the bonus was created
      if (bonus.createdAt && placedAt < bonus.createdAt) {
        continue;
      }

      // Check if bet odds meet minimum requirement
      const minOdds = Number.parseFloat(bonus.minOdds ?? "0");
      const qualified = odds >= minOdds;

      // Add the qualifying bet record
      await addBonusQualifyingBet({
        depositBonusId: bonus.id,
        backBetId: backBetId ?? null,
        matchedBetId: matchedBetId ?? null,
        stake,
        odds,
        userId,
      });

      if (qualified) {
        bonusesUpdated++;
        totalProgressAdded += stake;
      }
    }

    return { bonusesUpdated, totalProgressAdded };
  } catch (error) {
    // Log but don't fail settlement if wagering tracking fails
    console.error("[processWageringProgressOnSettle] Error:", error);
    return { bonusesUpdated: 0, totalProgressAdded: 0 };
  }
}
