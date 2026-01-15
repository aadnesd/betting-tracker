import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getAccountById, deleteAccount } from "@/lib/db/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const account = await getAccountById({
      id,
      userId: session.user.id,
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ account });
  } catch (error) {
    console.error("Failed to fetch account:", error);
    return NextResponse.json(
      { error: "Failed to fetch account" },
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

  try {
    const result = await deleteAccount({
      id,
      userId: session.user.id,
    });

    if (!result) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting account:", error);

    // Handle specific errors for accounts with linked data
    if (error instanceof Error) {
      if (error.message.includes("linked bets")) {
        return NextResponse.json(
          { error: "Cannot delete account with linked bets. Archive it instead." },
          { status: 400 }
        );
      }
      if (error.message.includes("transactions")) {
        return NextResponse.json(
          { error: "Cannot delete account with transactions. Archive it instead." },
          { status: 400 }
        );
      }
      if (error.message.includes("linked free bets")) {
        return NextResponse.json(
          { error: "Cannot delete account with linked free bets. Archive it instead." },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
