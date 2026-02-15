/**
 * Unit tests for CSV import/export functionality.
 *
 * Why: Validates the integrity of bet and balance data during import,
 * ensures proper currency/odds validation, and confirms export formatting
 * matches the expected structure for tax/record-keeping purposes.
 */

import { describe, expect, test } from "vitest";
import {
  type ExportableMatchedBet,
  generateMatchedBetsCsv,
  isValidCurrency,
  isValidOdds,
  parseBalancesCsv,
  parseBetsCsv,
  parseCsvText,
  parseDate,
  parseOdds,
} from "@/lib/csv";

describe("Currency validation", () => {
  test("accepts valid ISO 4217 currency codes", () => {
    expect(isValidCurrency("NOK")).toBe(true);
    expect(isValidCurrency("GBP")).toBe(true);
    expect(isValidCurrency("EUR")).toBe(true);
    expect(isValidCurrency("USD")).toBe(true);
    expect(isValidCurrency("SEK")).toBe(true);
    expect(isValidCurrency("DKK")).toBe(true);
    expect(isValidCurrency("AUD")).toBe(true);
    expect(isValidCurrency("CAD")).toBe(true);
  });

  test("accepts lowercase currency codes", () => {
    expect(isValidCurrency("nok")).toBe(true);
    expect(isValidCurrency("gbp")).toBe(true);
  });

  test("rejects invalid currency codes", () => {
    expect(isValidCurrency("XYZ")).toBe(false);
    expect(isValidCurrency("ABC")).toBe(false);
    expect(isValidCurrency("")).toBe(false);
    expect(isValidCurrency("N")).toBe(false);
    expect(isValidCurrency("NOKK")).toBe(false);
  });
});

describe("Odds validation", () => {
  test("accepts valid decimal odds", () => {
    expect(isValidOdds("2.50")).toBe(true);
    expect(isValidOdds("1.85")).toBe(true);
    expect(isValidOdds("10.0")).toBe(true);
    expect(isValidOdds(2.5)).toBe(true);
    expect(isValidOdds(1.01)).toBe(true);
    expect(isValidOdds(1000)).toBe(true);
  });

  test("rejects odds below 1.01", () => {
    expect(isValidOdds("1.00")).toBe(false);
    expect(isValidOdds("0.5")).toBe(false);
    expect(isValidOdds("-1")).toBe(false);
    expect(isValidOdds(0)).toBe(false);
  });

  test("rejects odds above 1000", () => {
    expect(isValidOdds("1001")).toBe(false);
    expect(isValidOdds(2000)).toBe(false);
  });

  test("rejects invalid input", () => {
    expect(isValidOdds("abc")).toBe(false);
    expect(isValidOdds("")).toBe(false);
    expect(isValidOdds(Number.NaN)).toBe(false);
  });
});

describe("Odds parsing", () => {
  test("parses decimal odds", () => {
    expect(parseOdds("2.50")).toBe(2.5);
    expect(parseOdds("1.85")).toBe(1.85);
    expect(parseOdds("10")).toBe(10);
  });

  test("parses fractional odds", () => {
    // 3/2 = 1.5 + 1 = 2.5
    expect(parseOdds("3/2")).toBe(2.5);
    // 5/1 = 5 + 1 = 6
    expect(parseOdds("5/1")).toBe(6);
    // 1/4 = 0.25 + 1 = 1.25
    expect(parseOdds("1/4")).toBe(1.25);
  });

  test("parses American positive odds", () => {
    // +150 = 150/100 + 1 = 2.5
    expect(parseOdds("+150")).toBe(2.5);
    // +100 = 100/100 + 1 = 2.0
    expect(parseOdds("+100")).toBe(2);
    // +400 = 400/100 + 1 = 5.0
    expect(parseOdds("+400")).toBe(5);
  });

  test("parses American negative odds", () => {
    // -200 = 100/200 + 1 = 1.5
    expect(parseOdds("-200")).toBe(1.5);
    // -100 = 100/100 + 1 = 2.0
    expect(parseOdds("-100")).toBe(2);
    // -400 = 100/400 + 1 = 1.25
    expect(parseOdds("-400")).toBe(1.25);
  });

  test("returns null for invalid odds", () => {
    expect(parseOdds("abc")).toBe(null);
    expect(parseOdds("")).toBe(null);
    expect(parseOdds("0/0")).toBe(null);
    expect(parseOdds("0.5")).toBe(null); // Below 1.01
  });

  test("handles whitespace", () => {
    expect(parseOdds("  2.50  ")).toBe(2.5);
    expect(parseOdds(" +150 ")).toBe(2.5);
  });
});

describe("Date parsing", () => {
  test("parses ISO 8601 dates", () => {
    const date = parseDate("2024-01-15T10:30:00Z");
    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2024);
    expect(date?.getMonth()).toBe(0); // January
    expect(date?.getDate()).toBe(15);
  });

  test("parses date-only strings", () => {
    const date = parseDate("2024-01-15");
    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2024);
  });

  test("parses European format dates", () => {
    const date = parseDate("15/01/2024");
    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2024);
    expect(date?.getMonth()).toBe(0);
    expect(date?.getDate()).toBe(15);
  });

  test("parses dates with dashes", () => {
    const date = parseDate("15-01-2024");
    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2024);
  });

  test("returns null for empty or invalid input", () => {
    expect(parseDate("")).toBe(null);
    expect(parseDate("   ")).toBe(null);
    expect(parseDate("invalid")).toBe(null);
  });
});

describe("CSV text parsing", () => {
  test("parses simple CSV", () => {
    const csv = `name,value
foo,123
bar,456`;
    const result = parseCsvText(csv);
    expect(result).not.toBeNull();
    expect(result?.headers).toEqual(["name", "value"]);
    expect(result?.rows).toHaveLength(2);
    expect(result?.rows[0]).toEqual({ name: "foo", value: "123" });
    expect(result?.rows[1]).toEqual({ name: "bar", value: "456" });
  });

  test("handles quoted fields with commas", () => {
    const csv = `market,selection
"Man United vs Chelsea, Premier League",Home
Football,"Draw, Over 2.5"`;
    const result = parseCsvText(csv);
    expect(result?.rows[0].market).toBe(
      "Man United vs Chelsea, Premier League"
    );
    expect(result?.rows[1].selection).toBe("Draw, Over 2.5");
  });

  test("handles escaped quotes", () => {
    const csv = `note
"He said ""hello"""
"Value with ""quotes"" inside"`;
    const result = parseCsvText(csv);
    expect(result?.rows[0].note).toBe('He said "hello"');
    expect(result?.rows[1].note).toBe('Value with "quotes" inside');
  });

  test("normalizes header names", () => {
    const csv = `Market Name,Placed At,Selection ID
test,2024-01-15,123`;
    const result = parseCsvText(csv);
    expect(result?.headers).toEqual([
      "market_name",
      "placed_at",
      "selection_id",
    ]);
  });

  test("returns null for empty CSV", () => {
    expect(parseCsvText("")).toBe(null);
    expect(parseCsvText("   ")).toBe(null);
  });
});

describe("Bet CSV parsing", () => {
  test("parses valid bet CSV", () => {
    const csv = `kind,market,selection,odds,stake,exchange,currency,placedAt,notes
back,Man United vs Chelsea,Man United,2.50,100,Bet365,NOK,2024-01-15,First bet
lay,Man United vs Chelsea,Man United,2.48,100.50,Betfair,NOK,2024-01-15,Hedge`;

    const result = parseBetsCsv(csv);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.successCount).toBe(2);
    expect(result.totalCount).toBe(2);

    const backBet = result.data[0];
    expect(backBet.kind).toBe("back");
    expect(backBet.market).toBe("Man United vs Chelsea");
    expect(backBet.selection).toBe("Man United");
    expect(backBet.odds).toBe(2.5);
    expect(backBet.stake).toBe(100);
    expect(backBet.exchange).toBe("Bet365");
    expect(backBet.currency).toBe("NOK");
    expect(backBet.notes).toBe("First bet");
  });

  test("handles alternative column names", () => {
    const csv = `type,event,pick,price,amount,bookmaker,ccy,date
back,Arsenal vs Spurs,Arsenal,1.85,50,William Hill,GBP,2024-01-20`;

    const result = parseBetsCsv(csv);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].market).toBe("Arsenal vs Spurs");
    expect(result.data[0].selection).toBe("Arsenal");
    expect(result.data[0].exchange).toBe("William Hill");
  });

  test("returns row-level errors without failing entire import", () => {
    const csv = `kind,market,selection,odds,stake,exchange,currency
back,Match 1,Team A,2.50,100,Bet365,NOK
back,Match 2,Team B,invalid,100,Bet365,NOK
back,Match 3,Team C,2.50,100,Bet365,XYZ
back,Match 4,Team D,2.50,100,Bet365,EUR`;

    const result = parseBetsCsv(csv);
    expect(result.success).toBe(false);
    expect(result.data).toHaveLength(2); // Only valid rows
    expect(result.errors).toHaveLength(2); // Two invalid rows
    expect(result.successCount).toBe(2);
    expect(result.totalCount).toBe(4);

    // Check error details
    const oddsError = result.errors.find((e) => e.field === "odds");
    expect(oddsError).toBeDefined();
    expect(oddsError?.row).toBe(3);

    const currencyError = result.errors.find((e) => e.field === "currency");
    expect(currencyError).toBeDefined();
    expect(currencyError?.row).toBe(4);
  });

  test("fails on missing required headers", () => {
    const csv = `kind,market,selection
back,Match 1,Team A`;

    const result = parseBetsCsv(csv);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe("headers");
    expect(result.errors[0].message).toContain("Missing required columns");
  });

  test("handles fractional odds in CSV", () => {
    const csv = `kind,market,selection,odds,stake,exchange,currency
back,Horse Race,Fast Runner,5/1,100,Bet365,GBP`;

    const result = parseBetsCsv(csv);
    expect(result.success).toBe(true);
    expect(result.data[0].odds).toBe(6); // 5/1 + 1 = 6
  });

  test("handles empty CSV", () => {
    const result = parseBetsCsv("");
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toBe("Invalid or empty CSV file");
  });
});

describe("Balance CSV parsing", () => {
  test("parses valid balance CSV", () => {
    const csv = `account,type,amount,currency,date,notes
Bet365,deposit,1000,NOK,2024-01-01,Initial deposit
Betfair,bonus,50,GBP,2024-01-15,Welcome bonus`;

    const result = parseBalancesCsv(csv);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.successCount).toBe(2);

    expect(result.data[0].account).toBe("Bet365");
    expect(result.data[0].type).toBe("deposit");
    expect(result.data[0].amount).toBe(1000);
    expect(result.data[0].currency).toBe("NOK");
    expect(result.data[1].type).toBe("bonus");
  });

  test("handles all transaction types", () => {
    const csv = `account,type,amount,currency,date
Bank,deposit,1000,NOK,2024-01-01
Bank,withdrawal,500,NOK,2024-01-02
Promo,bonus,100,NOK,2024-01-03
Manual,adjustment,-50,NOK,2024-01-04`;

    const result = parseBalancesCsv(csv);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(4);
    expect(result.data[3].amount).toBe(-50);
  });

  test("returns errors for invalid rows", () => {
    const csv = `account,type,amount,currency,date
Bet365,deposit,1000,NOK,2024-01-01
,deposit,1000,NOK,2024-01-01
Bet365,invalid_type,1000,NOK,2024-01-01`;

    const result = parseBalancesCsv(csv);
    expect(result.success).toBe(false);
    expect(result.data).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
  });

  test("fails on missing required headers", () => {
    const csv = `account,type
Bet365,deposit`;

    const result = parseBalancesCsv(csv);
    expect(result.success).toBe(false);
    expect(result.errors[0].field).toBe("headers");
  });
});

describe("CSV export", () => {
  test("generates CSV with correct headers", () => {
    const bets: ExportableMatchedBet[] = [];
    const csv = generateMatchedBetsCsv(bets);
    const lines = csv.split("\n");

    expect(lines[0]).toBe(
      "matchedSetId,market,selection,promoType,status,backExchange,backOdds,backStake,backCurrency,backProfitLoss,layExchange,layOdds,layStake,layCurrency,layProfitLoss,netExposure,netProfit,settledAt"
    );
  });

  test("generates CSV with bet data", () => {
    const bets: ExportableMatchedBet[] = [
      {
        id: "uuid-1",
        market: "Man United vs Chelsea",
        selection: "Man United",
        promoType: "free_bet",
        status: "settled",
        netExposure: "50.00",
        settledAt: new Date("2024-01-15T10:00:00Z"),
        backBet: {
          exchange: "Bet365",
          odds: "2.50",
          stake: "100.00",
          currency: "NOK",
          profitLoss: "150.00",
        },
        layBet: {
          exchange: "Betfair",
          odds: "2.48",
          stake: "100.50",
          currency: "NOK",
          profitLoss: "-100.50",
        },
      },
    ];

    const csv = generateMatchedBetsCsv(bets);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(2); // Header + 1 data row

    const dataLine = lines[1];
    expect(dataLine).toContain("uuid-1");
    expect(dataLine).toContain("Man United vs Chelsea");
    expect(dataLine).toContain("free_bet");
    expect(dataLine).toContain("Bet365");
    expect(dataLine).toContain("Betfair");
    expect(dataLine).toContain("49.50"); // Net profit: 150 + (-100.50) = 49.50
  });

  test("escapes fields with commas", () => {
    const bets: ExportableMatchedBet[] = [
      {
        id: "uuid-1",
        market: "Arsenal vs Spurs, Premier League",
        selection: "Home",
        promoType: null,
        status: "settled",
        netExposure: null,
        settledAt: null,
        backBet: null,
        layBet: null,
      },
    ];

    const csv = generateMatchedBetsCsv(bets);
    expect(csv).toContain('"Arsenal vs Spurs, Premier League"');
  });

  test("handles null values", () => {
    const bets: ExportableMatchedBet[] = [
      {
        id: "uuid-1",
        market: "Test Match",
        selection: "Home",
        promoType: null,
        status: "settled",
        netExposure: null,
        settledAt: null,
        backBet: null,
        layBet: null,
      },
    ];

    const csv = generateMatchedBetsCsv(bets);
    const lines = csv.split("\n");
    const values = lines[1].split(",");

    // PromoType should be empty
    expect(values[3]).toBe("");
    // BackExchange should be empty
    expect(values[5]).toBe("");
    // settledAt should be empty
    expect(values[17]).toBe("");
  });

  test("calculates net profit correctly", () => {
    const bets: ExportableMatchedBet[] = [
      {
        id: "uuid-1",
        market: "Test",
        selection: "Test",
        promoType: null,
        status: "settled",
        netExposure: null,
        settledAt: null,
        backBet: {
          exchange: "B",
          odds: "2.0",
          stake: "100",
          currency: "NOK",
          profitLoss: "100.00", // Won: +100
        },
        layBet: {
          exchange: "E",
          odds: "2.0",
          stake: "100",
          currency: "NOK",
          profitLoss: "-98.00", // Lost: -98 (minus commission)
        },
      },
    ];

    const csv = generateMatchedBetsCsv(bets);
    const lines = csv.split("\n");
    const values = lines[1].split(",");

    // Net profit = 100 + (-98) = 2.00
    expect(values[16]).toBe("2.00");
  });
});
