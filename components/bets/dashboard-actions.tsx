"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type AccountOption,
  QuickTransactionSheet,
  type WalletOption,
} from "@/components/bets/quick-transaction-sheet";
import { Button } from "@/components/ui/button";

interface DashboardActionsProps {
  pendingReviewCount: number;
  accounts: AccountOption[];
  wallets?: WalletOption[];
}

/**
 * Client component for dashboard action buttons including QuickTransactionSheet.
 * Separated from the server component to allow client-side interactivity.
 */
export function DashboardActions({
  pendingReviewCount,
  accounts,
  wallets = [],
}: DashboardActionsProps) {
  const router = useRouter();

  const handleTransactionSuccess = () => {
    // Refresh dashboard data after successful transaction
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild className="md:size-default" size="sm" variant="outline">
        <Link href="/bets/reports">Reports</Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="outline">
        <Link href="/bets/bankroll">Bankroll</Link>
      </Button>
      <Button
        asChild
        className="md:size-default"
        size="sm"
        variant={pendingReviewCount > 0 ? "outline" : "ghost"}
      >
        <Link className="flex items-center gap-2" href="/bets/review">
          Review
          {pendingReviewCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 font-semibold text-white text-xs">
              {pendingReviewCount}
            </span>
          )}
        </Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/matched">Matched bets</Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/all">All bets</Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/settings/accounts">Accounts</Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/settings/wallets" prefetch={false}>
          Wallets
        </Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/settings/promos" prefetch={false}>
          Free Bets
        </Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/settings/competitions">Competitions</Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/settings/api-keys">API Keys</Link>
      </Button>
      <QuickTransactionSheet
        accounts={accounts}
        onSuccess={handleTransactionSuccess}
        wallets={wallets}
      />
      <Button asChild className="md:size-default" size="sm" variant="outline">
        <Link href="/bets/quick-add">Quick Add</Link>
      </Button>
      <Button asChild className="md:size-default" size="sm">
        <Link href="/bets/new">New bet</Link>
      </Button>
    </div>
  );
}
