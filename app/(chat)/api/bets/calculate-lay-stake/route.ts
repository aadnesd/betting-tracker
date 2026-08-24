import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  calculateOptimalLayStake,
  calculateOptimalPredictionMarketShares,
} from "@/lib/bet-calculations";
import { getAccountByName } from "@/lib/db/queries";
import { convertAmountToNok } from "@/lib/fx-rates";
import { isFreeBetPromoType } from "@/lib/settlement";

const calculateLayStakeSchema = z.object({
  backOdds: z.number().gt(1),
  backStake: z.number().positive(),
  backCurrency: z.string().length(3).default("NOK"),
  layOdds: z.number().gt(1).optional(),
  sharePrice: z.number().gt(0).lt(1).optional(),
  layCurrency: z.string().length(3).default("NOK"),
  layExchange: z.string().min(1),
  promoType: z.string().optional(),
  freeBetStakeReturned: z.boolean().optional(),
  strategy: z.enum(["balanced", "underlay", "overlay"]).default("balanced"),
  biasPercent: z.number().min(0).max(100).default(0),
});

function roundStake(value: number) {
  return Math.round(value * 100) / 100;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof calculateLayStakeSchema>;
  try {
    body = calculateLayStakeSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const layAccount = await getAccountByName({
      userId: session.user.id,
      name: body.layExchange,
      kind: "exchange",
    });
    const commissionRate = layAccount?.commission
      ? Number.parseFloat(layAccount.commission)
      : 0;
    const isPredictionMarket = layAccount?.exchangeType === "prediction_market";

    if (isPredictionMarket && body.sharePrice === undefined) {
      return NextResponse.json(
        { error: "Share price is required for prediction-market exchanges" },
        { status: 400 }
      );
    }

    if (!isPredictionMarket && body.layOdds === undefined) {
      return NextResponse.json(
        { error: "Lay odds are required for traditional exchanges" },
        { status: 400 }
      );
    }

    const [backRateToNok, layRateToNok] = await Promise.all([
      convertAmountToNok(1, body.backCurrency),
      convertAmountToNok(1, body.layCurrency),
    ]);

    const calculated = isPredictionMarket
      ? calculateOptimalPredictionMarketShares({
          backStake: body.backStake,
          backOdds: body.backOdds,
          sharePrice: body.sharePrice as number,
          backRateToBase: backRateToNok,
          layRateToBase: layRateToNok,
          isFreeBet: isFreeBetPromoType(body.promoType ?? null),
          freeBetStakeReturned: body.freeBetStakeReturned ?? false,
          commissionRate,
          strategy: body.strategy,
          biasPercent: body.biasPercent,
        })
      : calculateOptimalLayStake({
          backStake: body.backStake,
          backOdds: body.backOdds,
          layOdds: body.layOdds as number,
          backRateToBase: backRateToNok,
          layRateToBase: layRateToNok,
          isFreeBet: isFreeBetPromoType(body.promoType ?? null),
          freeBetStakeReturned: body.freeBetStakeReturned ?? false,
          commissionRate,
          strategy: body.strategy,
          biasPercent: body.biasPercent,
        });

    if (!calculated) {
      return NextResponse.json(
        { error: "Unable to calculate lay stake" },
        { status: 400 }
      );
    }

    const layStake = roundStake(calculated.layStake);
    const equivalentLayOdds = roundStake(
      isPredictionMarket
        ? 1 / (1 - (body.sharePrice as number))
        : (body.layOdds as number)
    );
    const calculatedShares =
      "shares" in calculated && typeof calculated.shares === "number"
        ? calculated.shares
        : null;
    const balancedShares =
      "balancedShares" in calculated &&
      typeof calculated.balancedShares === "number"
        ? calculated.balancedShares
        : null;
    const shares =
      calculatedShares === null
        ? null
        : Math.round(calculatedShares * 10_000) / 10_000;

    return NextResponse.json({
      layStake,
      layLiability: roundStake(layStake * (equivalentLayOdds - 1)),
      balancedLayStake: roundStake(calculated.balancedLayStake),
      profitIfBackWins: roundStake(calculated.profitIfBackWins),
      profitIfLayWins: roundStake(calculated.profitIfLayWins),
      equivalentLayOdds,
      shares,
      balancedShares:
        balancedShares === null
          ? null
          : Math.round(balancedShares * 10_000) / 10_000,
      commissionRate,
      backRateToNok,
      layRateToNok,
    });
  } catch (error) {
    console.error("Failed to calculate lay stake", error);
    return NextResponse.json(
      { error: "Failed to calculate lay stake" },
      { status: 500 }
    );
  }
}
