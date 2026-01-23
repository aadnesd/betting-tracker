"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { Loader2, Ban } from "lucide-react";

interface DepositBonusForfeitButtonProps {
  bonusId: string;
  bonusName: string;
}

export function DepositBonusForfeitButton({
  bonusId,
  bonusName,
}: DepositBonusForfeitButtonProps) {
  const router = useRouter();
  const [isForfeiting, setIsForfeiting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleForfeit = async () => {
    setIsForfeiting(true);
    try {
      const response = await fetch(`/api/bets/deposit-bonuses/${bonusId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forfeit" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to forfeit bonus");
      }

      toast.success("Bonus forfeited");
      setOpen(false);
      router.push("/bets/settings/promos");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to forfeit bonus"
      );
    } finally {
      setIsForfeiting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Ban className="mr-1 h-3 w-3" />
          Forfeit
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Forfeit Deposit Bonus?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to forfeit &quot;{bonusName}&quot;? This action cannot
            be undone. You will lose the bonus amount and any remaining wagering
            progress.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isForfeiting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleForfeit}
            disabled={isForfeiting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isForfeiting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Forfeit Bonus
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
