import type { ParsedBet } from "@/lib/bet-parser";

export type AccountOption = {
  id: string;
  name: string;
  kind: "bookmaker" | "exchange";
  currency: string | null;
};

export function applyAccountSelection({
  bet,
  account,
  enforceCurrency = false,
}: {
  bet: ParsedBet;
  account: AccountOption | null;
  enforceCurrency?: boolean;
}): ParsedBet {
  if (!account) {
    return {
      ...bet,
      accountId: null,
      unmatchedAccount: false,
    };
  }

  return {
    ...bet,
    accountId: account.id,
    exchange: account.name,
    currency: enforceCurrency
      ? account.currency ?? bet.currency ?? null
      : bet.currency ?? null,
    unmatchedAccount: false,
  };
}
