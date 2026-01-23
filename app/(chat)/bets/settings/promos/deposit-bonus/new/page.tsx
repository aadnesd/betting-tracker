import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/app/(auth)/auth";
import { listAccountsByUser } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { DepositBonusForm } from "@/components/bets/deposit-bonus-form";

export default async function NewDepositBonusPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const accounts = await listAccountsByUser({ userId: session.user.id });
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
          <Link href="/bets/settings/promos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Deposit Bonus</h1>
          <p className="text-muted-foreground">
            Track a deposit bonus with wagering requirements
          </p>
        </div>
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bonus Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DepositBonusForm accounts={accountOptions} mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
