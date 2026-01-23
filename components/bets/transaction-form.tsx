"use client";

import { Loader2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface WalletOption {
  id: string;
  name: string;
  type: "fiat" | "crypto" | "hybrid";
  currency: string;
}

interface TransactionFormProps {
  accountId: string;
  accountName: string;
  defaultCurrency: string;
  wallets?: WalletOption[];
  onSuccess?: () => void;
}

type TransactionType = "deposit" | "withdrawal" | "bonus" | "adjustment";

interface FormData {
  type: TransactionType;
  amount: string;
  currency: string;
  occurredAt: Date;
  notes: string;
  walletId: string;
  walletAmount: string;
}

const CURRENCIES = ["NOK", "EUR", "GBP", "USD", "SEK", "DKK"] as const;

const TRANSACTION_TYPES: { value: TransactionType; label: string; description: string }[] = [
  { value: "deposit", label: "Deposit", description: "Money added to account" },
  { value: "withdrawal", label: "Withdrawal", description: "Money taken out" },
  { value: "bonus", label: "Bonus", description: "Free bet or bonus funds" },
  { value: "adjustment", label: "Adjustment", description: "Manual balance correction" },
];

export function TransactionForm({
  accountId,
  accountName,
  defaultCurrency,
  wallets = [],
  onSuccess,
}: TransactionFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    type: "deposit",
    amount: "",
    currency: defaultCurrency,
    occurredAt: new Date(),
    notes: "",
    walletId: "",
    walletAmount: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );

  // Get selected wallet and check if currencies differ
  const selectedWallet = wallets.find(w => w.id === formData.walletId);
  const showWalletAmount = selectedWallet && selectedWallet.currency !== formData.currency;

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    const amount = Number.parseFloat(formData.amount);
    if (!formData.amount || Number.isNaN(amount)) {
      newErrors.amount = "Amount is required";
    } else if (amount <= 0) {
      newErrors.amount = "Amount must be positive";
    }

    if (!formData.currency) {
      newErrors.currency = "Currency is required";
    }

    // Validate wallet amount if currencies differ
    if (showWalletAmount) {
      const walletAmt = Number.parseFloat(formData.walletAmount);
      if (!formData.walletAmount || Number.isNaN(walletAmt)) {
        newErrors.walletAmount = "Wallet amount is required for cross-currency transfers";
      } else if (walletAmt <= 0) {
        newErrors.walletAmount = "Wallet amount must be positive";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors below");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        type: formData.type,
        amount: Number.parseFloat(formData.amount),
        currency: formData.currency,
        occurredAt: formData.occurredAt.toISOString(),
        notes: formData.notes.trim() || null,
        walletId: formData.walletId || null,
      };

      // Add wallet amount/currency for cross-currency transfers
      if (showWalletAmount && selectedWallet) {
        payload.walletAmount = Number.parseFloat(formData.walletAmount);
        payload.walletCurrency = selectedWallet.currency;
      }

      const response = await fetch(`/api/bets/accounts/${accountId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create transaction");
      }

      toast.success(`${formData.type.charAt(0).toUpperCase() + formData.type.slice(1)} recorded!`);
      
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/bets/settings/accounts/${accountId}`);
        router.refresh();
      }
    } catch (error) {
      console.error("Create transaction error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create transaction"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Account Info */}
      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">Recording transaction for</p>
        <p className="font-semibold">{accountName}</p>
      </div>

      {/* Transaction Type */}
      <div className="space-y-2">
        <Label htmlFor="type">Transaction Type</Label>
        <Select
          value={formData.type}
          onValueChange={(value: TransactionType) => {
            updateField("type", value);
            // Clear wallet selection when switching to bonus/adjustment
            if (value !== "deposit" && value !== "withdrawal") {
              updateField("walletId", "");
              updateField("walletAmount", "");
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSACTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <div className="flex flex-col">
                  <span>{t.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {TRANSACTION_TYPES.find(t => t.value === formData.type)?.description}
        </p>
      </div>

      {/* Wallet Selector - Only for deposits and withdrawals */}
      {(formData.type === "deposit" || formData.type === "withdrawal") && wallets.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="wallet">
            <span className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              {formData.type === "deposit" ? "From Wallet (optional)" : "To Wallet (optional)"}
            </span>
          </Label>
          <Select
            value={formData.walletId}
            onValueChange={(value) => updateField("walletId", value === "none" ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a wallet..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">No wallet (manual entry)</span>
              </SelectItem>
              {wallets.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  <div className="flex items-center gap-2">
                    <span>{w.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({w.currency})
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {formData.type === "deposit"
              ? "If selected, the wallet balance will decrease by this amount."
              : "If selected, the wallet balance will increase by this amount."}
          </p>
        </div>
      )}

      {/* Wallet Amount for cross-currency transfers */}
      {showWalletAmount && selectedWallet && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <Label htmlFor="walletAmount" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Amount in {selectedWallet.currency}
          </Label>
          <Input
            id="walletAmount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder={`0.00 ${selectedWallet.currency}`}
            value={formData.walletAmount}
            onChange={(e) => updateField("walletAmount", e.target.value)}
            className={errors.walletAmount ? "border-destructive" : ""}
          />
          {errors.walletAmount && (
            <p className="text-xs text-destructive">{errors.walletAmount}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Account uses {formData.currency}, wallet uses {selectedWallet.currency}. 
            Enter the equivalent amount in {selectedWallet.currency}.
          </p>
        </div>
      )}

      {/* Amount and Currency */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={formData.amount}
            onChange={(e) => updateField("amount", e.target.value)}
            className={errors.amount ? "border-destructive" : ""}
          />
          {errors.amount && (
            <p className="text-xs text-destructive">{errors.amount}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Select
            value={formData.currency}
            onValueChange={(value) => updateField("currency", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((cur) => (
                <SelectItem key={cur} value={cur}>
                  {cur}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.currency && (
            <p className="text-xs text-destructive">{errors.currency}</p>
          )}
        </div>
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label htmlFor="occurredAt">Date</Label>
        <Input
          id="occurredAt"
          type="date"
          value={formData.occurredAt.toISOString().split("T")[0]}
          onChange={(e) => {
            const date = new Date(e.target.value);
            if (!Number.isNaN(date.getTime())) {
              updateField("occurredAt", date);
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          When did this transaction occur?
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          placeholder="e.g., Initial deposit, Welcome bonus, etc."
          value={formData.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.push(`/bets/settings/accounts/${accountId}`)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Record Transaction"
          )}
        </Button>
      </div>
    </form>
  );
}
