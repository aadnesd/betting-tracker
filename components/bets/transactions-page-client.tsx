"use client";

import { ArrowUpDown, Building2, Search, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UnifiedTransactionListItem } from "@/lib/db/queries";
import { formatCurrency, formatNOK } from "@/lib/reporting";

type SourceFilter = "all" | "account" | "wallet";
type LinkedFilter = "all" | "linked" | "standalone";
type FlowFilter = "all" | "inflow" | "outflow";
type SortOption =
  | "date_desc"
  | "date_asc"
  | "amount_desc"
  | "amount_asc"
  | "created_desc";
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function parseDateBoundary(
  value: string,
  boundary: "start" | "end"
): Date | null {
  if (!DATE_INPUT_PATTERN.test(value)) {
    return null;
  }

  const suffix = boundary === "start" ? "T00:00:00" : "T23:59:59.999";
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSourceLabel(source: UnifiedTransactionListItem["source"]) {
  return source === "account" ? "Account" : "Wallet";
}

function getSourceBadgeVariant(
  source: UnifiedTransactionListItem["source"]
): BadgeProps["variant"] {
  return source === "account" ? "default" : "secondary";
}

function getTypeBadgeClassName(type: string) {
  if (
    type === "deposit" ||
    type === "bonus" ||
    type === "transfer_from_account" ||
    type === "transfer_from_wallet"
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (
    type === "withdrawal" ||
    type === "fee" ||
    type === "transfer_to_account" ||
    type === "transfer_to_wallet"
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function isPositiveAmount(transaction: UnifiedTransactionListItem) {
  if (transaction.source === "account") {
    return transaction.type !== "withdrawal";
  }

  return (
    transaction.type === "deposit" ||
    transaction.type === "transfer_from_account" ||
    transaction.type === "transfer_from_wallet"
  );
}

function getSignedAmount(transaction: UnifiedTransactionListItem) {
  return isPositiveAmount(transaction)
    ? transaction.amount
    : -Math.abs(transaction.amount);
}

function getSortLabel(sortOption: SortOption) {
  switch (sortOption) {
    case "date_asc":
      return "Oldest first";
    case "amount_desc":
      return "Largest amount";
    case "amount_asc":
      return "Smallest amount";
    case "created_desc":
      return "Newest created";
    default:
      return "Newest first";
  }
}

function RelatedEntityCell({
  relatedAccountName,
  relatedWalletName,
}: Pick<
  UnifiedTransactionListItem,
  "relatedAccountName" | "relatedWalletName"
>) {
  if (!relatedAccountName && !relatedWalletName) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="space-y-1">
      {relatedAccountName && (
        <div className="text-sm">Account: {relatedAccountName}</div>
      )}
      {relatedWalletName && (
        <div className="text-sm">Wallet: {relatedWalletName}</div>
      )}
    </div>
  );
}

export function TransactionsPageClient({
  transactions,
}: {
  transactions: UnifiedTransactionListItem[];
}) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [linkedFilter, setLinkedFilter] = useState<LinkedFilter>("all");
  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("date_desc");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const deferredQuery = useDeferredValue(query);

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const parsedMinAmount =
    minAmount.trim() === "" ? null : Number.parseFloat(minAmount);
  const parsedMaxAmount =
    maxAmount.trim() === "" ? null : Number.parseFloat(maxAmount);
  const fromDateTime = parseDateBoundary(fromDate, "start");
  const toDateTime = parseDateBoundary(toDate, "end");
  const typeOptions = Array.from(
    new Set(transactions.map((tx) => tx.type))
  ).sort();
  const currencyOptions = Array.from(
    new Set(transactions.map((tx) => tx.currency))
  ).sort();
  const entityOptions = Array.from(
    new Map(transactions.map((tx) => [tx.entityId, tx.entityName])).entries()
  ).sort((left, right) => left[1].localeCompare(right[1]));

  const filteredTransactions = transactions.filter((transaction) => {
    if (sourceFilter !== "all" && transaction.source !== sourceFilter) {
      return false;
    }

    if (typeFilter !== "all" && transaction.type !== typeFilter) {
      return false;
    }

    if (currencyFilter !== "all" && transaction.currency !== currencyFilter) {
      return false;
    }

    if (entityFilter !== "all" && transaction.entityId !== entityFilter) {
      return false;
    }

    if (linkedFilter === "linked" && !transaction.linkedTransfer) {
      return false;
    }

    if (linkedFilter === "standalone" && transaction.linkedTransfer) {
      return false;
    }

    if (flowFilter === "inflow" && !isPositiveAmount(transaction)) {
      return false;
    }

    if (flowFilter === "outflow" && isPositiveAmount(transaction)) {
      return false;
    }

    if (fromDateTime && transaction.occurredAt < fromDateTime) {
      return false;
    }

    if (toDateTime && transaction.occurredAt > toDateTime) {
      return false;
    }

    const absoluteAmount = Math.abs(transaction.amount);
    if (parsedMinAmount !== null && absoluteAmount < parsedMinAmount) {
      return false;
    }

    if (parsedMaxAmount !== null && absoluteAmount > parsedMaxAmount) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      transaction.entityName,
      transaction.entityCategory,
      transaction.type,
      transaction.currency,
      transaction.notes,
      transaction.externalRef,
      transaction.relatedAccountName,
      transaction.relatedWalletName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  const sortedTransactions = [...filteredTransactions].sort((left, right) => {
    switch (sortOption) {
      case "date_asc":
        return left.occurredAt.getTime() - right.occurredAt.getTime();
      case "amount_desc":
        return Math.abs(right.amount) - Math.abs(left.amount);
      case "amount_asc":
        return Math.abs(left.amount) - Math.abs(right.amount);
      case "created_desc":
        return right.createdAt.getTime() - left.createdAt.getTime();
      default:
        return right.occurredAt.getTime() - left.occurredAt.getTime();
    }
  });

  const visibleAccountTransactions = sortedTransactions.filter(
    (tx) => tx.source === "account"
  ).length;
  const visibleWalletTransactions =
    sortedTransactions.length - visibleAccountTransactions;
  const linkedCount = sortedTransactions.filter(
    (tx) => tx.linkedTransfer
  ).length;
  const visibleNetAmount = sortedTransactions.reduce(
    (sum, transaction) => sum + getSignedAmount(transaction),
    0
  );

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Bankroll activity
          </p>
          <h1 className="font-semibold text-2xl">Transactions</h1>
          <p className="text-muted-foreground text-sm">
            Search and filter all account and wallet transactions in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/bets">Dashboard</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/bets/bankroll">Bankroll</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Total transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{transactions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Visible accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{visibleAccountTransactions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Visible wallets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-2xl">{visibleWalletTransactions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Visible net flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`font-bold text-2xl ${
                visibleNetAmount >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {visibleNetAmount >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(visibleNetAmount), "NOK")}
            </p>
            <p className="text-muted-foreground text-xs">
              {linkedCount} linked transfer{linkedCount !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes, type, entity, currency, or reference"
                value={query}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Select
                onValueChange={(value) =>
                  setSourceFilter(value as SourceFilter)
                }
                value={sourceFilter}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="account">Accounts</SelectItem>
                  <SelectItem value="wallet">Wallets</SelectItem>
                </SelectContent>
              </Select>

              <Select onValueChange={setTypeFilter} value={typeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {typeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select onValueChange={setCurrencyFilter} value={currencyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All currencies</SelectItem>
                  {currencyOptions.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select onValueChange={setEntityFilter} value={entityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Account or wallet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts/wallets</SelectItem>
                  {entityOptions.map(([entityId, entityName]) => (
                    <SelectItem key={entityId} value={entityId}>
                      {entityName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                onValueChange={(value) =>
                  setLinkedFilter(value as LinkedFilter)
                }
                value={linkedFilter}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Transfer linkage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All linkage</SelectItem>
                  <SelectItem value="linked">Linked transfers</SelectItem>
                  <SelectItem value="standalone">Standalone only</SelectItem>
                </SelectContent>
              </Select>

              <Select
                onValueChange={(value) => setFlowFilter(value as FlowFilter)}
                value={flowFilter}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All directions</SelectItem>
                  <SelectItem value="inflow">Inflows only</SelectItem>
                  <SelectItem value="outflow">Outflows only</SelectItem>
                </SelectContent>
              </Select>

              <Select
                onValueChange={(value) => setSortOption(value as SortOption)}
                value={sortOption}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_desc">Newest first</SelectItem>
                  <SelectItem value="date_asc">Oldest first</SelectItem>
                  <SelectItem value="amount_desc">Largest amount</SelectItem>
                  <SelectItem value="amount_asc">Smallest amount</SelectItem>
                  <SelectItem value="created_desc">Newest created</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="transactions-from-date"
                >
                  From date
                </label>
                <Input
                  id="transactions-from-date"
                  onChange={(event) => setFromDate(event.target.value)}
                  placeholder="YYYY-MM-DD"
                  type="text"
                  value={fromDate}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="transactions-to-date"
                >
                  To date
                </label>
                <Input
                  id="transactions-to-date"
                  onChange={(event) => setToDate(event.target.value)}
                  placeholder="YYYY-MM-DD"
                  type="text"
                  value={toDate}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="transactions-min-amount"
                >
                  Min amount
                </label>
                <Input
                  id="transactions-min-amount"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setMinAmount(event.target.value)}
                  placeholder="0"
                  step="0.01"
                  type="number"
                  value={minAmount}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor="transactions-max-amount"
                >
                  Max amount
                </label>
                <Input
                  id="transactions-max-amount"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setMaxAmount(event.target.value)}
                  placeholder="0"
                  step="0.01"
                  type="number"
                  value={maxAmount}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{sortedTransactions.length} shown</Badge>
            {sortedTransactions.length > 0 && (
              <Badge variant="outline">
                {getSortLabel(sortOption)}:{" "}
                {formatDateTime(sortedTransactions[0].occurredAt)}
              </Badge>
            )}
            {fromDate && <Badge variant="outline">From: {fromDate}</Badge>}
            {toDate && <Badge variant="outline">To: {toDate}</Badge>}
            <Button
              className="h-8 px-3"
              onClick={() => {
                setQuery("");
                setSourceFilter("all");
                setTypeFilter("all");
                setCurrencyFilter("all");
                setEntityFilter("all");
                setLinkedFilter("all");
                setFlowFilter("all");
                setSortOption("date_desc");
                setFromDate("");
                setToDate("");
                setMinAmount("");
                setMaxAmount("");
              }}
              size="sm"
              variant="ghost"
            >
              <X className="mr-1 h-4 w-4" />
              Clear filters
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sortedTransactions.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center">
              <p className="font-medium">
                No transactions match the current filters
              </p>
              <p className="text-muted-foreground text-sm">
                Try broadening the search or clearing filters.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Account / Wallet</TableHead>
                  <TableHead>Related</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTransactions.map((transaction) => {
                  const positive = isPositiveAmount(transaction);

                  return (
                    <TableRow key={`${transaction.source}-${transaction.id}`}>
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium">
                          {formatDateTime(transaction.occurredAt)}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          Created {formatDateTime(transaction.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className="gap-1"
                          variant={getSourceBadgeVariant(transaction.source)}
                        >
                          {transaction.source === "account" ? (
                            <Building2 className="h-3 w-3" />
                          ) : (
                            <Wallet className="h-3 w-3" />
                          )}
                          {getSourceLabel(transaction.source)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={getTypeBadgeClassName(transaction.type)}
                          variant="outline"
                        >
                          <ArrowUpDown className="mr-1 h-3 w-3" />
                          {transaction.type.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          className="font-medium hover:underline"
                          href={transaction.entityPath}
                        >
                          {transaction.entityName}
                        </Link>
                        {transaction.entityCategory && (
                          <div className="text-muted-foreground text-xs capitalize">
                            {transaction.entityCategory}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <RelatedEntityCell
                          relatedAccountName={transaction.relatedAccountName}
                          relatedWalletName={transaction.relatedWalletName}
                        />
                        {transaction.linkedTransfer && (
                          <div className="mt-1 text-muted-foreground text-xs">
                            Linked transfer
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate text-sm">
                          {transaction.notes || "-"}
                        </div>
                        {transaction.externalRef && (
                          <div className="truncate text-muted-foreground text-xs">
                            Ref: {transaction.externalRef}
                          </div>
                        )}
                        {transaction.amountNok !== null && (
                          <div className="text-muted-foreground text-xs">
                            {formatNOK(transaction.amountNok)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          positive ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {positive ? "+" : "-"}
                        {formatCurrency(
                          Math.abs(transaction.amount),
                          transaction.currency
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
