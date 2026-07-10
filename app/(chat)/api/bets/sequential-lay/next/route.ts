import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { computeSingleLegOutcome } from "@/lib/bet-calculations";
import {
  isSequentialLayRelatedMatchedBet,
  SEQUENTIAL_LAY_STEP_TAG,
} from "@/lib/bets/sequential-lay";
import { revalidateDashboard } from "@/lib/cache";
import {
  createAuditEntry,
  createManualScreenshot,
  createMatchedBetRecord,
  getAccountById,
  getMatchedBetWithParts,
  getMatchedSetGroupMembers,
  linkMatchedBetsIntoGroup,
  saveLayBet,
} from "@/lib/db/queries";
import { convertAmountToNok } from "@/lib/fx-rates";

const payloadSchema = z.object({
  parentMatchedBetId: z.string().uuid(),
  accountId: z.string().uuid(),
  odds: z.number().positive(),
  stake: z.number().positive(),
  currency: z.string().length(3),
  placedAt: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function safeDate(value?: string | null) {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof payloadSchema>;
  try {
    body = payloadSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", details: error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const [parent, account] = await Promise.all([
      getMatchedBetWithParts({
        id: body.parentMatchedBetId,
        userId: session.user.id,
      }),
      getAccountById({
        id: body.accountId,
        userId: session.user.id,
      }),
    ]);

    if (!parent) {
      return NextResponse.json(
        { error: "Parent matched bet not found" },
        { status: 404 }
      );
    }

    if (!isSequentialLayRelatedMatchedBet(parent.matched.notes)) {
      return NextResponse.json(
        { error: "Next lay can only be added to a sequential lay bet" },
        { status: 400 }
      );
    }

    if (!account || account.kind !== "exchange") {
      return NextResponse.json(
        { error: "Exchange account not found" },
        { status: 404 }
      );
    }

    if (account.status !== "active") {
      return NextResponse.json(
        { error: "Exchange account must be active" },
        { status: 400 }
      );
    }

    const existingMembers = parent.matched.betGroupId
      ? await getMatchedSetGroupMembers({
          userId: session.user.id,
          groupId: parent.matched.betGroupId,
        })
      : [];
    const stepNumber =
      existingMembers.length > 0 ? existingMembers.length + 1 : 2;

    const screenshot = await createManualScreenshot({
      userId: session.user.id,
      kind: "lay",
    });

    const placedAt = safeDate(body.placedAt);

    const layBet = await saveLayBet({
      userId: session.user.id,
      screenshotId: screenshot.id,
      market: parent.matched.market,
      selection: parent.matched.selection,
      normalizedSelection: parent.matched.normalizedSelection,
      odds: body.odds,
      stake: body.stake,
      exchange: account.name,
      matchId: parent.matched.matchId ?? null,
      accountId: account.id,
      currency: body.currency,
      placedAt,
      settledAt: null,
      profitLoss: null,
      confidence: null,
      status: "matched",
    });

    const stakeNok = await convertAmountToNok(body.stake, body.currency);
    const outcome = computeSingleLegOutcome({
      kind: "lay",
      stake: stakeNok,
      odds: body.odds,
      commissionRate: account.commission
        ? Number.parseFloat(account.commission)
        : 0,
    });

    const matched = await createMatchedBetRecord({
      userId: session.user.id,
      layBetId: layBet.id,
      matchId: parent.matched.matchId ?? null,
      unlinkedMatchDate: parent.matched.unlinkedMatchDate ?? null,
      market: parent.matched.market,
      selection: parent.matched.selection,
      normalizedSelection: parent.matched.normalizedSelection,
      status: "matched",
      netExposure: outcome.netExposure,
      notes: body.notes?.trim()
        ? `${SEQUENTIAL_LAY_STEP_TAG} Step ${stepNumber}. ${body.notes.trim()}`
        : `${SEQUENTIAL_LAY_STEP_TAG} Step ${stepNumber}`,
    });

    const groupId = await linkMatchedBetsIntoGroup({
      userId: session.user.id,
      sourceId: matched.id,
      targetId: parent.matched.id,
    });

    await Promise.allSettled([
      createAuditEntry({
        userId: session.user.id,
        entityType: "lay_bet",
        entityId: layBet.id,
        action: "create",
        changes: {
          market: layBet.market,
          selection: layBet.selection,
          odds: body.odds,
          stake: body.stake,
          currency: body.currency,
          exchange: account.name,
          source: "sequential_lay_next",
          stepNumber,
          matchedBetId: matched.id,
        },
        notes: `Created sequential lay step ${stepNumber}`,
      }),
      createAuditEntry({
        userId: session.user.id,
        entityType: "matched_bet",
        entityId: matched.id,
        action: "create",
        changes: {
          layBetId: layBet.id,
          status: "matched",
          netExposure: outcome.netExposure,
          source: "sequential_lay_next",
          stepNumber,
          groupId,
          parentMatchedBetId: parent.matched.id,
        },
        notes: `Created sequential lay timeline step ${stepNumber}`,
      }),
    ]);

    revalidateDashboard(session.user.id);

    return NextResponse.json({
      success: true,
      matchedBetId: matched.id,
      groupId,
      stepNumber,
    });
  } catch (error) {
    console.error("Failed to create sequential lay step", error);
    return NextResponse.json(
      { error: "Failed to create next sequential lay" },
      { status: 500 }
    );
  }
}
