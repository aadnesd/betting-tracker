"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface AccountOption {
  id: string;
  name: string;
  currency: string | null;
  kind: "bookmaker" | "exchange";
}

interface DepositTransaction {
  id: string;
  amount: string;
  currency: string;
  occurredAt: Date;
  notes: string | null;
}

interface DepositBonusFormProps {
  accounts: AccountOption[];
  mode?: "create" | "edit";
  initialData?: {
    id: string;
    accountId: string;
    name: string;
    depositAmount: string;
    bonusAmount: string;
    currency: string;
    wageringMultiplier: string;
    wageringBase: "deposit" | "bonus" | "deposit_plus_bonus";
    minOdds: string;
    maxBetPercent: string | null;
    expiresAt: Date | null;
    linkedTransactionId: string | null;
    notes: string | null;
  };
}

export function DepositBonusForm({
  accounts,
  mode = "create",
  initialData,
}: DepositBonusFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentDeposits, setRecentDeposits] = useState<DepositTransaction[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);

  // Form state
  const [accountId, setAccountId] = useState(initialData?.accountId || "");
  const [name, setName] = useState(initialData?.name || "");
  const [depositAmount, setDepositAmount] = useState(
    initialData?.depositAmount || ""
  );
  const [bonusAmount, setBonusAmount] = useState(initialData?.bonusAmount || "");
  const [currency, setCurrency] = useState(initialData?.currency || "NOK");
  const [wageringMultiplier, setWageringMultiplier] = useState(
    initialData?.wageringMultiplier || "6"
  );
  const [wageringBase, setWageringBase] = useState<
    "deposit" | "bonus" | "deposit_plus_bonus"
  >(initialData?.wageringBase || "deposit");
  const [minOdds, setMinOdds] = useState(initialData?.minOdds || "1.80");
  const [maxBetPercent, setMaxBetPercent] = useState(
    initialData?.maxBetPercent || ""
  );
  const [expiresAt, setExpiresAt] = useState(
    initialData?.expiresAt
      ? new Date(initialData.expiresAt).toISOString().split("T")[0]
      : ""
  );
  const [linkedTransactionId, setLinkedTransactionId] = useState(
    initialData?.linkedTransactionId || ""
  );
  const [notes, setNotes] = useState(initialData?.notes || "");

  // Filter to only bookmaker accounts
  const bookmakerAccounts = accounts.filter((a) => a.kind === "bookmaker");

  // Calculate wagering requirement
  const calculateWageringRequirement = () => {
    const deposit = Number.parseFloat(depositAmount) || 0;
    const bonus = Number.parseFloat(bonusAmount) || 0;
    const multiplier = Number.parseFloat(wageringMultiplier) || 0;

    let base = 0;
    switch (wageringBase) {
      case "deposit":
        base = deposit;
        break;
      case "bonus":
        base = bonus;
        break;
      case "deposit_plus_bonus":
        base = deposit + bonus;
        break;
    }

    return base * multiplier;
  };

  const wageringRequirement = calculateWageringRequirement();

  // Fetch recent deposits when account changes
  useEffect(() => {
    if (!accountId) {
      setRecentDeposits([]);
      return;
    }

    setLoadingDeposits(true);
    fetch(`/api/bets/deposit-bonuses/recent-deposits/${accountId}`)
      .then((res) => res.json())
      .then((data) => {
        setRecentDeposits(data);
        setLoadingDeposits(false);
      })
      .catch(() => {
        setRecentDeposits([]);
        setLoadingDeposits(false);
      });
  }, [accountId]);

  // Update currency when account changes
  useEffect(() => {
    const selectedAccount = bookmakerAccounts.find((a) => a.id === accountId);
    if (selectedAccount?.currency) {
      setCurrency(selectedAccount.currency);
    }
  }, [accountId, bookmakerAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        accountId,
        name,
        depositAmount: Number.parseFloat(depositAmount),
        bonusAmount: Number.parseFloat(bonusAmount),
        currency,
        wageringMultiplier: Number.parseFloat(wageringMultiplier),
        wageringBase,
        minOdds: Number.parseFloat(minOdds),
        maxBetPercent: maxBetPercent
          ? Number.parseFloat(maxBetPercent)
          : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        linkedTransactionId: linkedTransactionId && linkedTransactionId !== "none" ? linkedTransactionId : null,
        notes: notes || null,
      };

      const url =
        mode === "edit"
          ? `/api/bets/deposit-bonuses/${initialData?.id}`
          : "/api/bets/deposit-bonuses";

      const method = mode === "edit" ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save deposit bonus");
      }

      toast.success(
        mode === "edit"
          ? "Deposit bonus updated"
          : "Deposit bonus created"
      );
      router.push("/bets/settings/promos");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save deposit bonus"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Account Selection */}
      <div className="space-y-2">
        <Label htmlFor="account">Bookmaker Account *</Label>
        <Select
          value={accountId}
          onValueChange={setAccountId}
          disabled={mode === "edit"}
        >
          <SelectTrigger id="account">
            <SelectValue placeholder="Select bookmaker" />
          </SelectTrigger>
          <SelectContent>
            {bookmakerAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
                {account.currency && ` (${account.currency})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bonus Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Bonus Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Welcome Bonus 100%"
          required
        />
      </div>

      {/* Deposit and Bonus Amounts */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="depositAmount">Deposit Amount *</Label>
          <Input
            id="depositAmount"
            type="number"
            step="0.01"
            min="0"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="1000"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bonusAmount">Bonus Amount *</Label>
          <Input
            id="bonusAmount"
            type="number"
            step="0.01"
            min="0"
            value={bonusAmount}
            onChange={(e) => setBonusAmount(e.target.value)}
            placeholder="1000"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOK">NOK</SelectItem>
              <SelectItem value="SEK">SEK</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="GBP">GBP</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="DKK">DKK</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Wagering Requirements */}
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="font-medium">Wagering Requirements</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wageringMultiplier">Wagering Multiplier *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="wageringMultiplier"
                type="number"
                step="0.1"
                min="1"
                value={wageringMultiplier}
                onChange={(e) => setWageringMultiplier(e.target.value)}
                placeholder="6"
                required
                className="w-24"
              />
              <span className="text-muted-foreground">× turnover</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minOdds">Minimum Odds *</Label>
            <Input
              id="minOdds"
              type="number"
              step="0.01"
              min="1.01"
              value={minOdds}
              onChange={(e) => setMinOdds(e.target.value)}
              placeholder="1.80"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Wagering Base *</Label>
          <RadioGroup
            value={wageringBase}
            onValueChange={(v) =>
              setWageringBase(v as "deposit" | "bonus" | "deposit_plus_bonus")
            }
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="deposit" id="base-deposit" />
              <Label htmlFor="base-deposit" className="font-normal">
                Deposit only
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="bonus" id="base-bonus" />
              <Label htmlFor="base-bonus" className="font-normal">
                Bonus only
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="deposit_plus_bonus" id="base-both" />
              <Label htmlFor="base-both" className="font-normal">
                Deposit + Bonus
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Calculated Requirement */}
        <div className="rounded-md bg-muted p-3">
          <p className="text-sm text-muted-foreground">
            Total wagering requirement:
          </p>
          <p className="text-lg font-semibold">
            {currency} {wageringRequirement.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Optional Fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="maxBetPercent">Max Bet % (optional)</Label>
          <Input
            id="maxBetPercent"
            type="number"
            step="1"
            min="1"
            max="100"
            value={maxBetPercent}
            onChange={(e) => setMaxBetPercent(e.target.value)}
            placeholder="e.g., 25"
          />
          <p className="text-xs text-muted-foreground">
            Max bet as % of bonus (e.g., 25% = max {currency}{" "}
            {((Number.parseFloat(bonusAmount) || 0) * 0.25).toFixed(0)})
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expiresAt">Expires At (optional)</Label>
          <Input
            id="expiresAt"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
      </div>

      {/* Link to Deposit Transaction */}
      {accountId && mode === "create" && (
        <div className="space-y-2">
          <Label htmlFor="linkedTransaction">
            Link to Deposit (optional)
          </Label>
          <Select
            value={linkedTransactionId}
            onValueChange={setLinkedTransactionId}
          >
            <SelectTrigger id="linkedTransaction">
              <SelectValue
                placeholder={
                  loadingDeposits ? "Loading..." : "Select a deposit transaction"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {recentDeposits.map((tx) => (
                <SelectItem key={tx.id} value={tx.id}>
                  {tx.currency} {Number.parseFloat(tx.amount).toFixed(2)} -{" "}
                  {new Date(tx.occurredAt).toLocaleDateString()}
                  {tx.notes && ` - ${tx.notes}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Link this bonus to the deposit that triggered it
          </p>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional terms or conditions..."
          rows={3}
        />
      </div>

      {/* Submit Button */}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "edit" ? "Update Bonus" : "Create Deposit Bonus"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/bets/settings/promos")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
