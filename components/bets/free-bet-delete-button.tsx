"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/bets/delete-confirm-dialog";

type FreeBetDeleteButtonProps = {
  id: string;
  name: string;
  value: string;
  currency: string;
  disabled?: boolean;
};

export function FreeBetDeleteButton({
  id,
  name,
  value,
  currency,
  disabled = false,
}: FreeBetDeleteButtonProps) {
  const router = useRouter();

  const handleDelete = async () => {
    const response = await fetch(`/api/bets/free-bets/${id}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to delete free bet");
    }

    toast.success("Free bet deleted!");
    router.push("/bets/settings/promos");
    router.refresh();
  };

  return (
    <DeleteConfirmDialog
      description={`This will permanently delete the free bet "${name}" worth ${currency} ${Number.parseFloat(value).toFixed(2)}. This action cannot be undone.`}
      destructiveLabel="Delete Free Bet"
      disabled={disabled}
      onConfirm={handleDelete}
      title="Delete free bet?"
    />
  );
}
