import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { StandaloneBetForm } from "@/components/bets/standalone-bet-form";
import { getLayBetById, listAccountsByUser } from "@/lib/db/queries";

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
    redirect("/api/auth/guest");
  }

  const bet = await getLayBetById({ id, userId: session.user.id });

  if (!bet) {
    notFound();
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
      mode="edit"
      initialData={{
        id: bet.id,
        kind: "lay",
        market: bet.market,
        selection: bet.selection,
        odds: Number(bet.odds),
        stake: Number(bet.stake),
        accountId: fallbackAccountId,
        currency,
        placedAt: bet.placedAt ?? bet.createdAt,
        notes: null,
      }}
    />
  );
}
