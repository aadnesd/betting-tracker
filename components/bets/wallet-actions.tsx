"use client";

import { Archive, Trash2 } from "lucide-react";
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

interface WalletActionsProps {
  walletId: string;
  walletName: string;
}

export function WalletActions({ walletId, walletName }: WalletActionsProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleArchive = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/bets/wallets/${walletId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to archive wallet");
      }

      toast.success("Wallet archived");
      router.push("/bets/settings/wallets");
      router.refresh();
    } catch (error) {
      toast.error("Failed to archive wallet");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePermanentDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/bets/wallets/${walletId}?hard=true`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete wallet");
      }

      toast.success("Wallet permanently deleted");
      router.push("/bets/settings/wallets");
      router.refresh();
    } catch (error) {
      toast.error("Failed to delete wallet");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={isDeleting} size="sm" variant="outline">
            <Archive className="mr-2 h-4 w-4" />
            Archive
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{walletName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the wallet from your active list. The wallet and
              its transactions will be preserved and can be restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={isDeleting} size="sm" variant="destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete "{walletName}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              wallet and all associated transactions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handlePermanentDelete}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
