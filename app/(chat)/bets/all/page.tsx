import { endOfDay, startOfDay, subDays } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { IndividualBetsTable } from "@/components/bets/individual-bets-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAccountsByUser, listAllBetsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "All bets — Matched betting",
};

type PageProps = {
  searchParams: Promise<{
    status?: string;
    account?: string;
    range?: string;
    query?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 25;
const OPEN_BETS_SECTION_LIMIT = 100;

type StatusFilter = "all" | "active" | "settled";

const rangeOptions = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
] as const;

const statusOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Open" },
  { value: "settled", label: "Settled" },
] as const;

function resolveDateRange({
  range,
  from,
  to,
}: {
  range: string;
  from?: string;
  to?: string;
}) {
  const now = new Date();

  if (range === "all") {
    return { fromDate: undefined, toDate: undefined };
  }

  if (range === "custom") {
    const fromDate = from ? startOfDay(new Date(from)) : undefined;
    const toDate = to ? endOfDay(new Date(to)) : undefined;
    return { fromDate, toDate };
  }

  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  return {
    fromDate: startOfDay(subDays(now, days)),
    toDate: endOfDay(now),
  };
}

function normalizeStatusFilter(status?: string): StatusFilter {
  if (status === "active" || status === "placed") {
    return "active";
  }

  if (status === "settled") {
    return "settled";
  }

  return "all";
}

export default async function Page(props: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const selectedStatus = normalizeStatusFilter(searchParams.status);
  const accountId =
    searchParams.account && searchParams.account !== "all"
      ? searchParams.account
      : undefined;
  const range = searchParams.range ?? "30d";
  const searchQuery = searchParams.query?.trim() || undefined;
  const pageParam = Number.parseInt(searchParams.page ?? "", 10);
  const currentPage =
    Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const { fromDate, toDate } = resolveDateRange({
    range,
    from: searchParams.from,
    to: searchParams.to,
  });

  const sharedFilters = {
    userId: session.user.id,
    accountId,
    fromDate,
    toDate,
    search: searchQuery,
  };

  const [openBetsResult, settledBetsResult, accounts] = await Promise.all([
    selectedStatus === "settled"
      ? Promise.resolve(null)
      : listAllBetsByUser({
          ...sharedFilters,
          status: "active",
          limit: selectedStatus === "all" ? OPEN_BETS_SECTION_LIMIT : PAGE_SIZE,
          offset: selectedStatus === "active" ? offset : 0,
        }),
    selectedStatus === "active"
      ? Promise.resolve(null)
      : listAllBetsByUser({
          ...sharedFilters,
          status: "settled",
          limit: PAGE_SIZE,
          offset,
        }),
    listAccountsByUser({ userId: session.user.id, limit: 200 }),
  ]);

  const buildPageHref = ({
    page,
    statusOverride = selectedStatus,
  }: {
    page?: number;
    statusOverride?: StatusFilter;
  }) => {
    const params = new URLSearchParams();

    if (statusOverride !== "all") {
      params.set("status", statusOverride);
    }
    if (searchParams.account) {
      params.set("account", searchParams.account);
    }
    if (searchParams.range) {
      params.set("range", searchParams.range);
    }
    if (searchParams.query) {
      params.set("query", searchParams.query);
    }
    if (searchParams.from) {
      params.set("from", searchParams.from);
    }
    if (searchParams.to) {
      params.set("to", searchParams.to);
    }

    if (page && page > 1) {
      params.set("page", String(page));
    }

    const queryString = params.toString();
    return queryString ? `/bets/all?${queryString}` : "/bets/all";
  };

  const openBets = openBetsResult?.bets ?? [];
  const settledBets = settledBetsResult?.bets ?? [];
  const showOpenSection = selectedStatus !== "settled";
  const showSettledSection = selectedStatus !== "active";
  const openPaginationVisible =
    selectedStatus === "active" &&
    (currentPage > 1 || Boolean(openBetsResult?.hasMore));
  const settledPaginationVisible =
    showSettledSection &&
    (currentPage > 1 || Boolean(settledBetsResult?.hasMore));
  const showEmptyState =
    !showOpenSection || openBets.length === 0
      ? !showSettledSection || settledBets.length === 0
      : false;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">
            Matched betting
          </p>
          <h1 className="font-semibold text-2xl">All bets</h1>
          <p className="text-muted-foreground text-sm">
            Open bets are surfaced separately so unsettled positions stay
            visible.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/bets">← Dashboard</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/bets/quick-add">Quick Add</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/bets/new/standalone">New Single Bet</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/bets/new">New matched bet</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-[repeat(12,minmax(0,1fr))]"
            method="get"
          >
            <div className="md:col-span-2">
              <label className="text-muted-foreground text-xs" htmlFor="status">
                Status
              </label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={selectedStatus}
                id="status"
                name="status"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="account"
              >
                Account
              </label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={searchParams.account ?? "all"}
                id="account"
                name="account"
              >
                <option value="all">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.kind})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="text-muted-foreground text-xs" htmlFor="range">
                Date range
              </label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={range}
                id="range"
                name="range"
              >
                {rangeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-muted-foreground text-xs" htmlFor="from">
                From
              </label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={searchParams.from}
                id="from"
                name="from"
                type="date"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-muted-foreground text-xs" htmlFor="to">
                To
              </label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={searchParams.to}
                id="to"
                name="to"
                type="date"
              />
            </div>

            <div className="md:col-span-8">
              <label className="text-muted-foreground text-xs" htmlFor="query">
                Search
              </label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                defaultValue={searchParams.query}
                id="query"
                name="query"
                placeholder="Market, selection, or bookmaker"
              />
            </div>

            <div className="flex items-end gap-2 md:col-span-4">
              <Button size="sm" type="submit">
                Apply filters
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/bets/all">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {showEmptyState ? (
        <Card>
          <CardHeader>
            <CardTitle>No bets found</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                No bets match these filters yet.
              </p>
              <Button asChild size="sm">
                <Link href="/bets/new">Upload a matched bet</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showOpenSection && openBets.length > 0 ? (
        <Card className="border-blue-200/80">
          <CardHeader className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle>Open bets</CardTitle>
              <p className="text-muted-foreground text-sm">
                {selectedStatus === "all"
                  ? "Unsettled bets are pulled into their own section first."
                  : "All bets that still need settlement."}
              </p>
            </div>
            <p className="text-muted-foreground text-sm">
              Showing {openBets.length} open bet
              {openBets.length === 1 ? "" : "s"}
              {selectedStatus === "active" ? ` on page ${currentPage}` : ""}
            </p>
          </CardHeader>
          <CardContent>
            <IndividualBetsTable bets={openBets} />

            {selectedStatus === "all" && openBetsResult?.hasMore ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-sm">
                  Showing the newest {OPEN_BETS_SECTION_LIMIT} open bets here.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href={buildPageHref({ statusOverride: "active" })}>
                    View all open bets
                  </Link>
                </Button>
              </div>
            ) : null}

            {openPaginationVisible ? (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Page {currentPage}
                </p>
                <div className="flex items-center gap-2">
                  {currentPage > 1 ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={buildPageHref({ page: currentPage - 1 })}>
                        Previous
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      Previous
                    </Button>
                  )}
                  {openBetsResult?.hasMore ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={buildPageHref({ page: currentPage + 1 })}>
                        Next
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      Next
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showSettledSection && settledBets.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle>
                {selectedStatus === "settled"
                  ? "Settled bets"
                  : "Recent settled bets"}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {selectedStatus === "settled"
                  ? "Completed bets ordered by placed date."
                  : "Settled bets stay below the open-bets queue."}
              </p>
            </div>
            <p className="text-muted-foreground text-sm">
              Showing {settledBets.length} settled bet
              {settledBets.length === 1 ? "" : "s"} on page {currentPage}
            </p>
          </CardHeader>
          <CardContent>
            <IndividualBetsTable bets={settledBets} />

            {settledPaginationVisible ? (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Page {currentPage}
                </p>
                <div className="flex items-center gap-2">
                  {currentPage > 1 ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={buildPageHref({ page: currentPage - 1 })}>
                        Previous
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      Previous
                    </Button>
                  )}
                  {settledBetsResult?.hasMore ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={buildPageHref({ page: currentPage + 1 })}>
                        Next
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      Next
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
