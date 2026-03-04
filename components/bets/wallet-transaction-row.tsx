"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import type { WalletTransactionType } from "@/lib/db/schema";

type WalletTransactionItem = {
  id: string;
  type: WalletTransactionType;
  amount: string;
  currency: string;
  date: string;
  notes: string | null;
  externalRef: string | null;
  relatedAccountId: string | null;
  relatedWalletId: string | null;
  relatedAccountName: string | null;
  relatedWalletName: string | null;
};

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

const TRANSACTION_TYPES: { value: WalletTransactionType; label: string }[] = [
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "transfer_to_account", label: "Transfer to Account" },
  { value: "transfer_from_account", label: "Transfer from Account" },
  { value: "transfer_to_wallet", label: "Transfer to Wallet" },
  { value: "transfer_from_wallet", label: "Transfer from Wallet" },
  { value: "fee", label: "Fee" },
  { value: "adjustment", label: "Adjustment" },
];

function isInflow(type: WalletTransactionType): boolean {
  return ["deposit", "transfer_from_account", "transfer_from_wallet"].includes(
    type
  );
}

function transactionTypeLabel(type: WalletTransactionType): string {
  const row = TRANSACTION_TYPES.find((item) => item.value === type);
  return row ? row.label : type;
}

function TransactionTypeIcon({ type }: { type: WalletTransactionType }) {
  switch (type) {
    case "deposit":
    case "transfer_from_account":
    case "transfer_from_wallet":
      return <ArrowDownRight className="h-4 w-4 text-green-600" />;
    case "withdrawal":
    case "transfer_to_account":
    case "transfer_to_wallet":
    case "fee":
      return <ArrowUpRight className="h-4 w-4 text-red-600" />;
    default:
      return <Settings className="h-4 w-4 text-gray-600" />;
  }
}

interface WalletTransactionRowProps {
  walletId: string;
  transaction: WalletTransactionItem;
}

export function WalletTransactionRow({
  walletId,
  transaction,
}: WalletTransactionRowProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);

  const [type, setType] = useState<WalletTransactionType>(transaction.type);
  const [amount, setAmount] = useState(transaction.amount);
  const [currency, setCurrency] = useState(transaction.currency);
  const [date, setDate] = useState(transaction.date.slice(0, 16));
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [externalRef, setExternalRef] = useState(transaction.externalRef ?? "");
  const [relatedAccountId, setRelatedAccountId] = useState(
    transaction.relatedAccountId ?? ""
  );
  const [relatedWalletId, setRelatedWalletId] = useState(
    transaction.relatedWalletId ?? ""
  );

  const needsAccount = useMemo(
    () => type === "transfer_to_account" || type === "transfer_from_account",
    [type]
  );
  const needsWallet = useMemo(
    () => type === "transfer_to_wallet" || type === "transfer_from_wallet",
    [type]
  );

  useEffect(() => {
    if (!editOpen) {
      return;
    }

    fetch("/api/bets/accounts")
      .then((res) => res.json())
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]));

    fetch("/api/bets/wallets")
      .then((res) => res.json())
      .then((data) => {
        const allWallets = Array.isArray(data) ? data : [];
        setWallets(
          allWallets.filter((wallet: Wallet) => wallet.id !== walletId)
        );
      })
      .catch(() => setWallets([]));
  }, [editOpen, walletId]);

  const resetForm = () => {
    setType(transaction.type);
    setAmount(transaction.amount);
    setCurrency(transaction.currency);
    setDate(transaction.date.slice(0, 16));
    setNotes(transaction.notes ?? "");
    setExternalRef(transaction.externalRef ?? "");
    setRelatedAccountId(transaction.relatedAccountId ?? "");
    setRelatedWalletId(transaction.relatedWalletId ?? "");
  };

  const handleSave = async () => {
    const parsedAmount = Number.parseFloat(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!date) {
      toast.error("Date and time are required");
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
      const response = await fetch(
        `/api/bets/wallets/${walletId}/transactions/${transaction.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            amount: parsedAmount,
            currency,
            date: new Date(date).toISOString(),
            relatedAccountId: needsAccount ? relatedAccountId : null,
            relatedWalletId: needsWallet ? relatedWalletId : null,
            externalRef: externalRef.trim() || null,
            notes: notes.trim() || null,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to update transaction");
      }

      toast.success("Transaction updated");
      setEditOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update transaction"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/bets/wallets/${walletId}/transactions/${transaction.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "Failed to delete transaction");
      }

      toast.success("Transaction deleted");
      setDeleteOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete transaction"
      );
    } finally {
      setDeleting(false);
    }
  };

  const amountValue = Number(transaction.amount);
  const positive = isInflow(transaction.type);

  return (
    <div className="group flex items-center justify-between rounded-md border p-3">
      <div className="flex items-center gap-3">
        <TransactionTypeIcon type={transaction.type} />
        <div>
          <p className="font-medium">
            {transactionTypeLabel(transaction.type)}
          </p>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span>
              {new Date(transaction.date).toLocaleString([], {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {transaction.relatedAccountName && (
              <span>• {transaction.relatedAccountName}</span>
            )}
            {transaction.relatedWalletName && (
              <span>• {transaction.relatedWalletName}</span>
            )}
            {transaction.externalRef && (
              <span className="max-w-[150px] truncate">
                • Ref: {transaction.externalRef}
              </span>
            )}
          </div>
          {transaction.notes && (
            <p className="mt-1 text-muted-foreground text-xs">
              {transaction.notes}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <p
          className={`font-semibold ${positive ? "text-green-600" : "text-red-600"}`}
        >
          {positive ? "+" : "-"}
          {transaction.currency} {Math.abs(amountValue).toFixed(2)}
        </p>

        <Dialog
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              resetForm();
            }
            setEditOpen(nextOpen);
          }}
          open={editOpen}
        >
          <DialogTrigger asChild>
            <Button
              className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              size="icon"
              variant="ghost"
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Edit transaction</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Wallet Transaction</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`wallet-tx-type-${transaction.id}`}>Type</Label>
                <Select
                  onValueChange={(value) =>
                    setType(value as WalletTransactionType)
                  }
                  value={type}
                >
                  <SelectTrigger id={`wallet-tx-type-${transaction.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPES.map((txType) => (
                      <SelectItem key={txType.value} value={txType.value}>
                        {txType.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`wallet-tx-amount-${transaction.id}`}>
                    Amount
                  </Label>
                  <Input
                    id={`wallet-tx-amount-${transaction.id}`}
                    min="0.01"
                    onChange={(event) => setAmount(event.target.value)}
                    step="0.01"
                    type="number"
                    value={amount}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`wallet-tx-currency-${transaction.id}`}>
                    Currency
                  </Label>
                  <Input
                    id={`wallet-tx-currency-${transaction.id}`}
                    onChange={(event) => setCurrency(event.target.value)}
                    value={currency}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`wallet-tx-date-${transaction.id}`}>
                  Date & time
                </Label>
                <Input
                  id={`wallet-tx-date-${transaction.id}`}
                  onChange={(event) => setDate(event.target.value)}
                  type="datetime-local"
                  value={date}
                />
              </div>

              {needsAccount && (
                <div className="space-y-2">
                  <Label htmlFor={`wallet-tx-account-${transaction.id}`}>
                    Betting Account
                  </Label>
                  <Select
                    onValueChange={setRelatedAccountId}
                    value={relatedAccountId}
                  >
                    <SelectTrigger id={`wallet-tx-account-${transaction.id}`}>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.kind})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {needsWallet && (
                <div className="space-y-2">
                  <Label htmlFor={`wallet-tx-wallet-${transaction.id}`}>
                    Related Wallet
                  </Label>
                  <Select
                    onValueChange={setRelatedWalletId}
                    value={relatedWalletId}
                  >
                    <SelectTrigger id={`wallet-tx-wallet-${transaction.id}`}>
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((wallet) => (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          {wallet.name} ({wallet.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor={`wallet-tx-ref-${transaction.id}`}>
                  External Reference
                </Label>
                <Input
                  id={`wallet-tx-ref-${transaction.id}`}
                  onChange={(event) => setExternalRef(event.target.value)}
                  value={externalRef}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`wallet-tx-notes-${transaction.id}`}>
                  Notes
                </Label>
                <Textarea
                  id={`wallet-tx-notes-${transaction.id}`}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  value={notes}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  disabled={saving}
                  onClick={() => setEditOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={saving} onClick={handleSave}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
          <AlertDialogTrigger asChild>
            <Button
              className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              size="icon"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete transaction</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this transaction. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={(event) => {
                  event.preventDefault();
                  handleDelete();
                }}
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
