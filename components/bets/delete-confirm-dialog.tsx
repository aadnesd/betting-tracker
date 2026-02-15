"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";

interface DeleteConfirmDialogProps {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  trigger?: React.ReactNode;
  destructiveLabel?: string;
  /** For matched bets: show cascade option */
  showCascadeOption?: boolean;
  onCascadeChange?: (cascade: boolean) => void;
  disabled?: boolean;
}

/**
 * DeleteConfirmDialog - Reusable confirmation dialog for delete operations.
 *
 * Why: Prevents accidental data loss by requiring explicit confirmation.
 * Shows a destructive action dialog with customizable title, description,
 * and optional cascade checkbox for matched bets.
 */
export function DeleteConfirmDialog({
  title,
  description,
  onConfirm,
  trigger,
  destructiveLabel = "Delete",
  showCascadeOption = false,
  onCascadeChange,
  disabled = false,
}: DeleteConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cascade, setCascade] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (error) {
      // Error handling is done in the onConfirm callback
      console.error("Delete failed:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCascadeChange = (checked: boolean) => {
    setCascade(checked);
    onCascadeChange?.(checked);
  };

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button disabled={disabled} size="sm" variant="destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            {destructiveLabel}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {showCascadeOption && (
          <div className="flex items-start space-x-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <Checkbox
              checked={cascade}
              id="cascade"
              onCheckedChange={(checked) =>
                handleCascadeChange(checked === true)
              }
            />
            <div className="grid gap-1.5 leading-none">
              <label
                className="cursor-pointer font-medium text-amber-800 text-sm"
                htmlFor="cascade"
              >
                Also delete linked back and lay bets
              </label>
              <p className="text-amber-700 text-xs">
                If unchecked, the back/lay bets will be orphaned but not
                deleted.
              </p>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isDeleting}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            {isDeleting ? "Deleting..." : destructiveLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
