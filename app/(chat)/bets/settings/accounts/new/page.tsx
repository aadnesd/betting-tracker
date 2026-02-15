"use client";

import { ArrowLeft, Building2, CreditCard, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

interface FormData {
  name: string;
  kind: "bookmaker" | "exchange";
  currency: string;
  commission: string;
}

const initialFormData: FormData = {
  name: "",
  kind: "bookmaker",
  currency: "NOK",
  commission: "",
};

const CURRENCIES = ["NOK", "EUR", "GBP", "USD", "SEK", "DKK"] as const;

export default function NewAccountPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>(initialFormData);
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          kind: formData.kind,
          currency: formData.currency || null,
          commission: formData.kind === "exchange" ? commissionDecimal : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      toast.success(
        `${formData.kind === "exchange" ? "Exchange" : "Bookmaker"} account created!`
      );
      router.push("/bets/settings/accounts");
    } catch (error) {
      console.error("Create account error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create account"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-xl px-4 py-8">
      <div className="mb-6">
        <Link
          className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
          href="/bets/settings/accounts"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Accounts
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {formData.kind === "exchange" ? (
              <CreditCard className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
            Add New Account
          </CardTitle>
          <CardDescription>
            Add a bookmaker or exchange account to track your betting activity
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              <p className="text-muted-foreground text-xs">
                {formData.kind === "bookmaker"
                  ? "Bookmakers are where you place back bets with promotional offers"
                  : "Exchanges are where you lay bets to lock in profit"}
              </p>
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
              <p className="text-muted-foreground text-xs">
                The default currency for this account's bets and transactions
              </p>
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
                  <p className="text-destructive text-xs">
                    {errors.commission}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  The commission rate charged by the exchange on winning bets
                </p>
              </div>
            )}

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
              <Button className="flex-1" disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
