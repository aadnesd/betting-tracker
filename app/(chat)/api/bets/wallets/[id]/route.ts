import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  archiveWallet,
  deleteWallet,
  getWalletById,
  updateWallet,
} from "@/lib/db/queries";

const updateWalletSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["fiat", "crypto", "hybrid"]).optional(),
  currency: z.string().min(1).max(10).optional(),
  notes: z.string().nullish(),
  status: z.enum(["active", "archived"]).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const wallet = await getWalletById(id);

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    if (wallet.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(wallet);
  } catch (error) {
    console.error("Error getting wallet:", error);
    return NextResponse.json(
      { error: "Failed to get wallet" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const wallet = await getWalletById(id);

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    if (wallet.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateWalletSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const updated = await updateWallet(id, parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating wallet:", error);
    return NextResponse.json(
      { error: "Failed to update wallet" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const wallet = await getWalletById(id);

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    if (wallet.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check URL param for hard delete vs archive
    const url = new URL(request.url);
    const hardDelete = url.searchParams.get("hard") === "true";

    if (hardDelete) {
      await deleteWallet(id);
    } else {
      await archiveWallet(id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting wallet:", error);
    return NextResponse.json(
      { error: "Failed to delete wallet" },
      { status: 500 }
    );
  }
}
