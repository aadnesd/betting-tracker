import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { createWallet } from "@/lib/db/queries";
import { listWalletsByUserCached } from "@/lib/db/cached-queries";

const createWalletSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["fiat", "crypto", "hybrid"]),
  currency: z.string().min(1, "Currency is required").max(10),
  notes: z.string().nullish(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wallets = await listWalletsByUserCached(session.user.id);
    return NextResponse.json(wallets);
  } catch (error) {
    console.error("Error listing wallets:", error);
    return NextResponse.json(
      { error: "Failed to list wallets" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createWalletSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const wallet = await createWallet({
      userId: session.user.id,
      name: parsed.data.name,
      type: parsed.data.type,
      currency: parsed.data.currency,
      notes: parsed.data.notes ?? null,
    });

    return NextResponse.json(wallet, { status: 201 });
  } catch (error) {
    console.error("Error creating wallet:", error);
    return NextResponse.json(
      { error: "Failed to create wallet" },
      { status: 500 }
    );
  }
}
