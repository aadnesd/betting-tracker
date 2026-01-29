import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const screenshotUpload = pgTable("ScreenshotUpload", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  kind: varchar("kind", { enum: ["back", "lay"] }).notNull(),
  url: text("url").notNull(),
  filename: text("filename"),
  contentType: varchar("contentType", { length: 64 }),
  size: numeric("size", { precision: 12, scale: 0 }),
  status: varchar("status", {
    enum: ["uploaded", "parsed", "needs_review", "error"],
  })
    .notNull()
    .default("uploaded"),
  parsedOutput: jsonb("parsedOutput"),
  confidence: jsonb("confidence"),
  error: text("error"),
});

export type ScreenshotUpload = InferSelectModel<typeof screenshotUpload>;

const accountKindEnum = ["bookmaker", "exchange"] as const;
const accountStatusEnum = ["active", "archived"] as const;

export const account = pgTable("Account", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  nameNormalized: text("nameNormalized").notNull(),
  kind: varchar("kind", { enum: accountKindEnum }).notNull(),
  currency: varchar("currency", { length: 3 }),
  commission: numeric("commission", { precision: 6, scale: 4 }),
  status: varchar("status", { enum: accountStatusEnum })
    .notNull()
    .default("active"),
  limits: jsonb("limits"),
});

export type Account = InferSelectModel<typeof account>;

export const promo = pgTable("Promo", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  type: text("type").notNull(),
  typeNormalized: text("typeNormalized").notNull(),
  minOdds: numeric("minOdds", { precision: 12, scale: 4 }),
  maxStake: numeric("maxStake", { precision: 12, scale: 2 }),
  expiry: timestamp("expiry"),
  terms: text("terms"),
});

export type Promo = InferSelectModel<typeof promo>;

const transactionTypeEnum = [
  "deposit",
  "withdrawal",
  "bonus",
  "adjustment",
] as const;

export const accountTransaction = pgTable("AccountTransaction", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountId: uuid("accountId")
    .notNull()
    .references(() => account.id),
  type: varchar("type", { enum: transactionTypeEnum }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  // Pre-computed NOK equivalent (computed at write-time to avoid FX API calls on read)
  amountNok: numeric("amountNok", { precision: 14, scale: 2 }),
  occurredAt: timestamp("occurredAt").notNull(),
  notes: text("notes"),
  // Link to corresponding wallet transaction (for deposit/withdrawal linked to wallet)
  linkedWalletTransactionId: uuid("linkedWalletTransactionId"),
  // Link to originating bet (for settlement/reversal transactions)
  // Enables cascade deletion when bet is deleted
  linkedBackBetId: uuid("linkedBackBetId").references(() => backBet.id, {
    onDelete: "cascade",
  }),
  linkedLayBetId: uuid("linkedLayBetId").references(() => layBet.id, {
    onDelete: "cascade",
  }),
});

export type AccountTransaction = InferSelectModel<typeof accountTransaction>;

const betStatusEnum = [
  "draft",
  "placed",
  "matched",
  "settled",
  "needs_review",
  "error",
] as const;

/**
 * Normalized selection type for Match Odds (1X2) bets.
 * Matches the football-data.org API's `winner` field format.
 * Why: Enables reliable auto-settlement by comparing with match result directly.
 */
export const normalizedSelectionEnum = [
  "HOME_TEAM",
  "AWAY_TEAM",
  "DRAW",
] as const;
export type NormalizedSelection = (typeof normalizedSelectionEnum)[number];

export const backBet = pgTable("BackBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountId: uuid("accountId").references(() => account.id),
  screenshotId: uuid("screenshotId")
    .references(() => screenshotUpload.id)
    .notNull(),
  matchId: uuid("matchId"),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  // Normalized selection for Match Odds: HOME_TEAM, AWAY_TEAM, DRAW (populated during match linking)
  normalizedSelection: varchar("normalizedSelection", {
    enum: ["HOME_TEAM", "AWAY_TEAM", "DRAW"],
  }),
  odds: numeric("odds", { precision: 12, scale: 4 }).notNull(),
  stake: numeric("stake", { precision: 12, scale: 2 }).notNull(),
  stakeNok: numeric("stakeNok", { precision: 14, scale: 2 }),
  exchange: text("exchange").notNull(),
  currency: varchar("currency", { length: 3 }),
  placedAt: timestamp("placedAt"),
  settledAt: timestamp("settledAt"),
  profitLoss: numeric("profitLoss", { precision: 14, scale: 2 }),
  profitLossNok: numeric("profitLossNok", { precision: 14, scale: 2 }),
  confidence: jsonb("confidence"),
  status: varchar("status", { enum: betStatusEnum }).notNull().default("draft"),
  error: text("error"),
});

export type BackBet = InferSelectModel<typeof backBet>;

export const layBet = pgTable("LayBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountId: uuid("accountId").references(() => account.id),
  screenshotId: uuid("screenshotId")
    .references(() => screenshotUpload.id)
    .notNull(),
  matchId: uuid("matchId"),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  // Normalized selection for Match Odds: HOME_TEAM, AWAY_TEAM, DRAW (populated during match linking)
  normalizedSelection: varchar("normalizedSelection", {
    enum: ["HOME_TEAM", "AWAY_TEAM", "DRAW"],
  }),
  odds: numeric("odds", { precision: 12, scale: 4 }).notNull(),
  stake: numeric("stake", { precision: 12, scale: 2 }).notNull(),
  stakeNok: numeric("stakeNok", { precision: 14, scale: 2 }),
  exchange: text("exchange").notNull(),
  currency: varchar("currency", { length: 3 }),
  placedAt: timestamp("placedAt"),
  settledAt: timestamp("settledAt"),
  profitLoss: numeric("profitLoss", { precision: 14, scale: 2 }),
  profitLossNok: numeric("profitLossNok", { precision: 14, scale: 2 }),
  confidence: jsonb("confidence"),
  status: varchar("status", { enum: betStatusEnum }).notNull().default("draft"),
  error: text("error"),
});

export type LayBet = InferSelectModel<typeof layBet>;

export const matchedBet = pgTable("MatchedBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  backBetId: uuid("backBetId").references(() => backBet.id),
  layBetId: uuid("layBetId").references(() => layBet.id),
  // Link to a football match for auto-settlement (optional until match picker is implemented)
  matchId: uuid("matchId"),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  // Normalized selection for Match Odds: HOME_TEAM, AWAY_TEAM, DRAW (populated during match linking)
  normalizedSelection: varchar("normalizedSelection", {
    enum: ["HOME_TEAM", "AWAY_TEAM", "DRAW"],
  }),
  promoId: uuid("promoId").references(() => promo.id),
  promoType: text("promoType"),
  status: varchar("status", {
    enum: ["draft", "matched", "settled", "needs_review"],
  })
    .notNull()
    .default("draft"),
  netExposure: numeric("netExposure", { precision: 14, scale: 2 }),
  notes: text("notes"),
  confirmedAt: timestamp("confirmedAt"),
  lastError: text("lastError"),
});

export type MatchedBet = InferSelectModel<typeof matchedBet>;

const auditEntityTypeEnum = [
  "back_bet",
  "lay_bet",
  "matched_bet",
  "account",
  "screenshot",
  "free_bet",
  "deposit_bonus",
] as const;

const auditActionEnum = [
  "create",
  "update",
  "delete",
  "status_change",
  "reconcile",
  "attach_leg",
  "auto_settle_detected",
  "auto_settle_applied",
  "manual_settle",
] as const;

export const auditLog = pgTable("AuditLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  entityType: varchar("entityType", { enum: auditEntityTypeEnum }).notNull(),
  entityId: uuid("entityId").notNull(),
  action: varchar("action", { enum: auditActionEnum }).notNull(),
  changes: jsonb("changes"),
  notes: text("notes"),
});

export type AuditLog = InferSelectModel<typeof auditLog>;

const freeBetStatusEnum = ["active", "used", "expired", "locked"] as const;

export const freeBet = pgTable("FreeBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountId: uuid("accountId")
    .notNull()
    .references(() => account.id),
  name: text("name").notNull(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  minOdds: numeric("minOdds", { precision: 12, scale: 4 }),
  expiresAt: timestamp("expiresAt"),
  status: varchar("status", { enum: freeBetStatusEnum })
    .notNull()
    .default("active"),
  usedInMatchedBetId: uuid("usedInMatchedBetId").references(
    () => matchedBet.id
  ),
  notes: text("notes"),
  // Progress tracking for recurring/multi-step promos
  // unlockType: null = already unlocked, 'stake' = total stake required, 'bets' = number of bets required
  unlockType: varchar("unlockType", { enum: ["stake", "bets"] as const }),
  // The target value to unlock (e.g., 50 for "Bet £50", or 3 for "Place 3 bets")
  unlockTarget: numeric("unlockTarget", { precision: 14, scale: 2 }),
  // Minimum odds required for qualifying bets (separate from minOdds for using the free bet)
  unlockMinOdds: numeric("unlockMinOdds", { precision: 12, scale: 4 }),
  // Current progress toward unlock
  unlockProgress: numeric("unlockProgress", {
    precision: 14,
    scale: 2,
  }).default("0"),
  // Whether the stake is returned on winning free bets
  stakeReturned: boolean("stakeReturned").notNull().default(false),
  // Wagering requirements for winnings if the free bet wins
  winWageringMultiplier: numeric("winWageringMultiplier", {
    precision: 6,
    scale: 2,
  }),
  winWageringMinOdds: numeric("winWageringMinOdds", {
    precision: 12,
    scale: 4,
  }),
  winWageringRequirement: numeric("winWageringRequirement", {
    precision: 14,
    scale: 2,
  }),
  winWageringProgress: numeric("winWageringProgress", {
    precision: 14,
    scale: 2,
  }).default("0"),
  // Days allowed to complete wagering after the free bet wins
  winWageringExpiresInDays: integer("winWageringExpiresInDays"),
  winWageringStartedAt: timestamp("winWageringStartedAt"),
  // Calculated deadline: startedAt + expiresInDays
  winWageringExpiresAt: timestamp("winWageringExpiresAt"),
  winWageringCompletedAt: timestamp("winWageringCompletedAt"),
});

export type FreeBet = InferSelectModel<typeof freeBet>;

/**
 * QualifyingBet - Links bets that contribute to unlocking a promo/free bet.
 * Why: Tracks which bets count toward multi-step promo requirements.
 */
export const qualifyingBet = pgTable("QualifyingBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  freeBetId: uuid("freeBetId")
    .notNull()
    .references(() => freeBet.id),
  matchedBetId: uuid("matchedBetId")
    .notNull()
    .references(() => matchedBet.id),
  // The contribution amount (stake for 'stake' type, 1 for 'bets' type)
  contribution: numeric("contribution", { precision: 14, scale: 2 }).notNull(),
});

export type QualifyingBet = InferSelectModel<typeof qualifyingBet>;

/**
 * FreeBetWageringBet - Links bets that contribute to wagering requirements
 * from free bet winnings (once the free bet wins).
 */
export const freeBetWageringBet = pgTable("FreeBetWageringBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  freeBetId: uuid("freeBetId")
    .notNull()
    .references(() => freeBet.id),
  backBetId: uuid("backBetId").references(() => backBet.id),
  matchedBetId: uuid("matchedBetId").references(() => matchedBet.id),
  stake: numeric("stake", { precision: 14, scale: 2 }).notNull(),
  odds: numeric("odds", { precision: 12, scale: 4 }).notNull(),
  qualified: varchar("qualified", { enum: ["true", "false"] as const }).notNull(),
});

export type FreeBetWageringBet = InferSelectModel<typeof freeBetWageringBet>;

/**
 * FootballMatch - Local cache of match data from football-data.org.
 * Why: Enables linking bets to specific matches for auto-settlement.
 */
const matchStatusEnum = [
  "SCHEDULED",
  "TIMED",
  "IN_PLAY",
  "PAUSED",
  "FINISHED",
  "POSTPONED",
  "SUSPENDED",
  "CANCELLED",
] as const;

export const footballMatch = pgTable("FootballMatch", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  // External ID from football-data.org API
  externalId: numeric("externalId", { precision: 10, scale: 0 })
    .notNull()
    .unique(),
  homeTeam: text("homeTeam").notNull(),
  awayTeam: text("awayTeam").notNull(),
  competition: text("competition").notNull(),
  // Competition code from football-data.org (e.g., "PL" for Premier League)
  competitionCode: varchar("competitionCode", { length: 10 }),
  matchDate: timestamp("matchDate").notNull(),
  status: varchar("status", { enum: matchStatusEnum })
    .notNull()
    .default("SCHEDULED"),
  homeScore: numeric("homeScore", { precision: 3, scale: 0 }),
  awayScore: numeric("awayScore", { precision: 3, scale: 0 }),
  // When the match data was last synced from the API
  lastSyncedAt: timestamp("lastSyncedAt").notNull(),
});

export type FootballMatch = InferSelectModel<typeof footballMatch>;

export type FootballMatchStatus = (typeof matchStatusEnum)[number];

/**
 * UserSettings - Stores user preferences for the matched betting tracker.
 * Why: Enables per-user configuration of features like competition sync and iOS Shortcut API access.
 */
export const userSettings = pgTable("UserSettings", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id)
    .unique(),
  // Array of competition codes to sync (e.g., ["PL", "CL", "BL1"])
  enabledCompetitions: jsonb("enabledCompetitions").$type<string[]>(),
  // iOS Shortcut API key (SHA-256 hash of the actual key, 64 hex chars)
  shortcutApiKeyHash: varchar("shortcutApiKeyHash", { length: 64 }),
  // Last 8 characters of the API key for display purposes
  shortcutApiKeyHint: varchar("shortcutApiKeyHint", { length: 8 }),
  // When the API key was created
  shortcutApiKeyCreatedAt: timestamp("shortcutApiKeyCreatedAt"),
  // Last time a shortcut request was made (for rate limiting)
  lastShortcutRequestAt: timestamp("lastShortcutRequestAt"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export type UserSettings = InferSelectModel<typeof userSettings>;

/**
 * Available competitions for syncing from football-data.org.
 * Code is the API identifier, name is for display.
 */
export const AVAILABLE_COMPETITIONS = [
  { code: "PL", name: "Premier League", country: "England" },
  { code: "CL", name: "Champions League", country: "Europe" },
  { code: "EL", name: "Europa League", country: "Europe" },
  { code: "EC", name: "Conference League", country: "Europe" },
  { code: "BL1", name: "Bundesliga", country: "Germany" },
  { code: "SA", name: "Serie A", country: "Italy" },
  { code: "PD", name: "La Liga", country: "Spain" },
  { code: "FL1", name: "Ligue 1", country: "France" },
  { code: "DED", name: "Eredivisie", country: "Netherlands" },
  { code: "PPL", name: "Primeira Liga", country: "Portugal" },
  { code: "ELC", name: "Championship", country: "England" },
  { code: "FAC", name: "FA Cup", country: "England" },
  { code: "EFL", name: "EFL Cup", country: "England" },
  { code: "WC", name: "World Cup", country: "International" },
  { code: "CLI", name: "Copa Libertadores", country: "South America" },
] as const;

export const DEFAULT_COMPETITION_CODES = [
  "PL",
  "CL",
  "EL",
  "FL1",
  "BL1",
  "SA",
  "PD",
];

/**
 * Wallet - Payment intermediary for funding bookmaker accounts.
 * Examples: Revolut, Skrill, Neteller (fiat), Exodus, MetaMask (crypto)
 * Why: Users fund bookmakers via e-wallets and need to track fund flow.
 */
const walletTypeEnum = ["fiat", "crypto", "hybrid"] as const;
const walletStatusEnum = ["active", "archived"] as const;

export const wallet = pgTable("Wallet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  type: varchar("type", { enum: walletTypeEnum }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull(), // Allow longer codes for crypto (e.g., "USDT", "MATIC")
  notes: text("notes"),
  status: varchar("status", { enum: walletStatusEnum })
    .notNull()
    .default("active"),
});

export type Wallet = InferSelectModel<typeof wallet>;
export type WalletType = (typeof walletTypeEnum)[number];
export type WalletStatus = (typeof walletStatusEnum)[number];

/**
 * WalletTransaction - Records money movement in/out of wallets.
 * Why: Tracks deposits, withdrawals, and transfers between wallets and betting accounts.
 */
const walletTransactionTypeEnum = [
  "deposit",
  "withdrawal",
  "transfer_to_account",
  "transfer_from_account",
  "transfer_to_wallet",
  "transfer_from_wallet",
  "fee",
  "adjustment",
] as const;

export const walletTransaction = pgTable("WalletTransaction", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  walletId: uuid("walletId")
    .notNull()
    .references(() => wallet.id),
  type: varchar("type", { enum: walletTransactionTypeEnum }).notNull(),
  amount: numeric("amount", { precision: 20, scale: 8 }).notNull(), // 8 decimals for crypto
  currency: varchar("currency", { length: 10 }).notNull(),
  // FK to Account for bookmaker/exchange transfers
  relatedAccountId: uuid("relatedAccountId").references(() => account.id),
  // FK to Wallet for wallet-to-wallet transfers
  relatedWalletId: uuid("relatedWalletId").references(() => wallet.id),
  // Link to corresponding account transaction (for transfers to/from accounts)
  linkedAccountTransactionId: uuid("linkedAccountTransactionId"),
  // External reference (e.g., blockchain tx hash)
  externalRef: text("externalRef"),
  // When the transaction occurred
  date: timestamp("date").notNull(),
  notes: text("notes"),
});

export type WalletTransaction = InferSelectModel<typeof walletTransaction>;
export type WalletTransactionType = (typeof walletTransactionTypeEnum)[number];

/**
 * BalanceSnapshot - Periodic snapshots of total capital in NOK.
 * Why: Simple time-series data for balance charts without complex transaction aggregation.
 * Captured twice daily by cron job.
 */
export const balanceSnapshot = pgTable("BalanceSnapshot", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  // Total capital in NOK at the time of snapshot
  totalCapitalNok: numeric("totalCapitalNok", { precision: 20, scale: 2 }).notNull(),
  // Optional breakdown for debugging/analysis
  accountsNok: numeric("accountsNok", { precision: 20, scale: 2 }),
  walletsNok: numeric("walletsNok", { precision: 20, scale: 2 }),
});

export type BalanceSnapshot = InferSelectModel<typeof balanceSnapshot>;

/**
 * DepositBonus - Bonuses with wagering requirements (e.g., "Deposit 1000 NOK, get 100% bonus with 6x wagering").
 * Unlike free bets which are immediately usable, deposit bonuses require wagering to clear.
 * Why: Users need to track wagering progress to know when bonus funds become withdrawable.
 */
const depositBonusStatusEnum = ["active", "cleared", "forfeited", "expired"] as const;
const wageringBaseEnum = ["deposit", "bonus", "deposit_plus_bonus"] as const;

export const depositBonus = pgTable("DepositBonus", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountId: uuid("accountId")
    .notNull()
    .references(() => account.id),
  name: text("name").notNull(),
  // The deposit amount that triggered the bonus
  depositAmount: numeric("depositAmount", { precision: 14, scale: 2 }).notNull(),
  // The bonus amount received
  bonusAmount: numeric("bonusAmount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  // Wagering multiplier (e.g., 6 for 6x)
  wageringMultiplier: numeric("wageringMultiplier", { precision: 6, scale: 2 }).notNull(),
  // What the multiplier applies to
  wageringBase: varchar("wageringBase", { enum: wageringBaseEnum }).notNull(),
  // Total amount to wager (computed from base × multiplier, stored for convenience)
  wageringRequirement: numeric("wageringRequirement", { precision: 14, scale: 2 }).notNull(),
  // Amount wagered so far
  wageringProgress: numeric("wageringProgress", { precision: 14, scale: 2 }).notNull().default("0"),
  // Minimum odds for bets to count toward wagering
  minOdds: numeric("minOdds", { precision: 12, scale: 4 }).notNull(),
  // Max bet as % of bonus (optional, e.g., 25 = max bet 250 on 1000 bonus)
  maxBetPercent: numeric("maxBetPercent", { precision: 5, scale: 2 }),
  expiresAt: timestamp("expiresAt"),
  status: varchar("status", { enum: depositBonusStatusEnum }).notNull().default("active"),
  // Link to the deposit transaction that triggered this bonus
  linkedTransactionId: uuid("linkedTransactionId").references(() => accountTransaction.id),
  // When wagering was completed
  clearedAt: timestamp("clearedAt"),
  notes: text("notes"),
});

export type DepositBonus = InferSelectModel<typeof depositBonus>;
export type DepositBonusStatus = (typeof depositBonusStatusEnum)[number];
export type WageringBase = (typeof wageringBaseEnum)[number];

/**
 * BonusQualifyingBet - Links bets that contribute to deposit bonus wagering progress.
 * Why: Tracks which bets counted toward clearing the bonus with their contribution.
 */
export const bonusQualifyingBet = pgTable("BonusQualifyingBet", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  depositBonusId: uuid("depositBonusId")
    .notNull()
    .references(() => depositBonus.id),
  // Can link to either a back bet or matched bet
  backBetId: uuid("backBetId").references(() => backBet.id),
  matchedBetId: uuid("matchedBetId").references(() => matchedBet.id),
  // The stake amount that counted toward wagering
  stake: numeric("stake", { precision: 14, scale: 2 }).notNull(),
  // The odds of the bet
  odds: numeric("odds", { precision: 12, scale: 4 }).notNull(),
  // Whether this bet met the minimum odds requirement
  qualified: varchar("qualified", { enum: ["true", "false"] as const }).notNull(),
});

export type BonusQualifyingBet = InferSelectModel<typeof bonusQualifyingBet>;
