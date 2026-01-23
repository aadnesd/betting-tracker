"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { WalletType } from "@/lib/db/schema";

// Common currencies for each wallet type
const FIAT_CURRENCIES = ["NOK", "EUR", "GBP", "USD", "SEK", "DKK", "PLN", "CHF"];
const CRYPTO_CURRENCIES = [
	"BTC",
	"ETH",
	"USDT",
	"USDC",
	"SOL",
	"DOT",
	"AVAX",
	"MATIC",
	"LTC",
	"ADA",
	"BNB",
	"XRP",
	"DAI",
	"BUSD",
	"ARB",
	"OP",
];

interface WalletFormProps {
	wallet?: {
		id: string;
		name: string;
		type: WalletType;
		currency: string;
		notes: string | null;
		status: "active" | "archived";
	};
}

export function WalletForm({ wallet }: WalletFormProps) {
	const router = useRouter();
	const isEditing = !!wallet;

	const [name, setName] = useState(wallet?.name ?? "");
	const [type, setType] = useState<WalletType>(wallet?.type ?? "fiat");
	const [currency, setCurrency] = useState(wallet?.currency ?? "NOK");
	const [notes, setNotes] = useState(wallet?.notes ?? "");
	const [saving, setSaving] = useState(false);

	const currencies = type === "crypto" ? CRYPTO_CURRENCIES : FIAT_CURRENCIES;

	// Reset currency when type changes
	const handleTypeChange = (newType: WalletType) => {
		setType(newType);
		// If current currency is not in the new type's list, reset to default
		const newCurrencies = newType === "crypto" ? CRYPTO_CURRENCIES : FIAT_CURRENCIES;
		if (!newCurrencies.includes(currency)) {
			setCurrency(newType === "crypto" ? "BTC" : "NOK");
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!name.trim()) {
			toast.error("Wallet name is required");
			return;
		}

		setSaving(true);

		try {
			const url = isEditing
				? `/api/bets/wallets/${wallet.id}`
				: "/api/bets/wallets";
			const method = isEditing ? "PATCH" : "POST";

			const res = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: name.trim(),
					type,
					currency,
					notes: notes.trim() || null,
				}),
			});

			if (!res.ok) {
				const error = await res.json();
				throw new Error(error.message ?? "Failed to save wallet");
			}

			toast.success(isEditing ? "Wallet updated" : "Wallet created");
			router.push("/bets/settings/wallets");
			router.refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save wallet");
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<div className="space-y-2">
				<Label htmlFor="name">Wallet Name *</Label>
				<Input
					id="name"
					placeholder="e.g., Revolut GBP, Exodus BTC"
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
				/>
				<p className="text-muted-foreground text-xs">
					A descriptive name for this wallet.
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="type">Wallet Type *</Label>
				<Select value={type} onValueChange={(v) => handleTypeChange(v as WalletType)}>
					<SelectTrigger id="type">
						<SelectValue placeholder="Select type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="fiat">Fiat (e-wallet)</SelectItem>
						<SelectItem value="crypto">Crypto</SelectItem>
						<SelectItem value="hybrid">Hybrid (fiat + crypto)</SelectItem>
					</SelectContent>
				</Select>
				<p className="text-muted-foreground text-xs">
					Fiat wallets for Revolut, Skrill, etc. Crypto for Exodus, MetaMask, etc.
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="currency">Currency *</Label>
				<Select value={currency} onValueChange={setCurrency}>
					<SelectTrigger id="currency">
						<SelectValue placeholder="Select currency" />
					</SelectTrigger>
					<SelectContent>
						{currencies.map((cur) => (
							<SelectItem key={cur} value={cur}>
								{cur}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-muted-foreground text-xs">
					The primary currency for this wallet. Create separate wallets for multi-currency holdings.
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="notes">Notes</Label>
				<Textarea
					id="notes"
					placeholder="Optional notes about this wallet..."
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					rows={3}
				/>
			</div>

			<div className="flex items-center gap-3 pt-4">
				<Button type="submit" disabled={saving}>
					{saving ? "Saving..." : isEditing ? "Update Wallet" : "Create Wallet"}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={() => router.push("/bets/settings/wallets")}
				>
					Cancel
				</Button>
			</div>
		</form>
	);
}
