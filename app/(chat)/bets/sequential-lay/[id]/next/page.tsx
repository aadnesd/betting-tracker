import { notFound, redirect } from "next/navigation";
import { SequentialLayNextLayForm } from "@/components/bets/sequential-lay-next-lay-form";
import { getCachedSession } from "@/lib/auth";
import { isSequentialLayRelatedMatchedBet } from "@/lib/bets/sequential-lay";
import {
  getMatchedBetWithParts,
  getUserSettings,
  listAccountsByUser,
} from "@/lib/db/queries";

export const metadata = {
  title: "Add next sequential lay",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const session = await getCachedSession();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const [parent, accounts, settings] = await Promise.all([
    getMatchedBetWithParts({ id, userId: session.user.id }),
    listAccountsByUser({ userId: session.user.id }),
    getUserSettings({ userId: session.user.id }),
  ]);

  if (!parent || !isSequentialLayRelatedMatchedBet(parent.matched.notes)) {
    notFound();
  }

  const isActive = (status: string | null | undefined) =>
    status === "active" || !status;

  const exchanges = accounts
    .filter(
      (account) => account.kind === "exchange" && isActive(account.status)
    )
    .map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
    }));

  return (
    <SequentialLayNextLayForm
      exchanges={exchanges}
      market={parent.matched.market}
      parentMatchedBetId={parent.matched.id}
      preferredExchangeId={settings?.defaultLayExchangeAccountId ?? null}
      returnTo={`/bets/${parent.matched.id}`}
      selection={parent.matched.selection}
    />
  );
}
