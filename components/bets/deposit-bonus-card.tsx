"use client";

import { AlertTriangle, Clock, ExternalLink, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface DepositBonusCardProps {
  bonus: {
    id: string;
    name: string;
    accountName: string | null;
    depositAmount: string;
    bonusAmount: string;
    currency: string;
    wageringRequirement: string;
    wageringProgress: string;
    minOdds: string;
    status: "active" | "cleared" | "forfeited" | "expired";
    expiresAt: Date | null;
    clearedAt: Date | null;
    createdAt: Date;
  };
}

export function DepositBonusCard({ bonus }: DepositBonusCardProps) {
  const wageringRequirement = Number.parseFloat(bonus.wageringRequirement);
  const wageringProgress = Number.parseFloat(bonus.wageringProgress);
  const progressPercent =
    wageringRequirement > 0
      ? Math.min((wageringProgress / wageringRequirement) * 100, 100)
      : 0;
  const remaining = Math.max(0, wageringRequirement - wageringProgress);

  const isExpiringSoon =
    bonus.expiresAt &&
    bonus.status === "active" &&
    new Date(bonus.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  const getStatusBadge = () => {
    switch (bonus.status) {
      case "active":
        return <Badge variant="default">Active</Badge>;
      case "cleared":
        return (
          <Badge className="border-green-500 text-green-600" variant="outline">
            Cleared
          </Badge>
        );
      case "forfeited":
        return <Badge variant="secondary">Forfeited</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
    }
  };

  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate font-medium text-base">
              <Link
                className="hover:underline"
                href={`/bets/settings/promos/deposit-bonus/${bonus.id}`}
              >
                {bonus.name}
              </Link>
            </CardTitle>
            <p className="truncate text-muted-foreground text-sm">
              {bonus.accountName || "Unknown Account"}
            </p>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Amounts */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Deposit:</span>{" "}
            <span className="font-medium">
              {bonus.currency}{" "}
              {Number.parseFloat(bonus.depositAmount).toFixed(0)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Bonus:</span>{" "}
            <span className="font-medium text-green-600">
              {bonus.currency} {Number.parseFloat(bonus.bonusAmount).toFixed(0)}
            </span>
          </div>
        </div>

        {/* Wagering Progress */}
        {bonus.status === "active" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                Wagering Progress
              </span>
              <span className="font-medium">{progressPercent.toFixed(0)}%</span>
            </div>
            <Progress className="h-2" value={progressPercent} />
            <p className="text-muted-foreground text-xs">
              {bonus.currency} {wageringProgress.toFixed(0)} /{" "}
              {wageringRequirement.toFixed(0)}
              {remaining > 0 && (
                <span className="ml-1">
                  ({bonus.currency} {remaining.toFixed(0)} remaining)
                </span>
              )}
            </p>
          </div>
        )}

        {/* Cleared info */}
        {bonus.status === "cleared" && bonus.clearedAt && (
          <p className="text-green-600 text-xs">
            Cleared on {new Date(bonus.clearedAt).toLocaleDateString()}
          </p>
        )}

        {/* Min Odds */}
        <p className="text-muted-foreground text-xs">
          Min odds: {Number.parseFloat(bonus.minOdds).toFixed(2)}
        </p>

        {/* Expiry Warning */}
        {isExpiringSoon && (
          <div className="flex items-center gap-1 text-amber-600 text-xs">
            <AlertTriangle className="h-3 w-3" />
            Expires {new Date(bonus.expiresAt!).toLocaleDateString()}
          </div>
        )}

        {/* View Details Link */}
        <Button asChild className="w-full" size="sm" variant="ghost">
          <Link href={`/bets/settings/promos/deposit-bonus/${bonus.id}`}>
            View Details
            <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
