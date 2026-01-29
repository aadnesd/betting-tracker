"use client";

import { ChevronDown, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
    status?: "active" | "used" | "expired" | "locked";
    unlockType?: "stake" | "bets" | null;
    unlockTarget?: string;
    unlockMinOdds?: string;
    stakeReturned?: boolean;
    winWageringMultiplier?: string | null;
    winWageringMinOdds?: string | null;
    winWageringExpiresInDays?: number | null;
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
  hasUnlockRequirements: boolean;
  unlockType: "stake" | "bets";
  unlockTarget: string;
  unlockMinOdds: string;
  stakeReturned: boolean;
  hasWinWageringRequirements: boolean;
  winWageringMultiplier: string;
  winWageringMinOdds: string;
  winWageringExpiresInDays: string;
}

const CURRENCIES = ["NOK", "EUR", "GBP", "USD", "SEK", "DKK"] as const;

export function FreeBetForm({ accounts, initialData, mode }: FreeBetFormProps) {
  const router = useRouter();
  const hasExistingUnlock = initialData?.unlockType != null;
  const hasExistingWinWagering = initialData?.winWageringMultiplier != null;
  const [formData, setFormData] = useState<FormData>({
    accountId: initialData?.accountId ?? "",
    name: initialData?.name ?? "",
    value: initialData?.value ?? "",
    currency: initialData?.currency ?? "NOK",
    minOdds: initialData?.minOdds ?? "",
    expiresAt: initialData?.expiresAt ?? "",
    notes: initialData?.notes ?? "",
    hasUnlockRequirements: hasExistingUnlock,
    unlockType: initialData?.unlockType ?? "stake",
    unlockTarget: initialData?.unlockTarget ?? "",
    unlockMinOdds: initialData?.unlockMinOdds ?? "",
    stakeReturned: initialData?.stakeReturned ?? false,
    hasWinWageringRequirements: hasExistingWinWagering,
    winWageringMultiplier: initialData?.winWageringMultiplier ?? "",
    winWageringMinOdds: initialData?.winWageringMinOdds ?? "",
    winWageringExpiresInDays: initialData?.winWageringExpiresInDays?.toString() ?? "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnlockSection, setShowUnlockSection] = useState(hasExistingUnlock);
  const [showWinWageringSection, setShowWinWageringSection] = useState(
    hasExistingWinWagering
  );
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

    // Validate unlock requirements if enabled
    if (formData.hasUnlockRequirements) {
      const target = Number.parseFloat(formData.unlockTarget);
      if (!formData.unlockTarget || Number.isNaN(target)) {
        newErrors.unlockTarget = "Unlock target is required";
      } else if (target <= 0) {
        newErrors.unlockTarget = "Target must be positive";
      }

      if (formData.unlockMinOdds) {
        const unlockOdds = Number.parseFloat(formData.unlockMinOdds);
        if (Number.isNaN(unlockOdds) || unlockOdds < 1) {
          newErrors.unlockMinOdds = "Min odds must be at least 1.0";
        }
      }
    }

    if (formData.hasWinWageringRequirements) {
      const multiplier = Number.parseFloat(formData.winWageringMultiplier);
      if (!formData.winWageringMultiplier || Number.isNaN(multiplier)) {
        newErrors.winWageringMultiplier = "Wagering multiplier is required";
      } else if (multiplier <= 0) {
        newErrors.winWageringMultiplier = "Multiplier must be positive";
      }

      if (formData.winWageringMinOdds) {
        const winMinOdds = Number.parseFloat(formData.winWageringMinOdds);
        if (Number.isNaN(winMinOdds) || winMinOdds < 1) {
          newErrors.winWageringMinOdds = "Min odds must be at least 1.0";
        }
      }

      if (formData.winWageringExpiresInDays) {
        const days = Number.parseInt(formData.winWageringExpiresInDays, 10);
        if (Number.isNaN(days) || days < 1) {
          newErrors.winWageringExpiresInDays = "Days must be at least 1";
        }
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
        minOdds: formData.minOdds ? Number.parseFloat(formData.minOdds) : null,
        expiresAt: formData.expiresAt
          ? new Date(formData.expiresAt).toISOString()
          : null,
        notes: formData.notes.trim() || null,
        stakeReturned: formData.stakeReturned,
        ...(formData.hasWinWageringRequirements
          ? {
              winWageringMultiplier: Number.parseFloat(
                formData.winWageringMultiplier
              ),
              winWageringMinOdds: formData.winWageringMinOdds
                ? Number.parseFloat(formData.winWageringMinOdds)
                : null,
              winWageringExpiresInDays: formData.winWageringExpiresInDays
                ? Number.parseInt(formData.winWageringExpiresInDays, 10)
                : null,
            }
          : {
              winWageringMultiplier: null,
              winWageringMinOdds: null,
              winWageringExpiresInDays: null,
            }),
        // Unlock requirements (only if enabled)
        ...(formData.hasUnlockRequirements && {
          unlockType: formData.unlockType,
          unlockTarget: Number.parseFloat(formData.unlockTarget),
          unlockMinOdds: formData.unlockMinOdds
            ? Number.parseFloat(formData.unlockMinOdds)
            : null,
        }),
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

  const handleDelete = async () => {
    if (!initialData?.id) return;

    const response = await fetch(`/api/bets/free-bets/${initialData.id}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to delete free bet");
    }

    toast.success("Free bet deleted!");
    router.push("/bets/settings/promos");
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
                <a
                  href="/bets/settings/accounts/new"
                  className="text-primary underline"
                >
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
          step="any"
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

      {/* Stake returned */}
      <div className="space-y-2">
        <Label htmlFor="stakeReturned">Stake Return</Label>
        <Select
          value={formData.stakeReturned ? "returned" : "not_returned"}
          onValueChange={(value) =>
            updateField("stakeReturned", value === "returned")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not_returned">Stake not returned</SelectItem>
            <SelectItem value="returned">Stake returned</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Choose whether the free bet stake is returned on a win.
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

      {/* Unlock Requirements (Collapsible) */}
      {mode === "create" && (
        <Collapsible
          open={showUnlockSection}
          onOpenChange={setShowUnlockSection}
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="flex w-full items-center justify-between p-0 hover:bg-transparent"
            >
              <span className="font-medium text-sm">
                Unlock Requirements (optional)
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showUnlockSection ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4 rounded-lg border bg-muted/30 p-4">
            <p className="text-muted-foreground text-sm">
              If this free bet requires placing qualifying bets first (e.g.,
              "Bet £50 to unlock £10 free bet"), enter the requirements below to
              track your progress.
            </p>

            {/* Enable unlock tracking */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hasUnlockRequirements"
                checked={formData.hasUnlockRequirements}
                onChange={(e) =>
                  updateField("hasUnlockRequirements", e.target.checked)
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="hasUnlockRequirements" className="text-sm">
                This promo has unlock requirements
              </Label>
            </div>

            {formData.hasUnlockRequirements && (
              <>
                {/* Unlock Type */}
                <div className="space-y-2">
                  <Label htmlFor="unlockType">Unlock Type</Label>
                  <Select
                    value={formData.unlockType}
                    onValueChange={(value: "stake" | "bets") =>
                      updateField("unlockType", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stake">
                        Total Stake (e.g., bet £50 total)
                      </SelectItem>
                      <SelectItem value="bets">
                        Number of Bets (e.g., place 3 bets)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Unlock Target */}
                <div className="space-y-2">
                  <Label htmlFor="unlockTarget">
                    {formData.unlockType === "stake"
                      ? "Required Stake Amount"
                      : "Required Number of Bets"}
                  </Label>
                  <Input
                    id="unlockTarget"
                    type="number"
                    step={formData.unlockType === "stake" ? "0.01" : "1"}
                    min={formData.unlockType === "stake" ? "0.01" : "1"}
                    placeholder={
                      formData.unlockType === "stake" ? "50.00" : "3"
                    }
                    value={formData.unlockTarget}
                    onChange={(e) =>
                      updateField("unlockTarget", e.target.value)
                    }
                    className={errors.unlockTarget ? "border-destructive" : ""}
                  />
                  {errors.unlockTarget && (
                    <p className="text-xs text-destructive">
                      {errors.unlockTarget}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {formData.unlockType === "stake"
                      ? "Total stake required to unlock this free bet"
                      : "Number of qualifying bets required to unlock"}
                  </p>
                </div>

                {/* Unlock Min Odds */}
                <div className="space-y-2">
                  <Label htmlFor="unlockMinOdds">
                    Minimum Odds for Qualifying Bets (optional)
                  </Label>
                  <Input
                    id="unlockMinOdds"
                    type="number"
                    step="any"
                    min="1.00"
                    placeholder="e.g., 1.50"
                    value={formData.unlockMinOdds}
                    onChange={(e) =>
                      updateField("unlockMinOdds", e.target.value)
                    }
                    className={errors.unlockMinOdds ? "border-destructive" : ""}
                  />
                  {errors.unlockMinOdds && (
                    <p className="text-xs text-destructive">
                      {errors.unlockMinOdds}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    Minimum odds required for bets to count as qualifying
                  </p>
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Wagering requirements for winnings */}
      <Collapsible
        open={showWinWageringSection}
        onOpenChange={setShowWinWageringSection}
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex w-full items-center justify-between p-0 hover:bg-transparent"
          >
            <span className="font-medium text-sm">
              Winnings Wagering Requirements (optional)
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showWinWageringSection ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4 rounded-lg border bg-muted/30 p-4">
          <p className="text-muted-foreground text-sm">
            If the free bet wins and the bookmaker requires wagering on the
            winnings, enter the multiplier below to track progress after the
            win.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hasWinWageringRequirements"
              checked={formData.hasWinWageringRequirements}
              onChange={(e) =>
                updateField("hasWinWageringRequirements", e.target.checked)
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="hasWinWageringRequirements" className="text-sm">
              Winnings have wagering requirements
            </Label>
          </div>

          {formData.hasWinWageringRequirements && (
            <>
              <div className="space-y-2">
                <Label htmlFor="winWageringMultiplier">
                  Wagering Multiplier
                </Label>
                <Input
                  id="winWageringMultiplier"
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="e.g., 3"
                  value={formData.winWageringMultiplier}
                  onChange={(e) =>
                    updateField("winWageringMultiplier", e.target.value)
                  }
                  className={
                    errors.winWageringMultiplier ? "border-destructive" : ""
                  }
                />
                {errors.winWageringMultiplier && (
                  <p className="text-xs text-destructive">
                    {errors.winWageringMultiplier}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  The winnings will require this multiple in wagering to clear.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="winWageringMinOdds">
                  Minimum Odds for Wagering (optional)
                </Label>
                <Input
                  id="winWageringMinOdds"
                  type="number"
                  step="any"
                  min="1.00"
                  placeholder="e.g., 1.50"
                  value={formData.winWageringMinOdds}
                  onChange={(e) =>
                    updateField("winWageringMinOdds", e.target.value)
                  }
                  className={
                    errors.winWageringMinOdds ? "border-destructive" : ""
                  }
                />
                {errors.winWageringMinOdds && (
                  <p className="text-xs text-destructive">
                    {errors.winWageringMinOdds}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Minimum odds required for bets to count toward wagering the
                  winnings.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="winWageringExpiresInDays">
                  Days to Complete Wagering (optional)
                </Label>
                <Input
                  id="winWageringExpiresInDays"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="e.g., 30"
                  value={formData.winWageringExpiresInDays}
                  onChange={(e) =>
                    updateField("winWageringExpiresInDays", e.target.value)
                  }
                  className={
                    errors.winWageringExpiresInDays ? "border-destructive" : ""
                  }
                />
                {errors.winWageringExpiresInDays && (
                  <p className="text-xs text-destructive">
                    {errors.winWageringExpiresInDays}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  After the free bet wins, how many days do you have to complete
                  the wagering? Leave blank if no time limit.
                </p>
              </div>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Show unlock info in edit mode if applicable */}
      {mode === "edit" && initialData?.unlockType && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <h4 className="mb-2 font-medium text-sm">Unlock Requirements</h4>
          <p className="text-muted-foreground text-sm">
            {initialData.unlockType === "stake"
              ? `Stake ${initialData.unlockTarget} ${formData.currency} to unlock`
              : `Place ${initialData.unlockTarget} qualifying bets to unlock`}
            {initialData.unlockMinOdds &&
              ` (min odds: ${initialData.unlockMinOdds})`}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Note: Unlock requirements cannot be edited after creation. Track
            progress on the promo detail page.
          </p>
        </div>
      )}

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

      {/* Delete section - only for edit mode */}
      {mode === "edit" && initialData?.id && initialData.status !== "used" && (
        <div className="border-t pt-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-destructive">
                Danger Zone
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Delete this free bet permanently. This cannot be undone.
              </p>
            </div>
            <DeleteConfirmDialog
              title="Delete free bet?"
              description={`This will permanently delete the free bet "${initialData.name}" worth ${initialData.currency} ${Number.parseFloat(initialData.value).toFixed(2)}. This action cannot be undone.`}
              onConfirm={handleDelete}
              destructiveLabel="Delete Free Bet"
              disabled={isSubmitting}
            />
          </div>
        </div>
      )}
    </form>
  );
}
