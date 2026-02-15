import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { deleteAccountTransaction, getAccountById } from "@/lib/db/queries";

interface RouteParams {
  params: Promise<{ id: string; txId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: accountId, txId } = await params;

  try {
    // Verify account exists and belongs to user
    const account = await getAccountById({
      id: accountId,
      userId: session.user.id,
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const result = await deleteAccountTransaction({
      id: txId,
      userId: session.user.id,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
