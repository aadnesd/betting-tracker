import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { TransactionForm } from "@/components/bets/transaction-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccountById, listActiveWalletsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "Record Transaction",
};

export default async function NewTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  const [account, wallets] = await Promise.all([
    getAccountById({
      id,
      userId: session.user.id,
    }),
    listActiveWalletsByUser(session.user.id),
  ]);

  if (!account) {
    notFound();
  }

  // Map wallets to the format expected by TransactionForm
  const walletOptions = wallets.map((w) => ({
    id: w.id,
    name: w.name,
    type: w.type as "fiat" | "crypto" | "hybrid",
    currency: w.currency,
  }));

  return (
    <div className="container mx-auto max-w-xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/bets/settings/accounts/${id}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Account
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Record Transaction</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionForm
            accountId={id}
            accountName={account.name}
            defaultCurrency={account.currency ?? "NOK"}
            wallets={walletOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
