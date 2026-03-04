"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Gift,
  Loader2,
  Settings,
  Wallet,
} from "lucide-react";
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

export interface AccountOption {
  id: string;
  name: string;
  kind: "bookmaker" | "exchange";
  currency: string;
  currentBalance: string;
}

export interface WalletOption {
  id: string;
  name: string;
  type: "fiat" | "crypto" | "hybrid";
  currency: string;
}

interface QuickTransactionSheetProps {
  accounts: AccountOption[];
  wallets?: WalletOption[];
  /** Trigger button element (default: "Quick Transaction" button) */
  trigger?: React.ReactNode;
  /** Whether the sheet should open on first mount */
  defaultOpen?: boolean;
  /** Called after successful transaction creation */
  onSuccess?: () => void;
}

type TransactionType = "deposit" | "withdrawal" | "bonus" | "adjustment";

interface FormData {
  accountId: string;
  type: TransactionType;
  amount: string;
  currency: string;
  occurredAt: Date;
  notes: string;
  walletId: string;
  walletAmount: string;
}

const CURRENCIES = ["NOK", "EUR", "GBP", "USD", "SEK", "DKK"] as const;

const TRANSACTION_TYPES: {
  value: TransactionType;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    value: "deposit",
    label: "Deposit",
    icon: <ArrowDownCircle className="h-4 w-4 text-green-600" />,
    description: "Money added to account",
  },
  {
    value: "withdrawal",
    label: "Withdrawal",
    icon: <ArrowUpCircle className="h-4 w-4 text-red-600" />,
    description: "Money taken out",
  },
  {
    value: "bonus",
    label: "Bonus",
    icon: <Gift className="h-4 w-4 text-blue-600" />,
    description: "Free bet or bonus funds",
  },
  {
    value: "adjustment",
    label: "Adjustment",
    icon: <Settings className="h-4 w-4 text-gray-600" />,
    description: "Manual balance correction",
  },
];

export function QuickTransactionSheet({
  accounts,
  wallets = [],
  trigger,
  defaultOpen = false,
  onSuccess,
}: QuickTransactionSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [formData, setFormData] = useState<FormData>({
    accountId: "",
    type: "bonus",
    amount: "",
    currency: "NOK",
    occurredAt: new Date(),
    notes: "",
    walletId: "",
    walletAmount: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );

  const selectedAccount = accounts.find((a) => a.id === formData.accountId);
  const selectedWallet = wallets.find((w) => w.id === formData.walletId);
  const showWalletAmount =
    selectedWallet && selectedWallet.currency !== formData.currency;

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleAccountChange = (accountId: string) => {
    const acct = accounts.find((a) => a.id === accountId);
    setFormData((prev) => ({
      ...prev,
      accountId,
      currency: acct?.currency || prev.currency,
    }));
    if (errors.accountId) {
      setErrors((prev) => ({ ...prev, accountId: undefined }));
    }
  };

  const resetForm = () => {
    setFormData({
      accountId: "",
      type: "bonus",
      amount: "",
      currency: "NOK",
      occurredAt: new Date(),
      notes: "",
      walletId: "",
      walletAmount: "",
    });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.accountId) {
      newErrors.accountId = "Please select an account";
    }

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
        newErrors.walletAmount =
          "Wallet amount is required for cross-currency transfers";
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

      const response = await fetch(
        `/api/bets/accounts/${formData.accountId}/transactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create transaction");
      }

      const typeLabel =
        TRANSACTION_TYPES.find((t) => t.value === formData.type)?.label ||
        formData.type;
      toast.success(
        `${typeLabel} of ${formData.currency} ${formData.amount} recorded for ${selectedAccount?.name}!`
      );

      setOpen(false);
      resetForm();

      if (onSuccess) {
        onSuccess();
      }

      router.refresh();
    } catch (error) {
      console.error("Create transaction error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create transaction"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group accounts by kind
  const bookmakers = accounts.filter((a) => a.kind === "bookmaker");
  const exchanges = accounts.filter((a) => a.kind === "exchange");

  const defaultTrigger = (
    <Button className="md:size-default" size="sm" variant="outline">
      <Gift className="mr-2 h-4 w-4" />
      <span className="hidden sm:inline">Quick Transaction</span>
      <span className="sm:hidden">Txn</span>
    </Button>
  );

  return (
    <Sheet
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          resetForm();
        }
      }}
      open={open}
    >
      <SheetTrigger asChild>{trigger || defaultTrigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader className="mb-6">
          <SheetTitle>Quick Transaction</SheetTitle>
          <SheetDescription>
            Record a deposit, withdrawal, or bonus for any account.
          </SheetDescription>
        </SheetHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* Account Selector */}
          <div className="space-y-2">
            <Label htmlFor="account">Account</Label>
            <Select
              onValueChange={handleAccountChange}
              value={formData.accountId}
            >
              <SelectTrigger
                className={errors.accountId ? "border-destructive" : ""}
              >
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {bookmakers.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                      Bookmakers
                    </div>
                    {bookmakers.map((acct) => (
                      <SelectItem key={acct.id} value={acct.id}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{acct.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {acct.currency}{" "}
                            {Number(acct.currentBalance).toFixed(0)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
                {exchanges.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                      Exchanges
                    </div>
                    {exchanges.map((acct) => (
                      <SelectItem key={acct.id} value={acct.id}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{acct.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {acct.currency}{" "}
                            {Number(acct.currentBalance).toFixed(0)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
                {accounts.length === 0 && (
                  <div className="px-2 py-3 text-muted-foreground text-sm">
                    No accounts found. Create one first.
                  </div>
                )}
              </SelectContent>
            </Select>
            {errors.accountId && (
              <p className="text-destructive text-xs">{errors.accountId}</p>
            )}
            {selectedAccount && (
              <p className="text-muted-foreground text-xs">
                Current balance: {selectedAccount.currency}{" "}
                {Number(selectedAccount.currentBalance).toFixed(2)}
              </p>
            )}
          </div>

          {/* Transaction Type - Quick Select Buttons */}
          <div className="space-y-2">
            <Label>Transaction Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {TRANSACTION_TYPES.map((t) => (
                <Button
                  className="justify-start"
                  key={t.value}
                  onClick={() => {
                    updateField("type", t.value);
                    // Clear wallet selection when switching to bonus/adjustment
                    if (t.value !== "deposit" && t.value !== "withdrawal") {
                      updateField("walletId", "");
                      updateField("walletAmount", "");
                    }
                  }}
                  type="button"
                  variant={formData.type === t.value ? "default" : "outline"}
                >
                  {t.icon}
                  <span className="ml-2">{t.label}</span>
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              {
                TRANSACTION_TYPES.find((t) => t.value === formData.type)
                  ?.description
              }
            </p>
          </div>

          {/* Wallet Selector - Only for deposits and withdrawals */}
          {(formData.type === "deposit" || formData.type === "withdrawal") &&
            wallets.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="wallet">
                  <span className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    {formData.type === "deposit"
                      ? "From Wallet (optional)"
                      : "To Wallet (optional)"}
                  </span>
                </Label>
                <Select
                  onValueChange={(value) =>
                    updateField("walletId", value === "none" ? "" : value)
                  }
                  value={formData.walletId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a wallet..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">
                        No wallet (manual entry)
                      </span>
                    </SelectItem>
                    {wallets.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        <div className="flex items-center gap-2">
                          <span>{w.name}</span>
                          <span className="text-muted-foreground text-xs">
                            ({w.currency})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  {formData.type === "deposit"
                    ? "If selected, the wallet balance will decrease by this amount."
                    : "If selected, the wallet balance will increase by this amount."}
                </p>
              </div>
            )}

          {/* Wallet Amount for cross-currency transfers */}
          {showWalletAmount && selectedWallet && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <Label className="flex items-center gap-2" htmlFor="walletAmount">
                <Wallet className="h-4 w-4" />
                Amount in {selectedWallet.currency}
              </Label>
              <Input
                className={errors.walletAmount ? "border-destructive" : ""}
                id="walletAmount"
                min="0.01"
                onChange={(e) => updateField("walletAmount", e.target.value)}
                placeholder={`0.00 ${selectedWallet.currency}`}
                step="0.01"
                type="number"
                value={formData.walletAmount}
              />
              {errors.walletAmount && (
                <p className="text-destructive text-xs">
                  {errors.walletAmount}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                Account uses {formData.currency}, wallet uses{" "}
                {selectedWallet.currency}. Enter the equivalent amount in{" "}
                {selectedWallet.currency}.
              </p>
            </div>
          )}

          {/* Amount and Currency */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                className={errors.amount ? "border-destructive" : ""}
                id="amount"
                min="0.01"
                onChange={(e) => updateField("amount", e.target.value)}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={formData.amount}
              />
              {errors.amount && (
                <p className="text-destructive text-xs">{errors.amount}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                onValueChange={(value) => updateField("currency", value)}
                value={formData.currency}
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
                <p className="text-destructive text-xs">{errors.currency}</p>
              )}
            </div>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="occurredAt">Date</Label>
            <Input
              id="occurredAt"
              onChange={(e) => {
                const date = new Date(e.target.value);
                if (!Number.isNaN(date.getTime())) {
                  updateField("occurredAt", date);
                }
              }}
              type="date"
              value={formData.occurredAt.toISOString().split("T")[0]}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="e.g., Welcome bonus, Stake refund, etc."
              rows={2}
              value={formData.notes}
            />
          </div>

          {/* Actions */}
          <SheetFooter className="mt-6 flex-col gap-2 sm:flex-row">
            <SheetClose asChild>
              <Button
                className="w-full sm:w-auto"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </SheetClose>
            <Button
              className="w-full sm:w-auto"
              disabled={isSubmitting || accounts.length === 0}
              type="submit"
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
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
