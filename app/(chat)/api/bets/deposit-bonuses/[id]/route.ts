import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  getDepositBonusById,
  updateDepositBonus,
  deleteDepositBonus,
  forfeitDepositBonus,
  listBonusQualifyingBets,
} from "@/lib/db/queries";

const updateDepositBonusSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  status: z.enum(["active", "cleared", "forfeited", "expired"]).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const bonus = await getDepositBonusById({ id, userId });

    if (!bonus) {
      return NextResponse.json(
        { error: "Deposit bonus not found" },
        { status: 404 }
      );
    }

    // Also fetch qualifying bets for the detail view
    const qualifyingBets = await listBonusQualifyingBets({
      depositBonusId: id,
    });

    return NextResponse.json({
      ...bonus,
      qualifyingBets,
    });
  } catch (error) {
    console.error("Error fetching deposit bonus:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = updateDepositBonusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check bonus exists
    const existing = await getDepositBonusById({ id, userId });
    if (!existing) {
      return NextResponse.json(
        { error: "Deposit bonus not found" },
        { status: 404 }
      );
    }

    const updated = await updateDepositBonus({
      id,
      userId,
      name: parsed.data.name,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : parsed.data.expiresAt === null ? null : undefined,
      notes: parsed.data.notes,
      status: parsed.data.status as "active" | "cleared" | "forfeited" | "expired" | undefined,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating deposit bonus:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    // Check bonus exists
    const existing = await getDepositBonusById({ id, userId });
    if (!existing) {
      return NextResponse.json(
        { error: "Deposit bonus not found" },
        { status: 404 }
      );
    }

    await deleteDepositBonus({ id, userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting deposit bonus:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST for special actions like forfeit
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const body = await request.json();
    const action = body.action;

    if (action === "forfeit") {
      const reason = body.reason || "User forfeited bonus";
      const result = await forfeitDepositBonus({ id, userId, reason });
      
      if (!result) {
        return NextResponse.json(
          { error: "Deposit bonus not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error processing deposit bonus action:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
