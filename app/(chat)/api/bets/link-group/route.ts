import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { revalidateDashboard } from "@/lib/cache";
import {
  createAuditEntry,
  linkMatchedBetsIntoGroup,
  listMatchedBetsByUser,
  unlinkMatchedBetFromGroup,
} from "@/lib/db/queries";

const linkSchema = z.object({
  action: z.literal("link"),
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

const unlinkSchema = z.object({
  action: z.literal("unlink"),
  id: z.string().uuid(),
});

const payloadSchema = z.discriminatedUnion("action", [
  linkSchema,
  unlinkSchema,
]);

/**
 * GET: return the user's recent matched sets for use in a link picker.
 * Pass ?excludeId=<id> to drop the current set from the candidate list.
 */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const excludeId = searchParams.get("excludeId");

  const bets = await listMatchedBetsByUser({ userId: session.user.id });
  const candidates = bets
    .filter((bet) => bet.id !== excludeId)
    .map((bet) => ({
      id: bet.id,
      market: bet.market,
      selection: bet.selection,
      status: bet.status,
      promoType: bet.promoType,
      netExposure: bet.netExposure,
    }));

  return NextResponse.json({ candidates });
}

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
    if (body.action === "link") {
      const groupId = await linkMatchedBetsIntoGroup({
        userId: session.user.id,
        sourceId: body.sourceId,
        targetId: body.targetId,
      });

      await createAuditEntry({
        userId: session.user.id,
        entityType: "matched_bet",
        entityId: body.sourceId,
        action: "update",
        changes: { betGroupId: groupId, linkedWith: body.targetId },
        notes: `Linked to matched set ${body.targetId} (group ${groupId})`,
      });

      revalidateDashboard(session.user.id);
      return NextResponse.json({ success: true, groupId });
    }

    await unlinkMatchedBetFromGroup({
      userId: session.user.id,
      id: body.id,
    });

    await createAuditEntry({
      userId: session.user.id,
      entityType: "matched_bet",
      entityId: body.id,
      action: "update",
      changes: { betGroupId: null },
      notes: "Removed from bet group",
    });

    revalidateDashboard(session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update bet group";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
