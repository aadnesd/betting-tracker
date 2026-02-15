import { Wallet } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { WalletForm } from "@/components/bets/wallet-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWalletById } from "@/lib/db/queries";
import type { WalletStatus, WalletType } from "@/lib/db/schema";

export const metadata = {
  title: "Edit Wallet",
};

export default async function EditWalletPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const wallet = await getWalletById(id);

  if (!wallet) {
    notFound();
  }

  if (wallet.userId !== session.user.id) {
    redirect("/bets/settings/wallets");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-muted-foreground text-sm">Settings</p>
          <h1 className="font-semibold text-2xl">Edit Wallet</h1>
        </div>
        <Button asChild variant="outline">
          <Link href={`/bets/settings/wallets/${id}`}>← Back to wallet</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WalletForm
            wallet={{
              id: wallet.id,
              name: wallet.name,
              type: wallet.type as WalletType,
              currency: wallet.currency,
              notes: wallet.notes,
              status: wallet.status as WalletStatus,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
