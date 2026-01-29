import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { QuickAddForm } from "@/components/bets/quick-add-form";
import { listAccountsByUser, listFreeBetsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "Quick Add Matched Bet",
};

export default async function QuickAddPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [accounts, freeBets] = await Promise.all([
    listAccountsByUser({
      userId: session.user.id,
    }),
    listFreeBetsByUser({
      userId: session.user.id,
      status: "active",
    }),
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
    }));

  const exchanges = accounts
    .filter((a) => a.kind === "exchange" && isActive(a.status))
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind as "bookmaker" | "exchange",
      currency: a.currency,
    }));

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

  return (
    <QuickAddForm
      bookmakers={bookmakers}
      exchanges={exchanges}
      freeBets={freeBetOptions}
    />
  );
}
