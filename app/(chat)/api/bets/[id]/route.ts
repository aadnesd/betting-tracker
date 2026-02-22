import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { revalidateDashboard } from "@/lib/cache";
import { deleteMatchedBet, getMatchedBetWithParts } from "@/lib/db/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const deleteQuerySchema = z.object({
  cascade: z.boolean().optional().default(false),
});

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const matchedBet = await getMatchedBetWithParts({
      id,
      userId: session.user.id,
    });

    if (!matchedBet) {
      return NextResponse.json(
        { error: "Matched bet not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ matchedBet });
  } catch (error) {
    console.error("Failed to fetch matched bet:", error);
    return NextResponse.json(
      { error: "Failed to fetch matched bet" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Parse cascade option from query params
  const { searchParams } = new URL(request.url);
  const cascadeParam = searchParams.get("cascade");
  const cascade = cascadeParam === "true";

  try {
    const result = await deleteMatchedBet({
      id,
      userId: session.user.id,
      cascade,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Matched bet not found" },
        { status: 404 }
      );
    }

    revalidateDashboard(session.user.id);

    return NextResponse.json({ success: true, cascade: result.cascade });
  } catch (error: unknown) {
    console.error("Error deleting matched bet:", error);

    return NextResponse.json(
      { error: "Failed to delete matched bet" },
      { status: 500 }
    );
  }
}
