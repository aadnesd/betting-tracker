import { redirect } from "next/navigation";
import { TransactionsPageClient } from "@/components/bets/transactions-page-client";
import { getCachedSession } from "@/lib/auth";
import { listUnifiedTransactionsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "Transactions",
};

export default async function TransactionsPage() {
  const session = await getCachedSession();

  if (!session?.user) {
    redirect("/login");
  }

  const transactions = await listUnifiedTransactionsByUser({
    userId: session.user.id,
  });

  return <TransactionsPageClient transactions={transactions} />;
}
