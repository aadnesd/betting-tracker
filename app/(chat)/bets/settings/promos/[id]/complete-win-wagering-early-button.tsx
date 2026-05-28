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

type CompleteWinWageringEarlyButtonProps = {
  freeBetId: string;
  freeBetName: string;
};

export function CompleteWinWageringEarlyButton({
  freeBetId,
  freeBetName,
}: CompleteWinWageringEarlyButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleCompleteEarly = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/bets/free-bets/${freeBetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete_win_wagering_early" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Failed to complete winnings wagering early"
        );
      }

      toast.success("Winnings wagering marked as completed early");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to complete winnings wagering early"
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
          <AlertDialogTitle>Complete Wagering Early?</AlertDialogTitle>
          <AlertDialogDescription>
            Mark &quot;{freeBetName}&quot; winnings wagering as completed early.
            This stops future wagering tracking while keeping the recorded
            progress and audit trail.
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
