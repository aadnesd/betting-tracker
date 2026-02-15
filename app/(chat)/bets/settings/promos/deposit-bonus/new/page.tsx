import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { DepositBonusForm } from "@/components/bets/deposit-bonus-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAccountsByUser } from "@/lib/db/queries";

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
    <div className="container mx-auto max-w-2xl space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild size="icon" variant="ghost">
          <Link href="/bets/settings/promos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-bold text-2xl">New Deposit Bonus</h1>
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
