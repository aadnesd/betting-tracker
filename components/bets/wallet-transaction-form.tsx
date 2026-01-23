"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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
import type { WalletTransactionType } from "@/lib/db/schema";

interface Account {
	id: string;
	name: string;
	kind: string;
}

interface Wallet {
	id: string;
	name: string;
	currency: string;
}

interface WalletTransactionFormProps {
	walletId: string;
	walletCurrency: string;
}

const TRANSACTION_TYPES: { value: WalletTransactionType; label: string }[] = [
	{ value: "deposit", label: "Deposit (from bank)" },
	{ value: "withdrawal", label: "Withdrawal (to bank)" },
	{ value: "transfer_to_account", label: "Transfer to Betting Account" },
	{ value: "transfer_from_account", label: "Transfer from Betting Account" },
	{ value: "transfer_to_wallet", label: "Transfer to Another Wallet" },
	{ value: "transfer_from_wallet", label: "Transfer from Another Wallet" },
	{ value: "fee", label: "Fee / Charge" },
	{ value: "adjustment", label: "Balance Adjustment" },
];

export function WalletTransactionForm({
	walletId,
	walletCurrency,
}: WalletTransactionFormProps) {
	const router = useRouter();

	const [type, setType] = useState<WalletTransactionType>("deposit");
	const [amount, setAmount] = useState("");
	const [currency] = useState(walletCurrency);
	const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
	const [relatedAccountId, setRelatedAccountId] = useState<string>("");
	const [relatedWalletId, setRelatedWalletId] = useState<string>("");
	const [externalRef, setExternalRef] = useState("");
	const [notes, setNotes] = useState("");
	const [saving, setSaving] = useState(false);

	// Fetch accounts and wallets for transfer dropdowns
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [wallets, setWallets] = useState<Wallet[]>([]);

	useEffect(() => {
		// Fetch accounts
		fetch("/api/bets/accounts")
			.then((res) => res.json())
			.then((data) => setAccounts(Array.isArray(data) ? data : []))
			.catch(() => setAccounts([]));

		// Fetch wallets
		fetch("/api/bets/wallets")
			.then((res) => res.json())
			.then((data) => {
				const allWallets = Array.isArray(data) ? data : [];
				// Exclude current wallet
				setWallets(allWallets.filter((w: Wallet) => w.id !== walletId));
			})
			.catch(() => setWallets([]));
	}, [walletId]);

	const needsAccount = type === "transfer_to_account" || type === "transfer_from_account";
	const needsWallet = type === "transfer_to_wallet" || type === "transfer_from_wallet";

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		const amountNum = Number.parseFloat(amount);
		if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
			toast.error("Please enter a valid amount");
			return;
		}

		if (needsAccount && !relatedAccountId) {
			toast.error("Please select a betting account");
			return;
		}

		if (needsWallet && !relatedWalletId) {
			toast.error("Please select a wallet");
			return;
		}

		setSaving(true);

		try {
			const res = await fetch(`/api/bets/wallets/${walletId}/transactions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type,
					amount: amountNum,
					currency,
					date,
					relatedAccountId: needsAccount ? relatedAccountId : null,
					relatedWalletId: needsWallet ? relatedWalletId : null,
					externalRef: externalRef.trim() || null,
					notes: notes.trim() || null,
				}),
			});

			if (!res.ok) {
				const error = await res.json();
				throw new Error(error.message ?? "Failed to create transaction");
			}

			toast.success("Transaction added");
			
			// Reset form
			setAmount("");
			setType("deposit");
			setRelatedAccountId("");
			setRelatedWalletId("");
			setExternalRef("");
			setNotes("");
			
			router.refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to add transaction");
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="type">Transaction Type *</Label>
					<Select value={type} onValueChange={(v) => setType(v as WalletTransactionType)}>
						<SelectTrigger id="type">
							<SelectValue placeholder="Select type" />
						</SelectTrigger>
						<SelectContent>
							{TRANSACTION_TYPES.map((t) => (
								<SelectItem key={t.value} value={t.value}>
									{t.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="amount">Amount *</Label>
					<div className="flex gap-2">
						<Input
							id="amount"
							type="number"
							step="any"
							min="0"
							placeholder="0.00"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							required
						/>
						<span className="flex items-center px-3 border rounded-md bg-muted text-muted-foreground text-sm">
							{currency}
						</span>
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="date">Date *</Label>
					<Input
						id="date"
						type="date"
						value={date}
						onChange={(e) => setDate(e.target.value)}
						required
					/>
				</div>

				{needsAccount && (
					<div className="space-y-2">
						<Label htmlFor="relatedAccount">Betting Account *</Label>
						<Select value={relatedAccountId} onValueChange={setRelatedAccountId}>
							<SelectTrigger id="relatedAccount">
								<SelectValue placeholder="Select account" />
							</SelectTrigger>
							<SelectContent>
								{accounts.map((a) => (
									<SelectItem key={a.id} value={a.id}>
										{a.name} ({a.kind})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{needsWallet && (
					<div className="space-y-2">
						<Label htmlFor="relatedWallet">Wallet *</Label>
						<Select value={relatedWalletId} onValueChange={setRelatedWalletId}>
							<SelectTrigger id="relatedWallet">
								<SelectValue placeholder="Select wallet" />
							</SelectTrigger>
							<SelectContent>
								{wallets.map((w) => (
									<SelectItem key={w.id} value={w.id}>
										{w.name} ({w.currency})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				<div className="space-y-2">
					<Label htmlFor="externalRef">External Reference</Label>
					<Input
						id="externalRef"
						placeholder="Transaction ID, hash, etc."
						value={externalRef}
						onChange={(e) => setExternalRef(e.target.value)}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="notes">Notes</Label>
				<Textarea
					id="notes"
					placeholder="Optional notes..."
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					rows={2}
				/>
			</div>

			<Button type="submit" disabled={saving}>
				{saving ? "Adding..." : "Add Transaction"}
			</Button>
		</form>
	);
}
