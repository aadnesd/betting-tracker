"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Gift,
  Pencil,
  Settings2,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatNOK } from "@/lib/reporting";

type AccountTransactionType = "deposit" | "withdrawal" | "bonus" | "adjustment";

export type AccountTransactionItem = {
  id: string;
  type: AccountTransactionType;
  amount: string;
  currency: string;
  occurredAt: string;
  createdAt: string;
  notes: string | null;
  amountNok: string | null;
  bonusSubcategory: string | null;
  linkedWalletTransactionId: string | null;
  runningBalance: number;
  runningBalanceCurrency: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getTypeBadgeClassName(type: AccountTransactionType) {
  switch (type) {
    case "deposit":
    case "bonus":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "withdrawal":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function getTypeIcon(type: AccountTransactionType) {
  switch (type) {
    case "deposit":
      return <ArrowDownCircle className="mr-1 h-3 w-3" />;
    case "withdrawal":
      return <ArrowUpCircle className="mr-1 h-3 w-3" />;
    case "bonus":
      return <Gift className="mr-1 h-3 w-3" />;
    default:
      return <Settings2 className="mr-1 h-3 w-3" />;
  }
}

function isPositiveAmount(type: AccountTransactionType, amount: number) {
  if (type === "withdrawal") {
    return false;
  }
  if (type === "adjustment") {
    return amount >= 0;
  }
  return true;
}

function TransactionActions({
  transaction,
  accountId,
}: {
  transaction: AccountTransactionItem;
  accountId: string;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [type, setType] = useState<AccountTransactionType>(transaction.type);
  const [amount, setAmount] = useState(transaction.amount);
  const [currency, setCurrency] = useState(transaction.currency);
  const [occurredAtInput, setOccurredAtInput] = useState(
    transaction.occurredAt.slice(0, 10)
  );
  const [notes, setNotes] = useState(transaction.notes ?? "");

  const resetForm = () => {
    setType(transaction.type);
    setAmount(transaction.amount);
    setCurrency(transaction.currency);
    setOccurredAtInput(transaction.occurredAt.slice(0, 10));
    setNotes(transaction.notes ?? "");
  };

  const handleSave = async () => {
    const parsedAmount = Number.parseFloat(amount);
    if (
      Number.isNaN(parsedAmount) ||
      (type === "adjustment" ? parsedAmount === 0 : parsedAmount <= 0)
    ) {
      toast.error(
        type === "adjustment"
          ? "Adjustment amount must be non-zero"
          : "Amount must be a positive number"
      );
      return;
    }
    if (currency.trim().length !== 3) {
      toast.error("Currency must be a 3-letter code");
      return;
    }
    if (!occurredAtInput) {
      toast.error("Date is required");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        `/api/bets/accounts/${accountId}/transactions/${transaction.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            amount: parsedAmount,
            currency: currency.toUpperCase(),
            occurredAt: new Date(occurredAtInput).toISOString(),
            notes: notes.trim() || null,
          }),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update transaction");
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
        `/api/bets/accounts/${accountId}/transactions/${transaction.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete transaction");
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

  const displayAmount = Math.abs(Number.parseFloat(transaction.amount));

  return (
    <div className="flex items-center gap-1">
      <Dialog
        onOpenChange={(next) => {
          if (next) {
            resetForm();
          }
          setEditOpen(next);
        }}
        open={editOpen}
      >
        <DialogTrigger asChild>
          <Button
            className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            size="icon"
            variant="ghost"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only">Edit transaction</span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                onValueChange={(v) => setType(v as AccountTransactionType)}
                value={type}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="withdrawal">Withdrawal</SelectItem>
                  <SelectItem value="bonus">Bonus</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  min={type === "adjustment" ? undefined : "0.01"}
                  onChange={(e) => setAmount(e.target.value)}
                  step="0.01"
                  type="number"
                  value={amount}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  maxLength={3}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  value={currency}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                onChange={(e) => setOccurredAtInput(e.target.value)}
                type="date"
                value={occurredAtInput}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                onChange={(e) => setNotes(e.target.value)}
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
            className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            size="icon"
            variant="ghost"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Delete transaction</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this {transaction.type} of{" "}
              {formatCurrency(displayAmount, transaction.currency)}. This action
              cannot be undone.
              {transaction.linkedWalletTransactionId && (
                <span className="mt-1 block font-medium text-amber-600">
                  The linked wallet transaction will also be deleted.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AccountTransactionTable({
  transactions,
  accountId,
}: {
  transactions: AccountTransactionItem[];
  accountId: string;
}) {
  if (transactions.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p className="mb-2">No transactions recorded yet</p>
        <p className="text-sm">
          Record deposits, withdrawals, and bonuses to track your balance.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Details</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead className="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => {
          const amount = Number.parseFloat(tx.amount);
          const positive = isPositiveAmount(tx.type, amount);

          return (
            <TableRow className="group" key={tx.id}>
              <TableCell className="whitespace-nowrap">
                <div className="font-medium">
                  {formatDateTime(tx.occurredAt)}
                </div>
                <div className="text-muted-foreground text-xs">
                  Created {formatDateTime(tx.createdAt)}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  className={getTypeBadgeClassName(tx.type)}
                  variant="outline"
                >
                  {getTypeIcon(tx.type)}
                  {tx.type}
                </Badge>
                {tx.bonusSubcategory && (
                  <div className="mt-1 text-muted-foreground text-xs">
                    {tx.bonusSubcategory}
                  </div>
                )}
              </TableCell>
              <TableCell className="max-w-xs">
                <div className="truncate text-sm">{tx.notes || "-"}</div>
                {tx.amountNok !== null && (
                  <div className="text-muted-foreground text-xs">
                    {formatNOK(Number.parseFloat(tx.amountNok))}
                  </div>
                )}
                {tx.linkedWalletTransactionId && (
                  <div className="text-muted-foreground text-xs">
                    Linked wallet transfer
                  </div>
                )}
              </TableCell>
              <TableCell
                className={`text-right font-semibold ${
                  positive ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {positive ? "+" : "-"}
                {formatCurrency(Math.abs(amount), tx.currency)}
              </TableCell>
              <TableCell className="text-right">
                <div className="font-semibold text-sm">
                  {formatCurrency(tx.runningBalance, tx.runningBalanceCurrency)}
                </div>
              </TableCell>
              <TableCell>
                <TransactionActions accountId={accountId} transaction={tx} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
