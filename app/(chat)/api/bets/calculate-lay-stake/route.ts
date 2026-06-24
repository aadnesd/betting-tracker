import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { calculateOptimalLayStake } from "@/lib/bet-calculations";
import { getAccountByName } from "@/lib/db/queries";
import { convertAmountToNok } from "@/lib/fx-rates";
import { isFreeBetPromoType } from "@/lib/settlement";

const calculateLayStakeSchema = z.object({
  backOdds: z.number().gt(1),
  backStake: z.number().positive(),
  backCurrency: z.string().length(3).default("NOK"),
  layOdds: z.number().gt(1),
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

    const [backRateToNok, layRateToNok] = await Promise.all([
      convertAmountToNok(1, body.backCurrency),
      convertAmountToNok(1, body.layCurrency),
    ]);

    const calculated = calculateOptimalLayStake({
      backStake: body.backStake,
      backOdds: body.backOdds,
      layOdds: body.layOdds,
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

    return NextResponse.json({
      layStake,
      layLiability: roundStake(layStake * (body.layOdds - 1)),
      balancedLayStake: roundStake(calculated.balancedLayStake),
      profitIfBackWins: roundStake(calculated.profitIfBackWins),
      profitIfLayWins: roundStake(calculated.profitIfLayWins),
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
