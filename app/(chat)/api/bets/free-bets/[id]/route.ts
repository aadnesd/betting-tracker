import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  getFreeBetById,
  updateFreeBet,
  markFreeBetAsUsed,
  deleteFreeBet,
} from "@/lib/db/queries";

const updateFreeBetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  value: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  minOdds: z.number().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  status: z.enum(["active", "used", "expired"]).optional(),
  usedInMatchedBetId: z.string().uuid().optional().nullable(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const freeBet = await getFreeBetById({ id, userId });

    if (!freeBet) {
      return NextResponse.json({ error: "Free bet not found" }, { status: 404 });
    }

    return NextResponse.json(freeBet);
  } catch (error) {
    console.error("Error getting free bet:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const freeBet = await getFreeBetById({ id, userId });

    if (!freeBet) {
      return NextResponse.json({ error: "Free bet not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateFreeBetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Handle marking as used
    if (parsed.data.status === "used" && parsed.data.usedInMatchedBetId) {
      const updated = await markFreeBetAsUsed({
        id,
        userId,
        matchedBetId: parsed.data.usedInMatchedBetId,
      });
      return NextResponse.json(updated);
    }

    // Regular update
    const updated = await updateFreeBet({
      id,
      userId,
      name: parsed.data.name,
      value: parsed.data.value,
      currency: parsed.data.currency,
      minOdds: parsed.data.minOdds,
      expiresAt: parsed.data.expiresAt !== undefined
        ? parsed.data.expiresAt === null
          ? null
          : new Date(parsed.data.expiresAt)
        : undefined,
      status: parsed.data.status,
      notes: parsed.data.notes,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating free bet:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const result = await deleteFreeBet({ id, userId });

    if (!result) {
      return NextResponse.json({ error: "Free bet not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting free bet:", error);

    if (error instanceof Error && error.message.includes("Cannot delete a used")) {
      return NextResponse.json(
        { error: "Cannot delete a used free bet" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
