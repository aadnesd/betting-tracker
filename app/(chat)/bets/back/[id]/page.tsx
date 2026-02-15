import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { IndividualBetDetail } from "@/components/bets/individual-bet-detail";
import {
  getAccountBalance,
  getAccountById,
  getBackBetById,
  getFootballMatchById,
  getLayBetById,
  getMatchedBetByLegId,
  getScreenshotById,
  listAuditEntriesByEntity,
} from "@/lib/db/queries";

export const metadata = {
  title: "Back bet detail",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;
  const bet = await getBackBetById({ id, userId });

  if (!bet) {
    notFound();
  }

  const [account, screenshot, matchedBet, auditEntries] = await Promise.all([
    bet.accountId ? getAccountById({ id: bet.accountId, userId }) : null,
    bet.screenshotId
      ? getScreenshotById({ id: bet.screenshotId, userId })
      : null,
    getMatchedBetByLegId({ betId: bet.id, kind: "back", userId }),
    listAuditEntriesByEntity({
      entityType: "back_bet",
      entityId: bet.id,
      limit: 50,
    }),
  ]);

  const accountBalance = account
    ? await getAccountBalance({ userId, accountId: account.id })
    : null;

  const otherLeg = matchedBet?.layBetId
    ? await getLayBetById({ id: matchedBet.layBetId, userId })
    : null;

  const matchId = bet.matchId ?? matchedBet?.matchId ?? null;
  const footballMatch = matchId
    ? await getFootballMatchById({ id: matchId })
    : null;

  const settlementEntry = auditEntries.find(
    (entry) => entry.action === "manual_settle"
  );
  const settlementChanges =
    settlementEntry &&
    settlementEntry.changes &&
    typeof settlementEntry.changes === "object"
      ? (settlementEntry.changes as Record<string, unknown>)
      : null;

  const settlementInfo = {
    outcome:
      settlementChanges && typeof settlementChanges.outcome === "string"
        ? settlementChanges.outcome
        : null,
    settledAt: bet.settledAt
      ? format(new Date(bet.settledAt), "dd MMM yyyy, HH:mm")
      : null,
    profitLoss: bet.profitLoss ? Number(bet.profitLoss) : null,
  };

  return (
    <IndividualBetDetail
      account={account}
      accountBalance={accountBalance}
      auditEntries={auditEntries}
      bet={bet}
      betKind="back"
      footballMatch={footballMatch}
      matchedBet={matchedBet}
      otherLeg={otherLeg}
      screenshot={screenshot}
      settlementInfo={settlementInfo}
    />
  );
}
