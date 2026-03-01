import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { StandaloneBetForm } from "@/components/bets/standalone-bet-form";
import { getLayBetById, listAccountsByUser } from "@/lib/db/queries";
import {
  canUserEditSettledBets,
  deriveSettlementOutcomeFromProfitLoss,
} from "@/lib/settled-bet-edit";

export const metadata = {
  title: "Edit lay bet",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const bet = await getLayBetById({ id, userId: session.user.id });

  if (!bet) {
    notFound();
  }

  if (
    bet.status === "settled" &&
    !canUserEditSettledBets({
      userId: session.user.id,
      email: session.user.email,
    })
  ) {
    redirect(`/bets/lay/${bet.id}`);
  }

  const accounts = await listAccountsByUser({
    userId: session.user.id,
    limit: 200,
  });

  // Treat null/undefined status as active for backwards compatibility
  const isActive = (status: string | null | undefined) =>
    status === "active" || !status;

  const bookmakers = accounts
    .filter((a) => a.kind === "bookmaker" && isActive(a.status))
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind as "bookmaker" | "exchange",
      currency: a.currency,
    }));

  const exchanges = accounts
    .filter((a) => a.kind === "exchange" && isActive(a.status))
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind as "bookmaker" | "exchange",
      currency: a.currency,
    }));

  const betAccount = accounts.find((account) => account.id === bet.accountId);
  const fallbackAccountId = bet.accountId ?? exchanges[0]?.id ?? "";
  const currency =
    bet.currency ?? betAccount?.currency ?? exchanges[0]?.currency ?? "NOK";

  return (
    <StandaloneBetForm
      bookmakers={bookmakers}
      exchanges={exchanges}
      initialData={{
        id: bet.id,
        kind: "lay",
        market: bet.market,
        selection: bet.selection,
        odds: Number(bet.odds),
        stake: Number(bet.stake),
        accountId: fallbackAccountId,
        currency,
        matchId: bet.matchId ?? null,
        placedAt: bet.placedAt ?? bet.createdAt,
        notes: null,
        status: bet.status,
        settlementOutcome: deriveSettlementOutcomeFromProfitLoss({
          kind: "lay",
          profitLoss: bet.profitLoss ? Number(bet.profitLoss) : null,
        }),
      }}
      mode="edit"
    />
  );
}
