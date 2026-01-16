import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { StandaloneBetForm } from "@/components/bets/standalone-bet-form";
import { listAccountsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "Create Standalone Bet",
};

export default async function StandaloneBetPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/guest");
  }

  const accounts = await listAccountsByUser({
    userId: session.user.id,
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

  return <StandaloneBetForm bookmakers={bookmakers} exchanges={exchanges} />;
}
