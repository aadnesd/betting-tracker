/**
 * CSV Import/Export Utilities for Matched Betting Tracker
 *
 * Provides parsing and validation for bet/balance CSV imports,
 * and formatting for CSV/XLSX exports.
 *
 * Why: Enables bulk data management for users who track bets externally
 * or need to export for tax/record-keeping purposes.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Currency Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ISO 4217 currency codes commonly used in betting
 */
const VALID_CURRENCY_CODES = [
  "NOK",
  "GBP",
  "EUR",
  "USD",
  "SEK",
  "DKK",
  "AUD",
  "CAD",
] as const;

export type CurrencyCode = (typeof VALID_CURRENCY_CODES)[number];

export function isValidCurrency(code: string): code is CurrencyCode {
  return VALID_CURRENCY_CODES.includes(code.toUpperCase() as CurrencyCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// Odds Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates decimal odds format (e.g., 2.50, 1.85)
 * Must be >= 1.01 (no arbitrage below 1.00)
 */
export function isValidOdds(value: string | number): boolean {
  const num = typeof value === "string" ? Number.parseFloat(value) : value;
  return !Number.isNaN(num) && num >= 1.01 && num <= 1000;
}

/**
 * Parses odds from various formats:
 * - Decimal: "2.50" → 2.50
 * - Fractional: "3/2" → 2.50
 * - American positive: "+150" → 2.50
 * - American negative: "-200" → 1.50
 */
export function parseOdds(value: string): number | null {
  const trimmed = value.trim();

  // Decimal format
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const decimal = Number.parseFloat(trimmed);
    return isValidOdds(decimal) ? decimal : null;
  }

  // Fractional format (e.g., "3/2")
  if (/^\d+\/\d+$/.test(trimmed)) {
    const [numerator, denominator] = trimmed.split("/").map(Number);
    if (denominator === 0) return null;
    const decimal = numerator / denominator + 1;
    return isValidOdds(decimal) ? decimal : null;
  }

  // American format
  if (/^[+-]\d+$/.test(trimmed)) {
    const american = Number.parseInt(trimmed, 10);
    let decimal: number;
    if (american > 0) {
      decimal = american / 100 + 1;
    } else {
      decimal = 100 / Math.abs(american) + 1;
    }
    return isValidOdds(decimal) ? decimal : null;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CsvRowError {
  row: number;
  field: string;
  message: string;
  value?: string;
}

export interface CsvParseResult<T> {
  success: boolean;
  data: T[];
  errors: CsvRowError[];
  /** Number of rows successfully parsed */
  successCount: number;
  /** Total number of data rows (excluding header) */
  totalCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bet CSV Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expected CSV columns for bet import:
 * kind, market, selection, odds, stake, exchange, currency, placedAt, notes
 */
export const BetCsvRowSchema = z.object({
  kind: z.enum(["back", "lay"]),
  market: z.string().min(1, "Market is required"),
  selection: z.string().min(1, "Selection is required"),
  odds: z.string().refine(
    (v) => parseOdds(v) !== null,
    (v) => ({ message: `Invalid odds format: ${v}` })
  ),
  stake: z.string().refine(
    (v) => {
      const num = Number.parseFloat(v);
      return !Number.isNaN(num) && num > 0;
    },
    (v) => ({ message: `Invalid stake: ${v}` })
  ),
  exchange: z.string().min(1, "Exchange/Bookmaker is required"),
  currency: z.string().refine(
    (v) => isValidCurrency(v),
    (v) => ({ message: `Invalid currency code: ${v}` })
  ),
  placedAt: z.string().optional(),
  notes: z.string().optional(),
});

export type BetCsvRow = z.infer<typeof BetCsvRowSchema>;

export interface ParsedBet {
  kind: "back" | "lay";
  market: string;
  selection: string;
  odds: number;
  stake: number;
  exchange: string;
  currency: CurrencyCode;
  placedAt: Date | null;
  notes: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance CSV Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expected CSV columns for balance import:
 * account, type, amount, currency, date, notes
 */
export const BalanceCsvRowSchema = z.object({
  account: z.string().min(1, "Account name is required"),
  type: z.enum(["deposit", "withdrawal", "bonus", "adjustment"]),
  amount: z.string().refine(
    (v) => {
      const num = Number.parseFloat(v);
      return !Number.isNaN(num);
    },
    (v) => ({ message: `Invalid amount: ${v}` })
  ),
  currency: z.string().refine(
    (v) => isValidCurrency(v),
    (v) => ({ message: `Invalid currency code: ${v}` })
  ),
  date: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

export type BalanceCsvRow = z.infer<typeof BalanceCsvRowSchema>;

export interface ParsedBalance {
  account: string;
  type: "deposit" | "withdrawal" | "bonus" | "adjustment";
  amount: number;
  currency: CurrencyCode;
  date: Date;
  notes: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parsing Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse CSV text into rows, handling quoted fields and escapes.
 * Returns array of objects with column names as keys.
 */
export function parseCsvText(
  csvText: string
): { headers: string[]; rows: Record<string, string>[] } | null {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return null;

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_")
  );

  if (headers.length === 0) return null;

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]?.trim() ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse a single CSV line, handling quoted fields with commas.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Parse date from various formats:
 * - ISO 8601: "2024-01-15T10:30:00Z"
 * - Date only: "2024-01-15"
 * - European: "15/01/2024"
 * - US: "01/15/2024"
 */
export function parseDate(value: string): Date | null {
  if (!value || !value.trim()) return null;

  const trimmed = value.trim();

  // ISO format
  const isoDate = new Date(trimmed);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // European format: DD/MM/YYYY or DD-MM-YYYY
  const europeanMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (europeanMatch) {
    const [, day, month, year] = europeanMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

/**
 * Parse a CSV file containing bet data.
 *
 * Returns successfully parsed bets and any row-level errors.
 * Does NOT fail the entire import on individual row errors.
 */
export function parseBetsCsv(csvText: string): CsvParseResult<ParsedBet> {
  const parsed = parseCsvText(csvText);
  const errors: CsvRowError[] = [];
  const data: ParsedBet[] = [];

  if (!parsed) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: "file", message: "Invalid or empty CSV file" }],
      successCount: 0,
      totalCount: 0,
    };
  }

  // Header aliases for flexible column matching
  const headerAliases: Record<string, string[]> = {
    kind: ["kind", "type"],
    market: ["market", "event"],
    selection: ["selection", "pick", "bet"],
    odds: ["odds", "price"],
    stake: ["stake", "amount"],
    exchange: ["exchange", "bookmaker", "bookie"],
    currency: ["currency", "ccy"],
  };

  // Check if required columns exist (considering aliases)
  const requiredHeaders = Object.keys(headerAliases);
  const missingHeaders = requiredHeaders.filter((required) => {
    const aliases = headerAliases[required];
    return !aliases.some((alias) => parsed.headers.includes(alias));
  });

  if (missingHeaders.length > 0) {
    return {
      success: false,
      data: [],
      errors: [
        {
          row: 0,
          field: "headers",
          message: `Missing required columns: ${missingHeaders.join(", ")}`,
        },
      ],
      successCount: 0,
      totalCount: parsed.rows.length,
    };
  }

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const rowNum = i + 2; // Account for header row and 1-based indexing

    // Map to expected schema (handle header variations)
    const normalized = {
      kind: row.kind ?? row.type ?? "",
      market: row.market ?? row.event ?? "",
      selection: row.selection ?? row.pick ?? row.bet ?? "",
      odds: row.odds ?? row.price ?? "",
      stake: row.stake ?? row.amount ?? "",
      exchange: row.exchange ?? row.bookmaker ?? row.bookie ?? "",
      currency: row.currency ?? row.ccy ?? "",
      placedAt: row.placed_at ?? row.placedat ?? row.date ?? "",
      notes: row.notes ?? row.note ?? row.comment ?? "",
    };

    const validation = BetCsvRowSchema.safeParse(normalized);

    if (!validation.success) {
      for (const issue of validation.error.issues) {
        errors.push({
          row: rowNum,
          field: issue.path.join("."),
          message: issue.message,
          value: normalized[issue.path[0] as keyof typeof normalized] as string,
        });
      }
      continue;
    }

    const parsedOdds = parseOdds(validation.data.odds);
    if (parsedOdds === null) {
      errors.push({
        row: rowNum,
        field: "odds",
        message: "Could not parse odds",
        value: validation.data.odds,
      });
      continue;
    }

    const parsedBet: ParsedBet = {
      kind: validation.data.kind,
      market: validation.data.market,
      selection: validation.data.selection,
      odds: parsedOdds,
      stake: Number.parseFloat(validation.data.stake),
      exchange: validation.data.exchange,
      currency: validation.data.currency.toUpperCase() as CurrencyCode,
      placedAt: validation.data.placedAt
        ? parseDate(validation.data.placedAt)
        : null,
      notes: validation.data.notes || null,
    };

    data.push(parsedBet);
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    successCount: data.length,
    totalCount: parsed.rows.length,
  };
}

/**
 * Parse a CSV file containing balance/transaction data.
 */
export function parseBalancesCsv(
  csvText: string
): CsvParseResult<ParsedBalance> {
  const parsed = parseCsvText(csvText);
  const errors: CsvRowError[] = [];
  const data: ParsedBalance[] = [];

  if (!parsed) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, field: "file", message: "Invalid or empty CSV file" }],
      successCount: 0,
      totalCount: 0,
    };
  }

  // Validate required headers
  const requiredHeaders = ["account", "type", "amount", "currency", "date"];
  const missingHeaders = requiredHeaders.filter(
    (h) => !parsed.headers.includes(h)
  );
  if (missingHeaders.length > 0) {
    return {
      success: false,
      data: [],
      errors: [
        {
          row: 0,
          field: "headers",
          message: `Missing required columns: ${missingHeaders.join(", ")}`,
        },
      ],
      successCount: 0,
      totalCount: parsed.rows.length,
    };
  }

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const rowNum = i + 2;

    const normalized = {
      account: row.account ?? row.bookmaker ?? row.exchange ?? "",
      type: row.type ?? row.transaction_type ?? "",
      amount: row.amount ?? row.value ?? "",
      currency: row.currency ?? row.ccy ?? "",
      date: row.date ?? row.occurred_at ?? "",
      notes: row.notes ?? row.note ?? "",
    };

    const validation = BalanceCsvRowSchema.safeParse(normalized);

    if (!validation.success) {
      for (const issue of validation.error.issues) {
        errors.push({
          row: rowNum,
          field: issue.path.join("."),
          message: issue.message,
          value: normalized[issue.path[0] as keyof typeof normalized] as string,
        });
      }
      continue;
    }

    const parsedDate = parseDate(validation.data.date);
    if (!parsedDate) {
      errors.push({
        row: rowNum,
        field: "date",
        message: "Could not parse date",
        value: validation.data.date,
      });
      continue;
    }

    const parsedBalance: ParsedBalance = {
      account: validation.data.account,
      type: validation.data.type,
      amount: Number.parseFloat(validation.data.amount),
      currency: validation.data.currency.toUpperCase() as CurrencyCode,
      date: parsedDate,
      notes: validation.data.notes || null,
    };

    data.push(parsedBalance);
  }

  return {
    success: errors.length === 0,
    data,
    errors,
    successCount: data.length,
    totalCount: parsed.rows.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Export Functions
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportableMatchedBet {
  id: string;
  market: string;
  selection: string;
  promoType: string | null;
  status: string;
  netExposure: string | null;
  settledAt: Date | null;
  backBet: {
    exchange: string;
    odds: string;
    stake: string;
    currency: string | null;
    profitLoss: string | null;
  } | null;
  layBet: {
    exchange: string;
    odds: string;
    stake: string;
    currency: string | null;
    profitLoss: string | null;
  } | null;
}

/**
 * Generate CSV content from matched bets for export.
 */
export function generateMatchedBetsCsv(bets: ExportableMatchedBet[]): string {
  const headers = [
    "matchedSetId",
    "market",
    "selection",
    "promoType",
    "status",
    "backExchange",
    "backOdds",
    "backStake",
    "backCurrency",
    "backProfitLoss",
    "layExchange",
    "layOdds",
    "layStake",
    "layCurrency",
    "layProfitLoss",
    "netExposure",
    "netProfit",
    "settledAt",
  ];

  const rows = bets.map((bet) => {
    const backPL = Number.parseFloat(bet.backBet?.profitLoss ?? "0");
    const layPL = Number.parseFloat(bet.layBet?.profitLoss ?? "0");
    const netProfit = backPL + layPL;

    return [
      bet.id,
      escapeCsvField(bet.market),
      escapeCsvField(bet.selection),
      bet.promoType ?? "",
      bet.status,
      bet.backBet?.exchange ?? "",
      bet.backBet?.odds ?? "",
      bet.backBet?.stake ?? "",
      bet.backBet?.currency ?? "",
      bet.backBet?.profitLoss ?? "",
      bet.layBet?.exchange ?? "",
      bet.layBet?.odds ?? "",
      bet.layBet?.stake ?? "",
      bet.layBet?.currency ?? "",
      bet.layBet?.profitLoss ?? "",
      bet.netExposure ?? "",
      Number.isNaN(netProfit) ? "" : netProfit.toFixed(2),
      bet.settledAt?.toISOString() ?? "",
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Escape a CSV field value, wrapping in quotes if necessary.
 */
function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
