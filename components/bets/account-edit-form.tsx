"use client";

import { Building2, CreditCard, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/bets/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AccountEditFormProps {
  account: {
    id: string;
    name: string;
    kind: "bookmaker" | "exchange";
    currency: string | null;
    commission: number | null;
    status: "active" | "archived";
  };
}

interface FormData {
  name: string;
  kind: "bookmaker" | "exchange";
  currency: string;
  commission: string;
  status: "active" | "archived";
}

const CURRENCIES = ["NOK", "EUR", "GBP", "USD", "SEK", "DKK"] as const;

export function AccountEditForm({ account }: AccountEditFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    name: account.name,
    kind: account.kind,
    currency: account.currency ?? "NOK",
    commission: account.commission?.toString() ?? "",
    status: account.status,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Account name is required";
    }

    if (
      formData.kind === "exchange" &&
      formData.commission &&
      (Number.parseFloat(formData.commission) < 0 ||
        Number.parseFloat(formData.commission) > 100)
    ) {
      newErrors.commission = "Commission must be between 0 and 100%";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors below");
      return;
    }

    setIsSubmitting(true);

    try {
      const commissionDecimal = formData.commission
        ? Number.parseFloat(formData.commission) / 100
        : null;

      const response = await fetch("/api/bets/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: account.id,
          name: formData.name.trim(),
          kind: formData.kind,
          currency: formData.currency || null,
          commission: formData.kind === "exchange" ? commissionDecimal : null,
          status: formData.status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update account");
      }

      toast.success("Account updated!");
      router.refresh();
    } catch (error) {
      console.error("Update account error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update account"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges =
    formData.name !== account.name ||
    formData.kind !== account.kind ||
    formData.currency !== (account.currency ?? "NOK") ||
    formData.commission !== (account.commission?.toString() ?? "") ||
    formData.status !== account.status;

  const handleDelete = async () => {
    const response = await fetch(`/api/bets/accounts/${account.id}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to delete account");
    }

    toast.success("Account deleted!");
    router.push("/bets/settings/accounts");
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {/* Account Type */}
      <div className="space-y-2">
        <Label htmlFor="kind">Account Type</Label>
        <Select
          onValueChange={(value: "bookmaker" | "exchange") =>
            updateField("kind", value)
          }
          value={formData.kind}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bookmaker">
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Bookmaker
              </span>
            </SelectItem>
            <SelectItem value="exchange">
              <span className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Exchange
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Account Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Account Name</Label>
        <Input
          className={errors.name ? "border-destructive" : ""}
          id="name"
          onChange={(e) => updateField("name", e.target.value)}
          placeholder={
            formData.kind === "bookmaker"
              ? "e.g., bet365, Unibet, William Hill"
              : "e.g., Betfair Exchange, Smarkets"
          }
          value={formData.name}
        />
        {errors.name && (
          <p className="text-destructive text-xs">{errors.name}</p>
        )}
      </div>

      {/* Currency */}
      <div className="space-y-2">
        <Label htmlFor="currency">Default Currency</Label>
        <Select
          onValueChange={(value) => updateField("currency", value)}
          value={formData.currency}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((cur) => (
              <SelectItem key={cur} value={cur}>
                {cur}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Commission (Exchange only) */}
      {formData.kind === "exchange" && (
        <div className="space-y-2">
          <Label htmlFor="commission">Commission Rate (%)</Label>
          <Input
            className={errors.commission ? "border-destructive" : ""}
            id="commission"
            max="100"
            min="0"
            onChange={(e) => updateField("commission", e.target.value)}
            placeholder="e.g., 2 (for 2%)"
            step="0.1"
            type="number"
            value={formData.commission}
          />
          {errors.commission && (
            <p className="text-destructive text-xs">{errors.commission}</p>
          )}
          <p className="text-muted-foreground text-xs">
            The commission rate charged by the exchange on winning bets
          </p>
        </div>
      )}

      {/* Status */}
      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select
          onValueChange={(value: "active" | "archived") =>
            updateField("status", value)
          }
          value={formData.status}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Archived accounts won't appear in bet entry dropdowns
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4">
        <Button
          className="flex-1"
          disabled={isSubmitting}
          onClick={() => router.push("/bets/settings/accounts")}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={isSubmitting || !hasChanges}
          type="submit"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>

      {/* Delete section - separated from main actions */}
      <div className="mt-6 border-t pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-destructive text-sm">Danger Zone</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Delete this account permanently. This cannot be undone.
            </p>
          </div>
          <DeleteConfirmDialog
            description="This action cannot be undone. The account will be permanently deleted. Note: You cannot delete accounts that have linked bets, transactions, or free bets. Archive instead."
            destructiveLabel="Delete Account"
            disabled={isSubmitting}
            onConfirm={handleDelete}
            title="Delete account?"
          />
        </div>
      </div>
    </form>
  );
}
