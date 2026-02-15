"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  const [recentDeposits, setRecentDeposits] = useState<DepositTransaction[]>(
    []
  );
  const [loadingDeposits, setLoadingDeposits] = useState(false);

  // Form state
  const [accountId, setAccountId] = useState(initialData?.accountId || "");
  const [name, setName] = useState(initialData?.name || "");
  const [depositAmount, setDepositAmount] = useState(
    initialData?.depositAmount || ""
  );
  const [bonusAmount, setBonusAmount] = useState(
    initialData?.bonusAmount || ""
  );
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
        maxBetPercent: maxBetPercent ? Number.parseFloat(maxBetPercent) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        linkedTransactionId:
          linkedTransactionId && linkedTransactionId !== "none"
            ? linkedTransactionId
            : null,
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
        mode === "edit" ? "Deposit bonus updated" : "Deposit bonus created"
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
    <form className="space-y-6" onSubmit={handleSubmit}>
      {/* Account Selection */}
      <div className="space-y-2">
        <Label htmlFor="account">Bookmaker Account *</Label>
        <Select
          disabled={mode === "edit"}
          onValueChange={setAccountId}
          value={accountId}
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
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Welcome Bonus 100%"
          required
          value={name}
        />
      </div>

      {/* Deposit and Bonus Amounts */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="depositAmount">Deposit Amount *</Label>
          <Input
            id="depositAmount"
            min="0"
            onChange={(e) => setDepositAmount(e.target.value)}
            placeholder="1000"
            required
            step="0.01"
            type="number"
            value={depositAmount}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bonusAmount">Bonus Amount *</Label>
          <Input
            id="bonusAmount"
            min="0"
            onChange={(e) => setBonusAmount(e.target.value)}
            placeholder="1000"
            required
            step="0.01"
            type="number"
            value={bonusAmount}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Select onValueChange={setCurrency} value={currency}>
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
                className="w-24"
                id="wageringMultiplier"
                min="1"
                onChange={(e) => setWageringMultiplier(e.target.value)}
                placeholder="6"
                required
                step="0.1"
                type="number"
                value={wageringMultiplier}
              />
              <span className="text-muted-foreground">× turnover</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minOdds">Minimum Odds *</Label>
            <Input
              id="minOdds"
              min="1.01"
              onChange={(e) => setMinOdds(e.target.value)}
              placeholder="1.80"
              required
              step="0.01"
              type="number"
              value={minOdds}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Wagering Base *</Label>
          <RadioGroup
            className="flex flex-wrap gap-4"
            onValueChange={(v) =>
              setWageringBase(v as "deposit" | "bonus" | "deposit_plus_bonus")
            }
            value={wageringBase}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem id="base-deposit" value="deposit" />
              <Label className="font-normal" htmlFor="base-deposit">
                Deposit only
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem id="base-bonus" value="bonus" />
              <Label className="font-normal" htmlFor="base-bonus">
                Bonus only
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem id="base-both" value="deposit_plus_bonus" />
              <Label className="font-normal" htmlFor="base-both">
                Deposit + Bonus
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Calculated Requirement */}
        <div className="rounded-md bg-muted p-3">
          <p className="text-muted-foreground text-sm">
            Total wagering requirement:
          </p>
          <p className="font-semibold text-lg">
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
            max="100"
            min="1"
            onChange={(e) => setMaxBetPercent(e.target.value)}
            placeholder="e.g., 25"
            step="1"
            type="number"
            value={maxBetPercent}
          />
          <p className="text-muted-foreground text-xs">
            Max bet as % of bonus (e.g., 25% = max {currency}{" "}
            {((Number.parseFloat(bonusAmount) || 0) * 0.25).toFixed(0)})
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expiresAt">Expires At (optional)</Label>
          <Input
            id="expiresAt"
            onChange={(e) => setExpiresAt(e.target.value)}
            type="date"
            value={expiresAt}
          />
        </div>
      </div>

      {/* Link to Deposit Transaction */}
      {accountId && mode === "create" && (
        <div className="space-y-2">
          <Label htmlFor="linkedTransaction">Link to Deposit (optional)</Label>
          <Select
            onValueChange={setLinkedTransactionId}
            value={linkedTransactionId}
          >
            <SelectTrigger id="linkedTransaction">
              <SelectValue
                placeholder={
                  loadingDeposits
                    ? "Loading..."
                    : "Select a deposit transaction"
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
          <p className="text-muted-foreground text-xs">
            Link this bonus to the deposit that triggered it
          </p>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional terms or conditions..."
          rows={3}
          value={notes}
        />
      </div>

      {/* Submit Button */}
      <div className="flex gap-3">
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "edit" ? "Update Bonus" : "Create Deposit Bonus"}
        </Button>
        <Button
          onClick={() => router.push("/bets/settings/promos")}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
