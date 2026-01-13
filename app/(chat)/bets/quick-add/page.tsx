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
    redirect("/api/auth/guest");
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

  const bookmakers = accounts
    .filter((a) => a.kind === "bookmaker" && a.status === "active")
    .map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind as "bookmaker" | "exchange",
      currency: a.currency,
    }));

  const exchanges = accounts
    .filter((a) => a.kind === "exchange" && a.status === "active")
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
  }));

  return (
    <QuickAddForm
      bookmakers={bookmakers}
      exchanges={exchanges}
      freeBets={freeBetOptions}
    />
  );
}
