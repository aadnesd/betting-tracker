import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createAuditEntry,
  getMatchedBetWithParts,
  updateMatchedBetRecord,
} from "@/lib/db/queries";
import { computeNetExposureInputs } from "@/lib/bet-calculations";
import { convertAmountToNok } from "@/lib/fx-rates";

const payloadSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof payloadSchema>;
  try {
    const json = await request.json();
    body = payloadSchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    // Fetch the full matched bet with back/lay legs
    const fullBet = await getMatchedBetWithParts({
      id: body.id,
      userId: session.user.id,
    });

    if (!fullBet) {
      return NextResponse.json(
        { error: "Matched bet not found" },
        { status: 404 }
      );
    }

    const { back, lay, matched } = fullBet;

    // Need both legs to recalculate
    if (!back || !lay) {
      return NextResponse.json(
        { error: "Cannot recalculate: missing back or lay leg" },
        { status: 400 }
      );
    }

    // Parse values
    const backStake = Number.parseFloat(back.stake);
    const backOdds = Number.parseFloat(back.odds);
    const layStake = Number.parseFloat(lay.stake);
    const layOdds = Number.parseFloat(lay.odds);

    if (
      Number.isNaN(backStake) ||
      Number.isNaN(backOdds) ||
      Number.isNaN(layStake) ||
      Number.isNaN(layOdds)
    ) {
      return NextResponse.json(
        { error: "Invalid stake or odds values" },
        { status: 400 }
      );
    }

    // Compute net exposure inputs
    const { backProfit, layLiability } = computeNetExposureInputs({
      backStake,
      backOdds,
      layStake,
      layOdds,
    });

    const backCurrency = back.currency?.toUpperCase() ?? "NOK";
    const layCurrency = lay.currency?.toUpperCase() ?? "NOK";

    console.log(
      `[RECALC] id=${body.id} backProfit=${backProfit} ${backCurrency}, layLiability=${layLiability} ${layCurrency}`
    );

    // Convert to NOK
    const [backProfitNok, layLiabilityNok] = await Promise.all([
      convertAmountToNok(backProfit, backCurrency),
      convertAmountToNok(layLiability, layCurrency),
    ]);

    const newNetExposure = layLiabilityNok - backProfitNok;

    console.log(
      `[RECALC] backProfitNok=${backProfitNok}, layLiabilityNok=${layLiabilityNok}, newNetExposure=${newNetExposure}`
    );

    const oldNetExposure = matched.netExposure
      ? Number.parseFloat(matched.netExposure)
      : null;

    // Update the matched bet
    const updated = await updateMatchedBetRecord({
      id: body.id,
      userId: session.user.id,
      netExposure: newNetExposure,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update net exposure" },
        { status: 500 }
      );
    }

    // Create audit entry
    await createAuditEntry({
      userId: session.user.id,
      entityType: "matched_bet",
      entityId: body.id,
      action: "update",
      changes: {
        netExposure: {
          from: oldNetExposure,
          to: newNetExposure,
        },
      },
      notes: `Recalculated net exposure with FX conversion: ${backCurrency}→NOK, ${layCurrency}→NOK`,
    });

    return NextResponse.json({
      success: true,
      oldNetExposure,
      newNetExposure,
      details: {
        backProfit,
        backCurrency,
        backProfitNok,
        layLiability,
        layCurrency,
        layLiabilityNok,
      },
    });
  } catch (error) {
    console.error("Failed to recalculate net exposure", error);
    return NextResponse.json(
      { error: "Failed to recalculate net exposure" },
      { status: 500 }
    );
  }
}
