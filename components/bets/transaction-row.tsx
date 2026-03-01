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

interface TransactionRowProps {
  transaction: {
    id: string;
    type: "deposit" | "withdrawal" | "bonus" | "adjustment";
    amount: string;
    currency: string;
    occurredAt: string;
    notes: string | null;
  };
  accountId: string;
}

/**
 * TransactionRow - A single transaction row with delete capability.
 *
 * Why: Allows users to manage individual transactions, including deletion
 * of incorrect or duplicate entries.
 */
export function TransactionRow({
  transaction,
  accountId,
}: TransactionRowProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [type, setType] = useState(transaction.type);
  const [amount, setAmount] = useState(transaction.amount);
  const [currency, setCurrency] = useState(transaction.currency);
  const [occurredAtInput, setOccurredAtInput] = useState(
    transaction.occurredAt.slice(0, 10)
  );
  const [notes, setNotes] = useState(transaction.notes ?? "");

  const displayAmount = Number.parseFloat(transaction.amount);
  const isPositive = transaction.type !== "withdrawal";
  const occurredAt = new Date(transaction.occurredAt);

  const icon = {
    deposit: <ArrowDownCircle className="h-5 w-5 text-green-600" />,
    withdrawal: <ArrowUpCircle className="h-5 w-5 text-red-600" />,
    bonus: <Gift className="h-5 w-5 text-blue-600" />,
    adjustment: <Settings2 className="h-5 w-5 text-gray-600" />,
  }[transaction.type];

  const handleDelete = async () => {
    setIsDeleting(true);
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
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Delete transaction error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete transaction"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = async () => {
    const parsedAmount = Number.parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Amount must be a positive number");
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

    setIsSaving(true);
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
      console.error("Update transaction error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update transaction"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="group flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/30">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="font-medium capitalize">{transaction.type}</p>
          <p className="text-muted-foreground text-xs">
            {occurredAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {transaction.notes && ` • ${transaction.notes}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <p
          className={`font-semibold ${
            isPositive ? "text-green-600" : "text-red-600"
          }`}
        >
          {isPositive ? "+" : "-"}
          {transaction.currency} {displayAmount.toFixed(2)}
        </p>

        <Dialog
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              setType(transaction.type);
              setAmount(transaction.amount);
              setCurrency(transaction.currency);
              setOccurredAtInput(transaction.occurredAt.slice(0, 10));
              setNotes(transaction.notes ?? "");
            }
            setEditOpen(nextOpen);
          }}
          open={editOpen}
        >
          <DialogTrigger asChild>
            <Button
              className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              size="icon"
              variant="ghost"
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Edit transaction</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Transaction</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`tx-type-${transaction.id}`}>Type</Label>
                <Select
                  onValueChange={(value) =>
                    setType(
                      value as "deposit" | "withdrawal" | "bonus" | "adjustment"
                    )
                  }
                  value={type}
                >
                  <SelectTrigger id={`tx-type-${transaction.id}`}>
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
              <div className="space-y-2">
                <Label htmlFor={`tx-amount-${transaction.id}`}>Amount</Label>
                <Input
                  id={`tx-amount-${transaction.id}`}
                  min="0.01"
                  onChange={(e) => setAmount(e.target.value)}
                  step="0.01"
                  type="number"
                  value={amount}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`tx-currency-${transaction.id}`}>
                  Currency
                </Label>
                <Input
                  id={`tx-currency-${transaction.id}`}
                  maxLength={3}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="NOK"
                  value={currency}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`tx-date-${transaction.id}`}>Date</Label>
                <Input
                  id={`tx-date-${transaction.id}`}
                  onChange={(e) => setOccurredAtInput(e.target.value)}
                  type="date"
                  value={occurredAtInput}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`tx-notes-${transaction.id}`}>Notes</Label>
                <Textarea
                  id={`tx-notes-${transaction.id}`}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  value={notes}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  disabled={isSaving}
                  onClick={() => setEditOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={isSaving} onClick={handleEdit}>
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog onOpenChange={setOpen} open={open}>
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
                This will permanently delete this {transaction.type} of{" "}
                {transaction.currency} {displayAmount.toFixed(2)}. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isDeleting}
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
