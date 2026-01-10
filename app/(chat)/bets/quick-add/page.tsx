import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { QuickAddForm } from "@/components/bets/quick-add-form";
import { listAccountsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "Quick Add Matched Bet",
};

export default async function QuickAddPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/guest");
  }

  const accounts = await listAccountsByUser({
    userId: session.user.id,
  });

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

  return <QuickAddForm bookmakers={bookmakers} exchanges={exchanges} />;
}
