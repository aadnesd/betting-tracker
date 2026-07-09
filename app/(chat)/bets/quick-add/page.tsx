import { redirect } from "next/navigation";
import {
  QuickAddForm,
  type QuickAddInitialMatchInfo,
  type QuickAddInitialValues,
} from "@/components/bets/quick-add-form";
import { getCachedSession } from "@/lib/auth";
import {
  getUserSettings,
  listAccountsByUser,
  listFreeBetsByUser,
} from "@/lib/db/queries";

export const metadata = {
  title: "Quick Add Matched Bet",
};

type QuickAddPageProps = {
  searchParams: Promise<{
    copyFrom?: string;
    market?: string;
    selection?: string;
    matchId?: string;
    normalizedSelection?: string;
    unlinkedMatchDate?: string;
    homeTeam?: string;
    awayTeam?: string;
    promoType?: string;
    backOdds?: string;
    backStake?: string;
    backBookmaker?: string;
    backCurrency?: string;
    layOdds?: string;
    layStake?: string;
    layExchange?: string;
    layCurrency?: string;
    notes?: string;
  }>;
};

function normalizeCopiedSelection(value?: string) {
  return value === "HOME_TEAM" || value === "AWAY_TEAM" || value === "DRAW"
    ? value
    : "";
}

function toLocalDateTimeInputValue(value?: string) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const local = new Date(
    parsed.getTime() - parsed.getTimezoneOffset() * 60_000
  );
  return local.toISOString().slice(0, 16);
}

export default async function QuickAddPage(props: QuickAddPageProps) {
  const session = await getCachedSession();
  if (!session?.user) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;

  const [accounts, freeBets, settings] = await Promise.all([
    listAccountsByUser({
      userId: session.user.id,
    }),
    listFreeBetsByUser({
      userId: session.user.id,
      status: "active",
    }),
    getUserSettings({ userId: session.user.id }),
  ]);

  // Treat null/undefined status as active for backwards compatibility
  // (accounts created before status column was properly enforced)
  const isActive = (status: string | null | undefined) =>
    status === "active" || !status;

  const bookmakers = accounts
    .filter((a) => a.kind === "bookmaker" && isActive(a.status))
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind as "bookmaker" | "exchange",
      currency: a.currency,
      commission: a.commission ? Number(a.commission) : null,
    }));

  const exchanges = accounts
    .filter((a) => a.kind === "exchange" && isActive(a.status))
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind as "bookmaker" | "exchange",
      currency: a.currency,
      commission: a.commission ? Number(a.commission) : null,
    }));

  const preferredLayExchangeName =
    exchanges.find(
      (exchange) => exchange.id === settings?.defaultLayExchangeAccountId
    )?.name ?? null;

  // Map free bets to options with account info
  const freeBetOptions = freeBets.map((fb) => ({
    id: fb.id,
    name: fb.name,
    value: Number(fb.value),
    currency: fb.currency,
    accountId: fb.accountId,
    accountName: fb.accountName ?? null,
    expiresAt: fb.expiresAt ? new Date(fb.expiresAt).toISOString() : null,
    minOdds: fb.minOdds ? Number(fb.minOdds) : null,
    stakeReturned: fb.stakeReturned ?? false,
  }));

  const copiedFromMatchedBetId = searchParams.copyFrom;
  const initialValues: QuickAddInitialValues | undefined =
    copiedFromMatchedBetId
      ? {
          market: searchParams.market ?? "",
          selection: searchParams.selection ?? "",
          matchId: searchParams.matchId ?? "",
          unlinkedMatchDate: toLocalDateTimeInputValue(
            searchParams.unlinkedMatchDate
          ),
          normalizedSelection: normalizeCopiedSelection(
            searchParams.normalizedSelection
          ),
          promoType: searchParams.promoType ?? "",
          backOdds: searchParams.backOdds ?? "",
          backStake: searchParams.backStake ?? "",
          backBookmaker: searchParams.backBookmaker ?? "",
          backCurrency: searchParams.backCurrency ?? "NOK",
          layOdds: searchParams.layOdds ?? "",
          layStake: searchParams.layStake ?? "",
          layExchange: searchParams.layExchange ?? "",
          layCurrency: searchParams.layCurrency ?? "NOK",
          notes: searchParams.notes ?? "",
        }
      : undefined;

  const initialMatchInfo: QuickAddInitialMatchInfo | null =
    copiedFromMatchedBetId &&
    searchParams.matchId &&
    searchParams.homeTeam &&
    searchParams.awayTeam
      ? {
          id: searchParams.matchId,
          homeTeam: searchParams.homeTeam,
          awayTeam: searchParams.awayTeam,
        }
      : null;

  return (
    <QuickAddForm
      bookmakers={bookmakers}
      copiedFromMatchedBetId={copiedFromMatchedBetId}
      exchanges={exchanges}
      freeBets={freeBetOptions}
      initialMatchInfo={initialMatchInfo}
      initialValues={initialValues}
      preferredLayExchangeName={preferredLayExchangeName}
    />
  );
}
