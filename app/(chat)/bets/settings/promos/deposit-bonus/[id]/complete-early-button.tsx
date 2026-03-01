"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
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

interface DepositBonusCompleteEarlyButtonProps {
  bonusId: string;
  bonusName: string;
}

export function DepositBonusCompleteEarlyButton({
  bonusId,
  bonusName,
}: DepositBonusCompleteEarlyButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleCompleteEarly = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/bets/deposit-bonuses/${bonusId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete_early" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to complete bonus early");
      }

      toast.success("Bonus marked as completed early");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to complete bonus early"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Complete Early
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Complete Bonus Early?</AlertDialogTitle>
          <AlertDialogDescription>
            Mark &quot;{bonusName}&quot; as completed early because the account
            balance is now zero. This keeps the wagering audit trail but closes
            the bonus before full wagering completion.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSubmitting}
            onClick={handleCompleteEarly}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete Early
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
