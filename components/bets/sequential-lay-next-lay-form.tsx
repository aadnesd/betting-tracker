"use client";

import { ArrowLeft, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

type AccountOption = {
  id: string;
  name: string;
  currency: string | null;
};

type Props = {
  parentMatchedBetId: string;
  market: string;
  selection: string;
  exchanges: AccountOption[];
  preferredExchangeId: string | null;
  returnTo: string;
};

type FormData = {
  accountId: string;
  odds: string;
  stake: string;
  currency: string;
  placedAt: string;
  notes: string;
};

const CURRENCIES = ["NOK", "EUR", "GBP", "USD", "SEK", "DKK"] as const;

export function SequentialLayNextLayForm({
  parentMatchedBetId,
  market,
  selection,
  exchanges,
  preferredExchangeId,
  returnTo,
}: Props) {
  const router = useRouter();
  const defaultExchange =
    exchanges.find((exchange) => exchange.id === preferredExchangeId) ??
    exchanges[0];

  const [formData, setFormData] = useState<FormData>({
    accountId: defaultExchange?.id ?? "",
    odds: "",
    stake: "",
    currency: defaultExchange?.currency ?? "NOK",
    placedAt: new Date().toISOString().slice(0, 16),
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );

  const selectedExchange = useMemo(
    () => exchanges.find((exchange) => exchange.id === formData.accountId),
    [exchanges, formData.accountId]
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
    const next = exchanges.find((exchange) => exchange.id === accountId);
    setFormData((prev) => ({
      ...prev,
      accountId,
      currency: next?.currency ?? prev.currency,
    }));
  };

  const validate = () => {
    const nextErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.accountId) {
      nextErrors.accountId = "Exchange is required";
    }
    if (!formData.odds || Number.parseFloat(formData.odds) <= 1) {
      nextErrors.odds = "Odds must be greater than 1.0";
    }
    if (!formData.stake || Number.parseFloat(formData.stake) <= 0) {
      nextErrors.stake = "Stake must be greater than 0";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validate()) {
      toast.error("Please fix the errors below");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/bets/sequential-lay/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentMatchedBetId,
          accountId: formData.accountId,
          odds: Number.parseFloat(formData.odds),
          stake: Number.parseFloat(formData.stake),
          currency: formData.currency,
          placedAt: new Date(formData.placedAt).toISOString(),
          notes: formData.notes.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create next lay");
      }

      toast.success(`Sequential lay step ${data.stepNumber} created`);
      router.push(returnTo);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create next lay"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link
          className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
          href={returnTo}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sequential lay timeline
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add next lay step
          </CardTitle>
          <CardDescription>
            Preserve the previous lay and add a new lay step to the sequential
            lay timeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 rounded-md border bg-muted/30 p-4 text-sm">
            <p className="font-medium">{selection}</p>
            <p className="text-muted-foreground">{market}</p>
            {selectedExchange && (
              <p className="mt-2 text-muted-foreground text-xs">
                Default exchange: {selectedExchange.name}
              </p>
            )}
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="accountId">Exchange</Label>
              <Select
                onValueChange={handleAccountChange}
                value={formData.accountId}
              >
                <SelectTrigger
                  className={errors.accountId ? "border-destructive" : ""}
                  id="accountId"
                >
                  <SelectValue placeholder="Select exchange" />
                </SelectTrigger>
                <SelectContent>
                  {exchanges.map((exchange) => (
                    <SelectItem key={exchange.id} value={exchange.id}>
                      {exchange.name}
                      {exchange.currency ? ` (${exchange.currency})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.accountId && (
                <p className="text-destructive text-xs">{errors.accountId}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="odds">Lay odds</Label>
                <Input
                  className={errors.odds ? "border-destructive" : ""}
                  id="odds"
                  min="1.01"
                  onChange={(e) => updateField("odds", e.target.value)}
                  placeholder="e.g. 3.45"
                  step="any"
                  type="number"
                  value={formData.odds}
                />
                {errors.odds && (
                  <p className="text-destructive text-xs">{errors.odds}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="stake">Lay stake</Label>
                <Input
                  className={errors.stake ? "border-destructive" : ""}
                  id="stake"
                  min="0.01"
                  onChange={(e) => updateField("stake", e.target.value)}
                  placeholder="e.g. 125"
                  step="0.01"
                  type="number"
                  value={formData.stake}
                />
                {errors.stake && (
                  <p className="text-destructive text-xs">{errors.stake}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  onValueChange={(value) => updateField("currency", value)}
                  value={formData.currency}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="placedAt">Placed at</Label>
              <Input
                id="placedAt"
                onChange={(e) => updateField("placedAt", e.target.value)}
                type="datetime-local"
                value={formData.placedAt}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Any context about this hedge step..."
                rows={3}
                value={formData.notes}
              />
            </div>

            <div className="flex gap-4 pt-2">
              <Button
                asChild
                className="flex-1"
                type="button"
                variant="outline"
              >
                <Link href={returnTo}>Cancel</Link>
              </Button>
              <Button className="flex-1" disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add next lay"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
