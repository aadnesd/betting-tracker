import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getRecentDepositsForAccountCached } from "@/lib/db/cached-queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { accountId } = await params;

  try {
    const deposits = await getRecentDepositsForAccountCached(
      accountId,
      userId,
      10
    );

    return NextResponse.json(deposits);
  } catch (error) {
    console.error("Error fetching recent deposits:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
