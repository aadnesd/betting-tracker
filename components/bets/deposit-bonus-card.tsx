"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Clock, ExternalLink, TrendingUp, AlertTriangle } from "lucide-react";

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
  const progressPercent = wageringRequirement > 0
    ? Math.min((wageringProgress / wageringRequirement) * 100, 100)
    : 0;
  const remaining = Math.max(0, wageringRequirement - wageringProgress);

  const isExpiringSoon = bonus.expiresAt && bonus.status === "active" && 
    new Date(bonus.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  const getStatusBadge = () => {
    switch (bonus.status) {
      case "active":
        return <Badge variant="default">Active</Badge>;
      case "cleared":
        return <Badge variant="outline" className="border-green-500 text-green-600">Cleared</Badge>;
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
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-medium truncate">
              <Link href={`/bets/settings/promos/deposit-bonus/${bonus.id}`} className="hover:underline">
                {bonus.name}
              </Link>
            </CardTitle>
            <p className="text-sm text-muted-foreground truncate">
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
              {bonus.currency} {Number.parseFloat(bonus.depositAmount).toFixed(0)}
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
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Wagering Progress
              </span>
              <span className="font-medium">{progressPercent.toFixed(0)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {bonus.currency} {wageringProgress.toFixed(0)} / {wageringRequirement.toFixed(0)}
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
          <p className="text-xs text-green-600">
            Cleared on {new Date(bonus.clearedAt).toLocaleDateString()}
          </p>
        )}

        {/* Min Odds */}
        <p className="text-xs text-muted-foreground">
          Min odds: {Number.parseFloat(bonus.minOdds).toFixed(2)}
        </p>

        {/* Expiry Warning */}
        {isExpiringSoon && (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            Expires {new Date(bonus.expiresAt!).toLocaleDateString()}
          </div>
        )}

        {/* View Details Link */}
        <Button variant="ghost" size="sm" className="w-full" asChild>
          <Link href={`/bets/settings/promos/deposit-bonus/${bonus.id}`}>
            View Details
            <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
