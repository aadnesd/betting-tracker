import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createAccount,
  createAuditEntry,
  getAccountById,
  listAccountsByUser,
  updateAccount,
} from "@/lib/db/queries";

const createAccountSchema = z.object({
  name: z.string().min(1, "Account name is required").max(100),
  kind: z.enum(["bookmaker", "exchange"]),
  currency: z.string().length(3).nullable().optional(),
  commission: z.number().min(0).max(1).nullable().optional(),
  limits: z.record(z.unknown()).nullable().optional(),
});

const updateAccountSchema = z.object({
  id: z.string().uuid("Invalid account ID"),
  name: z.string().min(1).max(100).optional(),
  kind: z.enum(["bookmaker", "exchange"]).optional(),
  currency: z.string().length(3).nullable().optional(),
  commission: z.number().min(0).max(1).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
  limits: z.record(z.unknown()).nullable().optional(),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof createAccountSchema>;
  try {
    const json = await request.json();
    body = createAccountSchema.parse(json);
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
    const newAccount = await createAccount({
      userId: session.user.id,
      name: body.name,
      kind: body.kind,
      currency: body.currency ?? null,
      commission: body.commission ?? null,
      limits: body.limits ?? null,
    });

    // Create audit entry
    await createAuditEntry({
      userId: session.user.id,
      entityType: "account",
      entityId: newAccount.id,
      action: "create",
      changes: {
        name: body.name,
        kind: body.kind,
        currency: body.currency ?? null,
        commission: body.commission ?? null,
      },
      notes: `Created ${body.kind} account: ${body.name}`,
    });

    return NextResponse.json({
      success: true,
      account: newAccount,
    });
  } catch (error) {
    console.error("Failed to create account", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof updateAccountSchema>;
  try {
    const json = await request.json();
    body = updateAccountSchema.parse(json);
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
    // Get original for audit trail
    const original = await getAccountById({
      id: body.id,
      userId: session.user.id,
    });

    if (!original) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const updated = await updateAccount({
      id: body.id,
      userId: session.user.id,
      name: body.name,
      kind: body.kind,
      currency: body.currency,
      commission: body.commission,
      status: body.status,
      limits: body.limits,
    });

    if (!updated) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Build changes object for audit
    const changes: Record<string, unknown> = {};
    if (body.name !== undefined && body.name !== original.name) {
      changes.name = { from: original.name, to: body.name };
    }
    if (body.kind !== undefined && body.kind !== original.kind) {
      changes.kind = { from: original.kind, to: body.kind };
    }
    if (body.currency !== undefined && body.currency !== original.currency) {
      changes.currency = { from: original.currency, to: body.currency };
    }
    if (body.commission !== undefined) {
      const originalCommission = original.commission
        ? Number.parseFloat(original.commission)
        : null;
      if (body.commission !== originalCommission) {
        changes.commission = { from: originalCommission, to: body.commission };
      }
    }
    if (body.status !== undefined && body.status !== original.status) {
      changes.status = { from: original.status, to: body.status };
    }

    if (Object.keys(changes).length > 0) {
      await createAuditEntry({
        userId: session.user.id,
        entityType: "account",
        entityId: body.id,
        action: "update",
        changes,
        notes: `Updated account: ${updated.name}`,
      });
    }

    return NextResponse.json({
      success: true,
      account: updated,
    });
  } catch (error) {
    console.error("Failed to update account", error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  try {
    if (!id) {
      const limit = Math.min(
        Math.max(Number(searchParams.get("limit")) || 200, 1),
        500
      );
      const accounts = await listAccountsByUser({
        userId: session.user.id,
        limit,
      });

      return NextResponse.json(accounts);
    }

    const account = await getAccountById({
      id,
      userId: session.user.id,
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ account });
  } catch (error) {
    console.error("Failed to fetch account", error);
    return NextResponse.json(
      { error: "Failed to fetch account" },
      { status: 500 }
    );
  }
}
