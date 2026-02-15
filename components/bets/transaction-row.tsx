"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Gift,
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
  const [isDeleting, setIsDeleting] = useState(false);

  const amount = Number.parseFloat(transaction.amount);
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
          {transaction.currency} {amount.toFixed(2)}
        </p>

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
                {transaction.currency} {amount.toFixed(2)}. This action cannot
                be undone.
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
