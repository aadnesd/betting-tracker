import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { TransactionsPageClient } from "@/components/bets/transactions-page-client";
import { listUnifiedTransactionsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "Transactions",
};

export default async function TransactionsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const transactions = await listUnifiedTransactionsByUser({
    userId: session.user.id,
  });

  return <TransactionsPageClient transactions={transactions} />;
}
