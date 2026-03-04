import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { revalidateDashboard } from "@/lib/cache";
import {
  deleteBet,
  deleteMatchedBet,
  getMatchedBetByLegId,
} from "@/lib/db/queries";

const deleteSchema = z.object({
  betId: z.string().uuid(),
  betKind: z.enum(["back", "lay"]),
  cascade: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof deleteSchema>;
  try {
    payload = deleteSchema.parse(await request.json());
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
    if (payload.cascade) {
      const matchedBet = await getMatchedBetByLegId({
        betId: payload.betId,
        kind: payload.betKind,
        userId: session.user.id,
      });

      if (matchedBet) {
        await deleteMatchedBet({
          id: matchedBet.id,
          userId: session.user.id,
          cascade: true,
        });

        revalidateDashboard(session.user.id);

        return NextResponse.json({
          success: true,
          cascade: true,
          matchedBetId: matchedBet.id,
        });
      }
    }

    const result = await deleteBet({
      id: payload.betId,
      kind: payload.betKind,
      userId: session.user.id,
    });

    if (!result) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    revalidateDashboard(session.user.id);

    return NextResponse.json({ success: true, cascade: false });
  } catch (error) {
    console.error("Failed to delete bet", error);
    return NextResponse.json(
      { error: "Failed to delete bet" },
      { status: 500 }
    );
  }
}
