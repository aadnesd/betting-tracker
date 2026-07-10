"use client";

import { Link2, Unlink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BetStatusBadge } from "@/components/bets/bet-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BetStatus =
  | "draft"
  | "placed"
  | "matched"
  | "settled"
  | "needs_review"
  | "error";

type GroupMember = {
  id: string;
  market: string;
  selection: string;
  status: BetStatus;
  promoType: string | null;
  profitIfWins: number | null;
  profitIfLoses: number | null;
  isCurrent: boolean;
};

type Candidate = {
  id: string;
  market: string;
  selection: string;
  status: BetStatus;
  promoType: string | null;
};

type Aggregate = {
  ifWins: number;
  ifLoses: number;
  guaranteed: number;
} | null;

function formatNok(value: number | null) {
  if (value === null) {
    return "—";
  }
  return `NOK ${value.toFixed(2)}`;
}

function amountClass(value: number | null) {
  if (value === null) {
    return "";
  }
  return value >= 0 ? "text-green-600" : "text-red-600";
}

export function MatchedBetGroupCard({
  currentId,
  betGroupId,
  members,
  aggregate,
  isSequentialLay = false,
  addNextLayHref = null,
}: {
  currentId: string;
  betGroupId: string | null;
  members: GroupMember[];
  aggregate: Aggregate;
  isSequentialLay?: boolean;
  addNextLayHref?: string | null;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingCandidates(true);
    fetch(`/api/bets/link-group?excludeId=${currentId}`)
      .then((res) => (res.ok ? res.json() : { candidates: [] }))
      .then((data) => {
        if (active) {
          const existing = new Set(members.map((m) => m.id));
          setCandidates(
            (data.candidates ?? []).filter(
              (c: Candidate) => !existing.has(c.id)
            )
          );
        }
      })
      .catch(() => {
        // Non-fatal: picker simply stays empty.
      })
      .finally(() => {
        if (active) {
          setLoadingCandidates(false);
        }
      });
    return () => {
      active = false;
    };
  }, [currentId, members]);

  const handleLink = async () => {
    if (!selectedId) {
      return;
    }
    setIsLinking(true);
    try {
      const resp = await fetch("/api/bets/link-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link",
          sourceId: currentId,
          targetId: selectedId,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to link");
      }
      toast.success("Bets linked into a group");
      setSelectedId("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Link failed");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async (id: string) => {
    setUnlinkingId(id);
    try {
      const resp = await fetch("/api/bets/link-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink", id }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to unlink");
      }
      toast.success("Removed from group");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unlink failed");
    } finally {
      setUnlinkingId(null);
    }
  };

  const isGrouped = Boolean(betGroupId) && members.length > 1;
  const showSequentialTimeline = isSequentialLay && members.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            {isSequentialLay ? "Sequential lay timeline" : "Linked bets"}
          </CardTitle>
          {isSequentialLay && addNextLayHref && (
            <Button asChild size="sm" variant="outline">
              <Link href={addNextLayHref}>Add next lay</Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isGrouped || showSequentialTimeline ? (
          <>
            {/* Combined outcome across all group members */}
            {aggregate && (
              <div className="flex flex-wrap gap-4">
                <div className="rounded-lg border bg-muted/50 px-4 py-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    Combined if selection wins
                  </p>
                  <p
                    className={`font-semibold text-lg ${amountClass(aggregate.ifWins)}`}
                  >
                    {formatNok(aggregate.ifWins)}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/50 px-4 py-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    Combined if selection loses
                  </p>
                  <p
                    className={`font-semibold text-lg ${amountClass(aggregate.ifLoses)}`}
                  >
                    {formatNok(aggregate.ifLoses)}
                  </p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    Combined guaranteed
                  </p>
                  <p
                    className={`font-semibold text-lg ${amountClass(aggregate.guaranteed)}`}
                  >
                    {formatNok(aggregate.guaranteed)}
                  </p>
                </div>
              </div>
            )}

            {/* Member list */}
            <ul className="divide-y rounded-md border">
              {members.map((member) => (
                <li
                  className="flex items-center justify-between gap-3 p-3"
                  key={member.id}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                        Step {members.findIndex((m) => m.id === member.id) + 1}
                      </span>
                      {member.isCurrent ? (
                        <span className="truncate font-medium text-sm">
                          {member.selection}
                        </span>
                      ) : (
                        <Link
                          className="truncate font-medium text-sm hover:underline"
                          href={`/bets/${member.id}`}
                        >
                          {member.selection}
                        </Link>
                      )}
                      <BetStatusBadge status={member.status} />
                      {member.isCurrent && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                          This bet
                        </span>
                      )}
                    </div>
                    <p className="truncate text-muted-foreground text-xs">
                      {member.market}
                      {member.promoType ? ` · ${member.promoType}` : ""}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Wins {formatNok(member.profitIfWins)} · Loses{" "}
                      {formatNok(member.profitIfLoses)}
                    </p>
                  </div>
                  {!isSequentialLay && (
                    <Button
                      disabled={unlinkingId === member.id}
                      onClick={() => handleUnlink(member.id)}
                      size="sm"
                      variant="ghost"
                    >
                      <Unlink className="mr-1 h-3 w-3" />
                      {unlinkingId === member.id ? "Removing..." : "Unlink"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {isSequentialLay
              ? "This sequential lay currently has one recorded step. Add the next lay to preserve the timeline."
              : "Not linked to any other bets. Link another matched set to track their combined exposure and guaranteed profit as one play."}
          </p>
        )}

        {!isSequentialLay && (
          <>
            {/* Link picker */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select onValueChange={setSelectedId} value={selectedId}>
                <SelectTrigger className="sm:w-80">
                  <SelectValue
                    placeholder={
                      loadingCandidates
                        ? "Loading bets..."
                        : candidates.length === 0
                          ? "No other bets available"
                          : "Select a bet to link"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.selection} · {c.market}
                      {c.promoType ? ` · ${c.promoType}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!selectedId || isLinking}
                onClick={handleLink}
                variant="outline"
              >
                <Link2 className="mr-1 h-4 w-4" />
                {isLinking ? "Linking..." : "Link bet"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
