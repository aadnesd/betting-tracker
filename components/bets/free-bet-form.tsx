"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";

interface Account {
  id: string;
  name: string;
  currency: string | null;
}

interface FreeBetFormProps {
  accounts: Account[];
  initialData?: {
    id?: string;
    accountId: string;
    name: string;
    value: string;
    currency: string;
    minOdds: string;
    expiresAt: string;
    notes: string;
    status?: "active" | "used" | "expired";
  };
  mode: "create" | "edit";
}

interface FormData {
  accountId: string;
  name: string;
  value: string;
  currency: string;
  minOdds: string;
  expiresAt: string;
  notes: string;
}

const CURRENCIES = ["NOK", "EUR", "GBP", "USD", "SEK", "DKK"] as const;

export function FreeBetForm({ accounts, initialData, mode }: FreeBetFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    accountId: initialData?.accountId ?? "",
    name: initialData?.name ?? "",
    value: initialData?.value ?? "",
    currency: initialData?.currency ?? "NOK",
    minOdds: initialData?.minOdds ?? "",
    expiresAt: initialData?.expiresAt ?? "",
    notes: initialData?.notes ?? "",
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

  const handleAccountChange = (accountId: string) => {
    updateField("accountId", accountId);
    // Update currency to match account's default currency
    const account = accounts.find((a) => a.id === accountId);
    if (account?.currency) {
      updateField("currency", account.currency);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.accountId) {
      newErrors.accountId = "Please select an account";
    }

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    const value = Number.parseFloat(formData.value);
    if (!formData.value || Number.isNaN(value)) {
      newErrors.value = "Value is required";
    } else if (value <= 0) {
      newErrors.value = "Value must be positive";
    }

    if (!formData.currency) {
      newErrors.currency = "Currency is required";
    }

    if (formData.minOdds) {
      const odds = Number.parseFloat(formData.minOdds);
      if (Number.isNaN(odds) || odds < 1) {
        newErrors.minOdds = "Min odds must be at least 1.0";
      }
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
      const payload = {
        accountId: formData.accountId,
        name: formData.name.trim(),
        value: Number.parseFloat(formData.value),
        currency: formData.currency,
        minOdds: formData.minOdds
          ? Number.parseFloat(formData.minOdds)
          : null,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
        notes: formData.notes.trim() || null,
      };

      const url =
        mode === "create"
          ? "/api/bets/free-bets"
          : `/api/bets/free-bets/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${mode} free bet`);
      }

      toast.success(
        mode === "create" ? "Free bet added!" : "Free bet updated!"
      );

      router.push("/bets/settings/promos");
      router.refresh();
    } catch (error) {
      console.error(`${mode} free bet error:`, error);
      toast.error(
        error instanceof Error ? error.message : `Failed to ${mode} free bet`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const bookmakers = accounts.filter((a) => a.currency); // Only show accounts with currency set

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Account Selection */}
      <div className="space-y-2">
        <Label htmlFor="accountId">Bookmaker Account</Label>
        <Select value={formData.accountId} onValueChange={handleAccountChange}>
          <SelectTrigger
            className={errors.accountId ? "border-destructive" : ""}
          >
            <SelectValue placeholder="Select a bookmaker..." />
          </SelectTrigger>
          <SelectContent>
            {bookmakers.length === 0 ? (
              <div className="p-2 text-center text-sm text-muted-foreground">
                No bookmaker accounts found.{" "}
                <a href="/bets/settings/accounts/new" className="text-primary underline">
                  Add one first
                </a>
              </div>
            ) : (
              bookmakers.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {errors.accountId && (
          <p className="text-xs text-destructive">{errors.accountId}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Which bookmaker gave you this free bet?
        </p>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Free Bet Name</Label>
        <Input
          id="name"
          type="text"
          placeholder="e.g., Welcome Offer, Acca Boost, Weekend Free Bet"
          value={formData.name}
          onChange={(e) => updateField("name", e.target.value)}
          className={errors.name ? "border-destructive" : ""}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name}</p>
        )}
      </div>

      {/* Value and Currency */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="value">Value</Label>
          <Input
            id="value"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={formData.value}
            onChange={(e) => updateField("value", e.target.value)}
            className={errors.value ? "border-destructive" : ""}
          />
          {errors.value && (
            <p className="text-xs text-destructive">{errors.value}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Select
            value={formData.currency}
            onValueChange={(value) => updateField("currency", value)}
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
          {errors.currency && (
            <p className="text-xs text-destructive">{errors.currency}</p>
          )}
        </div>
      </div>

      {/* Min Odds */}
      <div className="space-y-2">
        <Label htmlFor="minOdds">Minimum Odds (optional)</Label>
        <Input
          id="minOdds"
          type="number"
          step="0.01"
          min="1.00"
          placeholder="e.g., 2.00"
          value={formData.minOdds}
          onChange={(e) => updateField("minOdds", e.target.value)}
          className={errors.minOdds ? "border-destructive" : ""}
        />
        {errors.minOdds && (
          <p className="text-xs text-destructive">{errors.minOdds}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Some free bets require minimum odds to qualify
        </p>
      </div>

      {/* Expiry Date */}
      <div className="space-y-2">
        <Label htmlFor="expiresAt">Expiry Date (optional)</Label>
        <Input
          id="expiresAt"
          type="date"
          value={formData.expiresAt}
          onChange={(e) => updateField("expiresAt", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          When does this free bet expire? Leave blank if no expiry.
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          placeholder="e.g., Terms & conditions, wagering requirements, etc."
          value={formData.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.push("/bets/settings/promos")}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : mode === "create" ? (
            "Add Free Bet"
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </form>
  );
}
