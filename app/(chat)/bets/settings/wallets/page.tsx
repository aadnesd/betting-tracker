import {
	Banknote,
	Bitcoin,
	CreditCard,
	Plus,
	Wallet as WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWalletTotals, listWalletsByUser } from "@/lib/db/queries";
import type { WalletType, WalletStatus } from "@/lib/db/schema";

export const metadata = {
	title: "Wallet Settings",
};

function formatCurrency(value: number, currency: string): string {
	// Handle crypto currencies with more decimals
	const decimals = ["BTC", "ETH", "LTC", "SOL", "DOT", "AVAX", "MATIC", "ADA", "BNB", "XRP"].includes(currency)
		? value < 0.01 ? 8 : 4
		: 2;
	return `${currency} ${value.toFixed(decimals)}`;
}

function WalletTypeBadge({ type }: { type: WalletType }) {
	switch (type) {
		case "crypto":
			return (
				<span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-orange-800 text-xs">
					<Bitcoin className="h-3 w-3" />
					Crypto
				</span>
			);
		case "hybrid":
			return (
				<span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-purple-800 text-xs">
					<CreditCard className="h-3 w-3" />
					Hybrid
				</span>
			);
		default:
			return (
				<span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-green-800 text-xs">
					<Banknote className="h-3 w-3" />
					Fiat
				</span>
			);
	}
}

function WalletStatusBadge({ status }: { status: WalletStatus }) {
	if (status === "archived") {
		return (
			<span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600 text-xs">
				Archived
			</span>
		);
	}
	return (
		<span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 text-xs">
			Active
		</span>
	);
}

export default async function WalletSettingsPage() {
	const session = await auth();

	if (!session?.user) {
		redirect("/login");
	}

	const userId = session.user.id;

	const [wallets, totals] = await Promise.all([
		listWalletsByUser(userId),
		getWalletTotals(userId),
	]);

	const activeWallets = wallets.filter((w) => w.status === "active");
	const archivedWallets = wallets.filter((w) => w.status === "archived");
	const fiatWallets = activeWallets.filter((w) => w.type === "fiat");
	const cryptoWallets = activeWallets.filter((w) => w.type === "crypto" || w.type === "hybrid");

	return (
		<div className="space-y-6 p-4 md:p-8">
			<div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
				<div>
					<p className="font-medium text-muted-foreground text-sm">Settings</p>
					<h1 className="font-semibold text-2xl">Payment Wallets</h1>
					<p className="text-muted-foreground text-sm">
						Track e-wallets and crypto wallets used to fund your betting accounts.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button asChild variant="outline">
						<Link href="/bets">← Back to dashboard</Link>
					</Button>
					<Button asChild>
						<Link href="/bets/settings/wallets/new">
							<Plus className="mr-2 h-4 w-4" />
							Add Wallet
						</Link>
					</Button>
				</div>
			</div>

			{/* Summary Cards */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Wallets
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">{totals.walletCount}</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Fiat Balance
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">
							NOK {totals.fiatBalanceNok.toFixed(2)}
						</p>
						<p className="text-sm text-muted-foreground">
							{fiatWallets.length} wallet{fiatWallets.length !== 1 ? "s" : ""}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Crypto Balance
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">
							NOK {totals.cryptoBalanceNok.toFixed(2)}
						</p>
						<p className="text-sm text-muted-foreground">
							{cryptoWallets.length} wallet{cryptoWallets.length !== 1 ? "s" : ""}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Combined Balance
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">
							NOK {totals.totalBalanceNok.toFixed(2)}
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Wallets List */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<WalletIcon className="h-5 w-5" />
						Your Wallets
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{activeWallets.length === 0 && archivedWallets.length === 0 && (
						<div className="py-8 text-center">
							<WalletIcon className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
							<p className="mb-2 font-medium">No wallets yet</p>
							<p className="mb-4 text-muted-foreground text-sm">
								Add your first e-wallet or crypto wallet to track fund flow.
							</p>
							<Button asChild>
								<Link href="/bets/settings/wallets/new">
									<Plus className="mr-2 h-4 w-4" />
									Add Wallet
								</Link>
							</Button>
						</div>
					)}

					{activeWallets.map((w) => (
						<Link
							key={w.id}
							href={`/bets/settings/wallets/${w.id}`}
							className="block rounded-md border p-4 transition-colors hover:bg-muted/50"
						>
							<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div className="space-y-1">
									<div className="flex items-center gap-2">
										<span className="font-semibold">{w.name}</span>
										<WalletTypeBadge type={w.type} />
										<WalletStatusBadge status={w.status} />
									</div>
									<div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
										<span>Currency: {w.currency}</span>
										{w.notes && <span>• {w.notes}</span>}
									</div>
								</div>
								<div className="text-right">
									<p className="font-semibold text-lg">
										{formatCurrency(w.balance, w.currency)}
									</p>
									<p className="text-muted-foreground text-xs">Current balance</p>
								</div>
							</div>
						</Link>
					))}

					{/* Archived section */}
					{archivedWallets.length > 0 && (
						<>
							<div className="my-4 border-t pt-4">
								<h3 className="text-sm font-medium text-muted-foreground mb-2">
									Archived Wallets
								</h3>
							</div>
							{archivedWallets.map((w) => (
								<Link
									key={w.id}
									href={`/bets/settings/wallets/${w.id}`}
									className="block rounded-md border p-4 opacity-60 transition-colors hover:bg-muted/50"
								>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<span className="font-semibold">{w.name}</span>
												<WalletTypeBadge type={w.type} />
												<WalletStatusBadge status={w.status} />
											</div>
											<div className="text-sm text-muted-foreground">
												Currency: {w.currency}
											</div>
										</div>
										<div className="text-right">
											<p className="font-semibold text-lg">
												{formatCurrency(w.balance, w.currency)}
											</p>
										</div>
									</div>
								</Link>
							))}
						</>
					)}
				</CardContent>
			</Card>

			{/* Quick Info */}
			<div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
				<h3 className="mb-2 font-medium text-blue-900">About Wallet Tracking</h3>
				<ul className="space-y-1 text-blue-800 text-sm">
					<li>
						• <strong>Fiat wallets</strong> include e-wallets like Revolut, Skrill, PayPal, Neteller
					</li>
					<li>
						• <strong>Crypto wallets</strong> include wallets like Exodus, MetaMask, Trust Wallet
					</li>
					<li>
						• Track deposits, withdrawals, and transfers to/from betting accounts
					</li>
					<li>
						• Wallet balances are included in your total capital on the Bankroll page
					</li>
				</ul>
			</div>
		</div>
	);
}
