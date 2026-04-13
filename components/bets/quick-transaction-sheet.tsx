"use client";

import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Gift,
  Loader2,
  Receipt,
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
  currentBalance?: string;
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

// --- Account transaction types ---
type AccountTransactionType = "deposit" | "withdrawal" | "bonus" | "adjustment";

interface AccountFormData {
  accountId: string;
  type: AccountTransactionType;
  amount: string;
  currency: string;
  occurredAt: Date;
  notes: string;
  walletId: string;
  walletAmount: string;
}

// --- Wallet transaction types ---
type WalletTransactionType =
  | "deposit"
  | "withdrawal"
  | "transfer_to_account"
  | "transfer_from_account"
  | "transfer_to_wallet"
  | "transfer_from_wallet"
  | "fee"
  | "adjustment";

interface WalletFormData {
  walletId: string;
  type: WalletTransactionType;
  amount: string;
  currency: string;
  date: Date;
  notes: string;
  relatedAccountId: string;
  relatedWalletId: string;
  relatedWalletAmount: string;
}

type TabMode = "account" | "wallet";

const CURRENCIES = ["NOK", "EUR", "GBP", "USD", "SEK", "DKK"] as const;

const ACCOUNT_TRANSACTION_TYPES: {
  value: AccountTransactionType;
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

const WALLET_TRANSACTION_TYPES: {
  value: WalletTransactionType;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    value: "deposit",
    label: "Deposit",
    icon: <ArrowDownCircle className="h-4 w-4 text-green-600" />,
    description: "Money added to wallet (e.g., bank transfer in)",
  },
  {
    value: "withdrawal",
    label: "Withdrawal",
    icon: <ArrowUpCircle className="h-4 w-4 text-red-600" />,
    description: "Money withdrawn from wallet (e.g., bank transfer out)",
  },
  {
    value: "transfer_to_account",
    label: "To Account",
    icon: <ArrowUpCircle className="h-4 w-4 text-orange-600" />,
    description: "Transfer from wallet to bookmaker/exchange",
  },
  {
    value: "transfer_from_account",
    label: "From Account",
    icon: <ArrowDownCircle className="h-4 w-4 text-teal-600" />,
    description: "Transfer from bookmaker/exchange to wallet",
  },
  {
    value: "transfer_to_wallet",
    label: "To Wallet",
    icon: <ArrowLeftRight className="h-4 w-4 text-purple-600" />,
    description: "Transfer to another wallet",
  },
  {
    value: "transfer_from_wallet",
    label: "From Wallet",
    icon: <ArrowLeftRight className="h-4 w-4 text-indigo-600" />,
    description: "Receive from another wallet",
  },
  {
    value: "fee",
    label: "Fee",
    icon: <Receipt className="h-4 w-4 text-amber-600" />,
    description: "Service fee, transaction fee, etc.",
  },
  {
    value: "adjustment",
    label: "Adjustment",
    icon: <Settings className="h-4 w-4 text-gray-600" />,
    description: "Manual balance correction",
  },
];

// Helper to check if wallet type needs a related account
function walletTypeNeedsAccount(type: WalletTransactionType): boolean {
  return type === "transfer_to_account" || type === "transfer_from_account";
}

// Helper to check if wallet type needs a related wallet
function walletTypeNeedsWallet(type: WalletTransactionType): boolean {
  return type === "transfer_to_wallet" || type === "transfer_from_wallet";
}

export function QuickTransactionSheet({
  accounts,
  wallets = [],
  trigger,
  defaultOpen = false,
  onSuccess,
}: QuickTransactionSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<TabMode>("account");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Account form state ---
  const [accountForm, setAccountForm] = useState<AccountFormData>({
    accountId: "",
    type: "bonus",
    amount: "",
    currency: "NOK",
    occurredAt: new Date(),
    notes: "",
    walletId: "",
    walletAmount: "",
  });
  const [accountErrors, setAccountErrors] = useState<
    Partial<Record<keyof AccountFormData, string>>
  >({});

  // --- Wallet form state ---
  const [walletForm, setWalletForm] = useState<WalletFormData>({
    walletId: "",
    type: "deposit",
    amount: "",
    currency: "NOK",
    date: new Date(),
    notes: "",
    relatedAccountId: "",
    relatedWalletId: "",
    relatedWalletAmount: "",
  });
  const [walletErrors, setWalletErrors] = useState<
    Partial<Record<keyof WalletFormData, string>>
  >({});

  // --- Derived state (account tab) ---
  const selectedAccount = accounts.find((a) => a.id === accountForm.accountId);
  const selectedAccountWallet = wallets.find(
    (w) => w.id === accountForm.walletId
  );
  const showAccountWalletAmount =
    selectedAccountWallet &&
    selectedAccountWallet.currency !== accountForm.currency;

  // --- Derived state (wallet tab) ---
  const selectedWallet = wallets.find((w) => w.id === walletForm.walletId);
  const selectedRelatedWallet = wallets.find(
    (w) => w.id === walletForm.relatedWalletId
  );
  const showCrossCurrencyWalletTransfer =
    walletTypeNeedsWallet(walletForm.type) &&
    selectedWallet &&
    selectedRelatedWallet &&
    selectedWallet.currency !== selectedRelatedWallet.currency;

  // --- Account form helpers ---
  const updateAccountField = <K extends keyof AccountFormData>(
    field: K,
    value: AccountFormData[K]
  ) => {
    setAccountForm((prev) => ({ ...prev, [field]: value }));
    if (accountErrors[field]) {
      setAccountErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleAccountChange = (accountId: string) => {
    const acct = accounts.find((a) => a.id === accountId);
    setAccountForm((prev) => ({
      ...prev,
      accountId,
      currency: acct?.currency || prev.currency,
    }));
    if (accountErrors.accountId) {
      setAccountErrors((prev) => ({ ...prev, accountId: undefined }));
    }
  };

  // --- Wallet form helpers ---
  const updateWalletField = <K extends keyof WalletFormData>(
    field: K,
    value: WalletFormData[K]
  ) => {
    setWalletForm((prev) => ({ ...prev, [field]: value }));
    if (walletErrors[field]) {
      setWalletErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleWalletChange = (walletId: string) => {
    const w = wallets.find((wal) => wal.id === walletId);
    setWalletForm((prev) => ({
      ...prev,
      walletId,
      currency: w?.currency || prev.currency,
    }));
    if (walletErrors.walletId) {
      setWalletErrors((prev) => ({ ...prev, walletId: undefined }));
    }
  };

  // --- Reset ---
  const resetForm = () => {
    setAccountForm({
      accountId: "",
      type: "bonus",
      amount: "",
      currency: "NOK",
      occurredAt: new Date(),
      notes: "",
      walletId: "",
      walletAmount: "",
    });
    setAccountErrors({});
    setWalletForm({
      walletId: "",
      type: "deposit",
      amount: "",
      currency: "NOK",
      date: new Date(),
      notes: "",
      relatedAccountId: "",
      relatedWalletId: "",
      relatedWalletAmount: "",
    });
    setWalletErrors({});
  };

  // --- Validation (account) ---
  const validateAccountForm = (): boolean => {
    const newErrors: Partial<Record<keyof AccountFormData, string>> = {};

    if (!accountForm.accountId) {
      newErrors.accountId = "Please select an account";
    }

    const amount = Number.parseFloat(accountForm.amount);
    if (!accountForm.amount || Number.isNaN(amount)) {
      newErrors.amount = "Amount is required";
    } else if (amount <= 0) {
      newErrors.amount = "Amount must be positive";
    }

    if (!accountForm.currency) {
      newErrors.currency = "Currency is required";
    }

    if (showAccountWalletAmount) {
      const walletAmt = Number.parseFloat(accountForm.walletAmount);
      if (!accountForm.walletAmount || Number.isNaN(walletAmt)) {
        newErrors.walletAmount =
          "Wallet amount is required for cross-currency transfers";
      } else if (walletAmt <= 0) {
        newErrors.walletAmount = "Wallet amount must be positive";
      }
    }

    setAccountErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Validation (wallet) ---
  const validateWalletForm = (): boolean => {
    const newErrors: Partial<Record<keyof WalletFormData, string>> = {};

    if (!walletForm.walletId) {
      newErrors.walletId = "Please select a wallet";
    }

    const amount = Number.parseFloat(walletForm.amount);
    if (!walletForm.amount || Number.isNaN(amount)) {
      newErrors.amount = "Amount is required";
    } else if (amount <= 0) {
      newErrors.amount = "Amount must be positive";
    }

    if (!walletForm.currency) {
      newErrors.currency = "Currency is required";
    }

    if (
      walletTypeNeedsAccount(walletForm.type) &&
      !walletForm.relatedAccountId
    ) {
      newErrors.relatedAccountId = "Please select an account";
    }

    if (walletTypeNeedsWallet(walletForm.type) && !walletForm.relatedWalletId) {
      newErrors.relatedWalletId = "Please select a wallet";
    }

    if (
      walletTypeNeedsWallet(walletForm.type) &&
      walletForm.relatedWalletId === walletForm.walletId
    ) {
      newErrors.relatedWalletId = "Cannot transfer to the same wallet";
    }

    if (showCrossCurrencyWalletTransfer) {
      const relAmt = Number.parseFloat(walletForm.relatedWalletAmount);
      if (!walletForm.relatedWalletAmount || Number.isNaN(relAmt)) {
        newErrors.relatedWalletAmount =
          "Amount in destination currency is required";
      } else if (relAmt <= 0) {
        newErrors.relatedWalletAmount = "Amount must be positive";
      }
    }

    setWalletErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Submit (account) ---
  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateAccountForm()) {
      toast.error("Please fix the errors below");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        type: accountForm.type,
        amount: Number.parseFloat(accountForm.amount),
        currency: accountForm.currency,
        occurredAt: accountForm.occurredAt.toISOString(),
        notes: accountForm.notes.trim() || null,
        walletId: accountForm.walletId || null,
      };

      if (showAccountWalletAmount && selectedAccountWallet) {
        payload.walletAmount = Number.parseFloat(accountForm.walletAmount);
        payload.walletCurrency = selectedAccountWallet.currency;
      }

      const response = await fetch(
        `/api/bets/accounts/${accountForm.accountId}/transactions`,
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
        ACCOUNT_TRANSACTION_TYPES.find((t) => t.value === accountForm.type)
          ?.label || accountForm.type;
      toast.success(
        `${typeLabel} of ${accountForm.currency} ${accountForm.amount} recorded for ${selectedAccount?.name}!`
      );

      setOpen(false);
      resetForm();
      onSuccess?.();
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

  // --- Submit (wallet) ---
  const handleWalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateWalletForm()) {
      toast.error("Please fix the errors below");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        type: walletForm.type,
        amount: Number.parseFloat(walletForm.amount),
        currency: walletForm.currency,
        date: walletForm.date.toISOString(),
        notes: walletForm.notes.trim() || null,
      };

      if (walletTypeNeedsAccount(walletForm.type)) {
        payload.relatedAccountId = walletForm.relatedAccountId;
      }

      if (walletTypeNeedsWallet(walletForm.type)) {
        payload.relatedWalletId = walletForm.relatedWalletId;
      }

      if (showCrossCurrencyWalletTransfer) {
        payload.relatedWalletAmount = Number.parseFloat(
          walletForm.relatedWalletAmount
        );
      }

      const response = await fetch(
        `/api/bets/wallets/${walletForm.walletId}/transactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create wallet transaction");
      }

      const typeLabel =
        WALLET_TRANSACTION_TYPES.find((t) => t.value === walletForm.type)
          ?.label || walletForm.type;
      toast.success(
        `${typeLabel} of ${walletForm.currency} ${walletForm.amount} recorded for ${selectedWallet?.name}!`
      );

      setOpen(false);
      resetForm();
      onSuccess?.();
      router.refresh();
    } catch (error) {
      console.error("Create wallet transaction error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create wallet transaction"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group accounts by kind
  const bookmakers = accounts.filter((a) => a.kind === "bookmaker");
  const exchanges = accounts.filter((a) => a.kind === "exchange");

  // Other wallets (exclude selected) for transfer picker
  const otherWallets = wallets.filter((w) => w.id !== walletForm.walletId);

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
        <SheetHeader className="mb-4">
          <SheetTitle>Quick Transaction</SheetTitle>
          <SheetDescription>
            {tab === "account"
              ? "Record a deposit, withdrawal, or bonus for any account."
              : "Record a wallet deposit, withdrawal, transfer, or fee."}
          </SheetDescription>
        </SheetHeader>

        {/* Tab Toggle */}
        {wallets.length > 0 && (
          <div className="mb-5 flex rounded-lg border bg-muted p-1">
            <button
              className={`flex-1 rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
                tab === "account"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTab("account")}
              type="button"
            >
              Account
            </button>
            <button
              className={`flex-1 rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
                tab === "wallet"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTab("wallet")}
              type="button"
            >
              Wallet
            </button>
          </div>
        )}

        {/* ================= ACCOUNT TAB ================= */}
        {tab === "account" && (
          <form className="space-y-5" onSubmit={handleAccountSubmit}>
            {/* Account Selector */}
            <div className="space-y-2">
              <Label htmlFor="account">Account</Label>
              <Select
                onValueChange={handleAccountChange}
                value={accountForm.accountId}
              >
                <SelectTrigger
                  className={
                    accountErrors.accountId ? "border-destructive" : ""
                  }
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
              {accountErrors.accountId && (
                <p className="text-destructive text-xs">
                  {accountErrors.accountId}
                </p>
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
                {ACCOUNT_TRANSACTION_TYPES.map((t) => (
                  <Button
                    className="justify-start"
                    key={t.value}
                    onClick={() => {
                      updateAccountField("type", t.value);
                      if (t.value !== "deposit" && t.value !== "withdrawal") {
                        updateAccountField("walletId", "");
                        updateAccountField("walletAmount", "");
                      }
                    }}
                    type="button"
                    variant={
                      accountForm.type === t.value ? "default" : "outline"
                    }
                  >
                    {t.icon}
                    <span className="ml-2">{t.label}</span>
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {
                  ACCOUNT_TRANSACTION_TYPES.find(
                    (t) => t.value === accountForm.type
                  )?.description
                }
              </p>
            </div>

            {/* Wallet Selector - Only for deposits and withdrawals */}
            {(accountForm.type === "deposit" ||
              accountForm.type === "withdrawal") &&
              wallets.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="wallet">
                    <span className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      {accountForm.type === "deposit"
                        ? "From Wallet (optional)"
                        : "To Wallet (optional)"}
                    </span>
                  </Label>
                  <Select
                    onValueChange={(value) =>
                      updateAccountField(
                        "walletId",
                        value === "none" ? "" : value
                      )
                    }
                    value={accountForm.walletId}
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
                    {accountForm.type === "deposit"
                      ? "If selected, the wallet balance will decrease by this amount."
                      : "If selected, the wallet balance will increase by this amount."}
                  </p>
                </div>
              )}

            {/* Wallet Amount for cross-currency transfers */}
            {showAccountWalletAmount && selectedAccountWallet && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                <Label
                  className="flex items-center gap-2"
                  htmlFor="walletAmount"
                >
                  <Wallet className="h-4 w-4" />
                  Amount in {selectedAccountWallet.currency}
                </Label>
                <Input
                  className={
                    accountErrors.walletAmount ? "border-destructive" : ""
                  }
                  id="walletAmount"
                  min="0.01"
                  onChange={(e) =>
                    updateAccountField("walletAmount", e.target.value)
                  }
                  placeholder={`0.00 ${selectedAccountWallet.currency}`}
                  step="0.01"
                  type="number"
                  value={accountForm.walletAmount}
                />
                {accountErrors.walletAmount && (
                  <p className="text-destructive text-xs">
                    {accountErrors.walletAmount}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Account uses {accountForm.currency}, wallet uses{" "}
                  {selectedAccountWallet.currency}. Enter the equivalent amount
                  in {selectedAccountWallet.currency}.
                </p>
              </div>
            )}

            {/* Amount and Currency */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  className={accountErrors.amount ? "border-destructive" : ""}
                  id="amount"
                  min="0.01"
                  onChange={(e) => updateAccountField("amount", e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={accountForm.amount}
                />
                {accountErrors.amount && (
                  <p className="text-destructive text-xs">
                    {accountErrors.amount}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  onValueChange={(value) =>
                    updateAccountField("currency", value)
                  }
                  value={accountForm.currency}
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
                {accountErrors.currency && (
                  <p className="text-destructive text-xs">
                    {accountErrors.currency}
                  </p>
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
                    updateAccountField("occurredAt", date);
                  }
                }}
                type="date"
                value={accountForm.occurredAt.toISOString().split("T")[0]}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                onChange={(e) => updateAccountField("notes", e.target.value)}
                placeholder="e.g., Welcome bonus, Stake refund, etc."
                rows={2}
                value={accountForm.notes}
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
        )}

        {/* ================= WALLET TAB ================= */}
        {tab === "wallet" && (
          <form className="space-y-5" onSubmit={handleWalletSubmit}>
            {/* Wallet Selector */}
            <div className="space-y-2">
              <Label htmlFor="walletSelect">Wallet</Label>
              <Select
                onValueChange={handleWalletChange}
                value={walletForm.walletId}
              >
                <SelectTrigger
                  className={walletErrors.walletId ? "border-destructive" : ""}
                >
                  <SelectValue placeholder="Select a wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.length === 0 && (
                    <div className="px-2 py-3 text-muted-foreground text-sm">
                      No wallets found. Create one first.
                    </div>
                  )}
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center justify-between gap-4">
                        <span>{w.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {w.currency}
                          {w.currentBalance != null &&
                            ` ${Number(w.currentBalance).toFixed(0)}`}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {walletErrors.walletId && (
                <p className="text-destructive text-xs">
                  {walletErrors.walletId}
                </p>
              )}
              {selectedWallet?.currentBalance != null && (
                <p className="text-muted-foreground text-xs">
                  Current balance: {selectedWallet.currency}{" "}
                  {Number(selectedWallet.currentBalance).toFixed(2)}
                </p>
              )}
            </div>

            {/* Transaction Type */}
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {WALLET_TRANSACTION_TYPES.map((t) => (
                  <Button
                    className="justify-start text-xs"
                    key={t.value}
                    onClick={() => {
                      updateWalletField("type", t.value);
                      // Clear related fields when type changes
                      if (!walletTypeNeedsAccount(t.value)) {
                        updateWalletField("relatedAccountId", "");
                      }
                      if (!walletTypeNeedsWallet(t.value)) {
                        updateWalletField("relatedWalletId", "");
                        updateWalletField("relatedWalletAmount", "");
                      }
                    }}
                    size="sm"
                    type="button"
                    variant={
                      walletForm.type === t.value ? "default" : "outline"
                    }
                  >
                    {t.icon}
                    <span className="ml-1.5">{t.label}</span>
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {
                  WALLET_TRANSACTION_TYPES.find(
                    (t) => t.value === walletForm.type
                  )?.description
                }
              </p>
            </div>

            {/* Related Account Selector (for transfer_to_account / transfer_from_account) */}
            {walletTypeNeedsAccount(walletForm.type) && (
              <div className="space-y-2">
                <Label>
                  {walletForm.type === "transfer_to_account"
                    ? "Destination Account"
                    : "Source Account"}
                </Label>
                <Select
                  onValueChange={(value) =>
                    updateWalletField("relatedAccountId", value)
                  }
                  value={walletForm.relatedAccountId}
                >
                  <SelectTrigger
                    className={
                      walletErrors.relatedAccountId ? "border-destructive" : ""
                    }
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
                  </SelectContent>
                </Select>
                {walletErrors.relatedAccountId && (
                  <p className="text-destructive text-xs">
                    {walletErrors.relatedAccountId}
                  </p>
                )}
              </div>
            )}

            {/* Related Wallet Selector (for transfer_to_wallet / transfer_from_wallet) */}
            {walletTypeNeedsWallet(walletForm.type) && (
              <div className="space-y-2">
                <Label>
                  {walletForm.type === "transfer_to_wallet"
                    ? "Destination Wallet"
                    : "Source Wallet"}
                </Label>
                <Select
                  onValueChange={(value) =>
                    updateWalletField("relatedWalletId", value)
                  }
                  value={walletForm.relatedWalletId}
                >
                  <SelectTrigger
                    className={
                      walletErrors.relatedWalletId ? "border-destructive" : ""
                    }
                  >
                    <SelectValue placeholder="Select a wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherWallets.length === 0 && (
                      <div className="px-2 py-3 text-muted-foreground text-sm">
                        No other wallets available.
                      </div>
                    )}
                    {otherWallets.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{w.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {w.currency}
                            {w.currentBalance != null &&
                              ` ${Number(w.currentBalance).toFixed(0)}`}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {walletErrors.relatedWalletId && (
                  <p className="text-destructive text-xs">
                    {walletErrors.relatedWalletId}
                  </p>
                )}
              </div>
            )}

            {/* Cross-currency wallet transfer amount */}
            {showCrossCurrencyWalletTransfer && selectedRelatedWallet && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                <Label className="flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4" />
                  Amount in {selectedRelatedWallet.currency}
                </Label>
                <Input
                  className={
                    walletErrors.relatedWalletAmount ? "border-destructive" : ""
                  }
                  min="0.01"
                  onChange={(e) =>
                    updateWalletField("relatedWalletAmount", e.target.value)
                  }
                  placeholder={`0.00 ${selectedRelatedWallet.currency}`}
                  step="0.01"
                  type="number"
                  value={walletForm.relatedWalletAmount}
                />
                {walletErrors.relatedWalletAmount && (
                  <p className="text-destructive text-xs">
                    {walletErrors.relatedWalletAmount}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Source uses {selectedWallet?.currency}, destination uses{" "}
                  {selectedRelatedWallet.currency}. Enter the equivalent amount
                  received.
                </p>
              </div>
            )}

            {/* Amount and Currency */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="walletAmount">Amount</Label>
                <Input
                  className={walletErrors.amount ? "border-destructive" : ""}
                  id="walletAmount"
                  min="0.01"
                  onChange={(e) => updateWalletField("amount", e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={walletForm.amount}
                />
                {walletErrors.amount && (
                  <p className="text-destructive text-xs">
                    {walletErrors.amount}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="walletCurrency">Currency</Label>
                <Select
                  onValueChange={(value) =>
                    updateWalletField("currency", value)
                  }
                  value={walletForm.currency}
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
                {walletErrors.currency && (
                  <p className="text-destructive text-xs">
                    {walletErrors.currency}
                  </p>
                )}
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="walletDate">Date</Label>
              <Input
                id="walletDate"
                onChange={(e) => {
                  const date = new Date(e.target.value);
                  if (!Number.isNaN(date.getTime())) {
                    updateWalletField("date", date);
                  }
                }}
                type="date"
                value={walletForm.date.toISOString().split("T")[0]}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="walletNotes">Notes (optional)</Label>
              <Textarea
                id="walletNotes"
                onChange={(e) => updateWalletField("notes", e.target.value)}
                placeholder="e.g., Skrill to Revolut, deposit from bank, etc."
                rows={2}
                value={walletForm.notes}
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
                disabled={isSubmitting || wallets.length === 0}
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
        )}
      </SheetContent>
    </Sheet>
  );
}
