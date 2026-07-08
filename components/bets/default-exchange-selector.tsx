"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ExchangeOption = {
  id: string;
  name: string;
  currency: string | null;
};

type DefaultExchangeSelectorProps = {
  exchanges: ExchangeOption[];
  selectedExchangeId: string | null;
};

const NONE_VALUE = "__none__";

export function DefaultExchangeSelector({
  exchanges,
  selectedExchangeId,
}: DefaultExchangeSelectorProps) {
  const router = useRouter();
  const [value, setValue] = useState(selectedExchangeId ?? NONE_VALUE);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValue(selectedExchangeId ?? NONE_VALUE);
  }, [selectedExchangeId]);

  const handleChange = async (nextValue: string) => {
    const previousValue = value;
    const accountId = nextValue === NONE_VALUE ? null : nextValue;

    setValue(nextValue);
    setIsSaving(true);

    try {
      const response = await fetch(
        "/api/bets/settings/accounts/default-exchange",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update default exchange");
      }

      toast.success(
        accountId ? "Default exchange updated" : "Default exchange cleared"
      );
      router.refresh();
    } catch (error) {
      setValue(previousValue);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update default exchange"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="default-exchange">Default exchange for Quick Add</Label>
        {isSaving && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <Select
        disabled={isSaving || exchanges.length === 0}
        onValueChange={handleChange}
        value={value}
      >
        <SelectTrigger id="default-exchange">
          <SelectValue placeholder="Choose an exchange" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>No default</SelectItem>
          {exchanges.map((exchange) => (
            <SelectItem key={exchange.id} value={exchange.id}>
              {exchange.name}
              {exchange.currency ? ` (${exchange.currency})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-xs">
        Quick Add will preselect this exchange for new lay bets.
      </p>
    </div>
  );
}
