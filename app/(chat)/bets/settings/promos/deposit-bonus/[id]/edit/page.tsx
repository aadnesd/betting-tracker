import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/app/(auth)/auth";
import { getDepositBonusById, listAccountsByUser } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { DepositBonusForm } from "@/components/bets/deposit-bonus-form";

export default async function EditDepositBonusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  const [bonus, accounts] = await Promise.all([
    getDepositBonusById({ id, userId: session.user.id }),
    listAccountsByUser({ userId: session.user.id }),
  ]);

  if (!bonus) {
    notFound();
  }

  // Cannot edit non-active bonuses
  if (bonus.status !== "active") {
    redirect(`/bets/settings/promos/deposit-bonus/${id}`);
  }

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    kind: a.kind as "bookmaker" | "exchange",
  }));

  return (
    <div className="container mx-auto max-w-2xl p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/bets/settings/promos/deposit-bonus/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit Deposit Bonus</h1>
          <p className="text-muted-foreground">{bonus.name}</p>
        </div>
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Update Bonus Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DepositBonusForm
            accounts={accountOptions}
            mode="edit"
            initialData={{
              id: bonus.id,
              accountId: bonus.accountId,
              name: bonus.name,
              depositAmount: bonus.depositAmount,
              bonusAmount: bonus.bonusAmount,
              currency: bonus.currency,
              wageringMultiplier: bonus.wageringMultiplier,
              wageringBase: bonus.wageringBase as "deposit" | "bonus" | "deposit_plus_bonus",
              minOdds: bonus.minOdds,
              maxBetPercent: bonus.maxBetPercent,
              expiresAt: bonus.expiresAt,
              linkedTransactionId: bonus.linkedTransactionId,
              notes: bonus.notes,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
