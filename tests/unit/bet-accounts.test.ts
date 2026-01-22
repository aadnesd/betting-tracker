import { describe, expect, it } from "vitest";
import { applyAccountSelection } from "@/lib/bet-accounts";
import type { ParsedBet } from "@/lib/bet-parser";

const baseBet: ParsedBet = {
  type: "back",
  market: "Premier League",
  selection: "Arsenal",
  odds: 2.1,
  stake: 25,
  exchange: "Bet365",
  currency: "EUR",
  placedAt: "2024-01-01T12:00:00.000Z",
};

describe("applyAccountSelection", () => {
  it("updates account, exchange, and currency when enforced", () => {
    const result = applyAccountSelection({
      bet: { ...baseBet, accountId: null, unmatchedAccount: true },
      account: {
        id: "acc-1",
        name: "Unibet",
        kind: "bookmaker",
        currency: "NOK",
      },
      enforceCurrency: true,
    });

    expect(result.accountId).toBe("acc-1");
    expect(result.exchange).toBe("Unibet");
    expect(result.currency).toBe("NOK");
    expect(result.unmatchedAccount).toBe(false);
  });

  it("keeps bet currency when enforcement is disabled", () => {
    const result = applyAccountSelection({
      bet: { ...baseBet, currency: "GBP" },
      account: {
        id: "acc-2",
        name: "Betfair Exchange",
        kind: "exchange",
        currency: "NOK",
      },
      enforceCurrency: false,
    });

    expect(result.accountId).toBe("acc-2");
    expect(result.exchange).toBe("Betfair Exchange");
    expect(result.currency).toBe("GBP");
  });

  it("clears account data when selection is removed", () => {
    const result = applyAccountSelection({
      bet: { ...baseBet, accountId: "acc-3", unmatchedAccount: true },
      account: null,
    });

    expect(result.accountId).toBeNull();
    expect(result.exchange).toBe(baseBet.exchange);
    expect(result.currency).toBe(baseBet.currency);
    expect(result.unmatchedAccount).toBe(false);
  });
});
