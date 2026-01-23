import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletForm } from "@/components/bets/wallet-form";
import { Wallet } from "lucide-react";

export const metadata = {
	title: "Add Wallet",
};

export default async function NewWalletPage() {
	const session = await auth();

	if (!session?.user) {
		redirect("/login");
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium text-muted-foreground text-sm">Settings</p>
					<h1 className="font-semibold text-2xl">Add New Wallet</h1>
				</div>
				<Button asChild variant="outline">
					<Link href="/bets/settings/wallets">← Back to wallets</Link>
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
					<WalletForm />
				</CardContent>
			</Card>

			<div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
				<h3 className="mb-2 font-medium text-blue-900">Wallet Types</h3>
				<ul className="space-y-1 text-blue-800 text-sm">
					<li>
						• <strong>Fiat (e-wallet)</strong>: Revolut, Wise, PayPal, Skrill, Neteller
					</li>
					<li>
						• <strong>Crypto</strong>: Exodus, MetaMask, Trust Wallet, Ledger
					</li>
					<li>
						• <strong>Hybrid</strong>: Wallets that support both fiat and crypto (e.g., Jeton)
					</li>
				</ul>
			</div>
		</div>
	);
}
