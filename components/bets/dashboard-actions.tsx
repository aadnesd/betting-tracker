"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccountOption, QuickTransactionSheet } from "@/components/bets/quick-transaction-sheet";
import { Button } from "@/components/ui/button";

interface DashboardActionsProps {
  pendingReviewCount: number;
  accounts: AccountOption[];
}

/**
 * Client component for dashboard action buttons including QuickTransactionSheet.
 * Separated from the server component to allow client-side interactivity.
 */
export function DashboardActions({ pendingReviewCount, accounts }: DashboardActionsProps) {
  const router = useRouter();

  const handleTransactionSuccess = () => {
    // Refresh dashboard data after successful transaction
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm" className="md:size-default">
        <Link href="/bets/reports">Reports</Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="md:size-default">
        <Link href="/bets/bankroll">Bankroll</Link>
      </Button>
      <Button asChild variant={pendingReviewCount > 0 ? "outline" : "ghost"} size="sm" className="md:size-default">
        <Link href="/bets/review" className="flex items-center gap-2">
          Review
          {pendingReviewCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 font-semibold text-white text-xs">
              {pendingReviewCount}
            </span>
          )}
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="md:size-default">
        <Link href="/bets/settings/accounts">Accounts</Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="md:size-default">
        <Link href="/bets/settings/promos">Free Bets</Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="md:size-default">
        <Link href="/bets/settings/competitions">Competitions</Link>
      </Button>
      <QuickTransactionSheet 
        accounts={accounts} 
        onSuccess={handleTransactionSuccess}
      />
      <Button asChild variant="outline" size="sm" className="md:size-default">
        <Link href="/bets/quick-add">Quick Add</Link>
      </Button>
      <Button asChild size="sm" className="md:size-default">
        <Link href="/bets/new">New bet</Link>
      </Button>
    </div>
  );
}
