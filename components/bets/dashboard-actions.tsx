"use client";

import { Gift } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type AccountOption,
  type WalletOption,
} from "@/components/bets/quick-transaction-sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const QuickTransactionSheet = dynamic(
  () =>
    import("@/components/bets/quick-transaction-sheet").then(
      (module) => module.QuickTransactionSheet
    ),
  { ssr: false }
);

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
  const [showQuickTransaction, setShowQuickTransaction] = useState(false);
  const router = useRouter();

  const handleTransactionSuccess = () => {
    // Refresh dashboard data after successful transaction
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild className="md:size-default" size="sm" variant="outline">
        <Link href="/bets/reports" prefetch={false}>
          Reports
        </Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="outline">
        <Link href="/bets/bankroll" prefetch={false}>
          Bankroll
        </Link>
      </Button>
      <Button
        asChild
        className="md:size-default"
        size="sm"
        variant={pendingReviewCount > 0 ? "outline" : "ghost"}
      >
        <Link
          className="flex items-center gap-2"
          href="/bets/review"
          prefetch={false}
        >
          Review
          {pendingReviewCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 font-semibold text-white text-xs">
              {pendingReviewCount}
            </span>
          )}
        </Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/matched" prefetch={false}>
          Matched bets
        </Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/all" prefetch={false}>
          All bets
        </Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/settings/accounts" prefetch={false}>
          Accounts
        </Link>
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
        <Link href="/bets/settings/competitions" prefetch={false}>
          Competitions
        </Link>
      </Button>
      <Button asChild className="md:size-default" size="sm" variant="ghost">
        <Link href="/bets/settings/api-keys" prefetch={false}>
          API Keys
        </Link>
      </Button>
      {showQuickTransaction ? (
        <QuickTransactionSheet
          accounts={accounts}
          defaultOpen
          onSuccess={handleTransactionSuccess}
          wallets={wallets}
        />
      ) : (
        <Button
          className="md:size-default"
          onClick={() => setShowQuickTransaction(true)}
          size="sm"
          variant="outline"
        >
          <Gift className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Quick Transaction</span>
          <span className="sm:hidden">Txn</span>
        </Button>
      )}
      <Button asChild className="md:size-default" size="sm" variant="outline">
        <Link href="/bets/quick-add" prefetch={false}>
          Quick Add
        </Link>
      </Button>
      <Button asChild className="md:size-default" size="sm">
        <Link href="/bets/new" prefetch={false}>
          New bet
        </Link>
      </Button>
    </div>
  );
}
