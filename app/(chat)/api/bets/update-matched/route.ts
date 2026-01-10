import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createAccountTransaction,
  createAuditEntry,
  getMatchedBetById,
  getMatchedBetWithParts,
  updateMatchedBetRecord,
} from "@/lib/db/queries";

const payloadSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "matched", "settled", "needs_review"]).optional(),
  notes: z.string().optional().nullable(),
  netExposure: z.number().optional().nullable(),
  backBetId: z.string().uuid().optional().nullable(),
  layBetId: z.string().uuid().optional().nullable(),
  promoId: z.string().uuid().optional().nullable(),
  promoType: z.string().optional().nullable(),
  lastError: z.string().optional().nullable(),
  confirmedAt: z.string().optional().nullable(),
});

function safeDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(after)) {
    const beforeVal = before[key];
    const afterVal = after[key];

    // Compare stringified for complex values
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changes[key] = { from: beforeVal, to: afterVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

export async function PATCH(request: Request) {
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
    // Fetch existing record for diff
    const existing = await getMatchedBetById({
      id: body.id,
      userId: session.user.id,
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Matched bet not found" },
        { status: 404 }
      );
    }

    // Prepare update fields (only those provided)
    const updateFields: Parameters<typeof updateMatchedBetRecord>[0] = {
      id: body.id,
      userId: session.user.id,
    };

    // Only include fields that are explicitly provided
    if (body.status !== undefined) {
      updateFields.status = body.status;
    }
    if (body.notes !== undefined) {
      updateFields.notes = body.notes;
    }
    if (body.netExposure !== undefined) {
      updateFields.netExposure = body.netExposure;
    }
    if (body.backBetId !== undefined) {
      updateFields.backBetId = body.backBetId;
    }
    if (body.layBetId !== undefined) {
      updateFields.layBetId = body.layBetId;
    }
    if (body.promoId !== undefined) {
      updateFields.promoId = body.promoId;
    }
    if (body.promoType !== undefined) {
      updateFields.promoType = body.promoType;
    }
    if (body.lastError !== undefined) {
      updateFields.lastError = body.lastError;
    }
    if (body.confirmedAt !== undefined) {
      updateFields.confirmedAt = safeDate(body.confirmedAt);
    }

    const updated = await updateMatchedBetRecord(updateFields);

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update matched bet" },
        { status: 500 }
      );
    }

    // Compute changes for audit log
    const beforeState = {
      status: existing.status,
      notes: existing.notes,
      netExposure: existing.netExposure,
      backBetId: existing.backBetId,
      layBetId: existing.layBetId,
      promoId: existing.promoId,
      promoType: existing.promoType,
      lastError: existing.lastError,
      confirmedAt: existing.confirmedAt,
    };

    const afterState = {
      status: updated.status,
      notes: updated.notes,
      netExposure: updated.netExposure,
      backBetId: updated.backBetId,
      layBetId: updated.layBetId,
      promoId: updated.promoId,
      promoType: updated.promoType,
      lastError: updated.lastError,
      confirmedAt: updated.confirmedAt,
    };

    const changes = computeChanges(beforeState, afterState);

    // Handle settlement: create adjustment transactions for account balances
    const isSettling =
      existing.status !== "settled" && updated.status === "settled";

    if (isSettling) {
      // Fetch the full matched bet with back/lay legs to get profitLoss and accountId
      const fullBet = await getMatchedBetWithParts({
        id: updated.id,
        userId: session.user.id,
      });

      if (fullBet) {
        const transactionPromises: Promise<unknown>[] = [];
        const now = new Date();

        // Create adjustment for back bet account if profitLoss and accountId exist
        if (fullBet.back?.accountId && fullBet.back.profitLoss !== null) {
          const backProfitLoss = Number.parseFloat(fullBet.back.profitLoss);
          if (!Number.isNaN(backProfitLoss)) {
            transactionPromises.push(
              createAccountTransaction({
                userId: session.user.id,
                accountId: fullBet.back.accountId,
                type: "adjustment",
                amount: backProfitLoss,
                currency: fullBet.back.currency ?? "NOK",
                occurredAt: now,
                notes: `Settlement: ${fullBet.matched.market} - ${fullBet.matched.selection}`,
              })
            );
          }
        }

        // Create adjustment for lay bet account if profitLoss and accountId exist
        if (fullBet.lay?.accountId && fullBet.lay.profitLoss !== null) {
          const layProfitLoss = Number.parseFloat(fullBet.lay.profitLoss);
          if (!Number.isNaN(layProfitLoss)) {
            transactionPromises.push(
              createAccountTransaction({
                userId: session.user.id,
                accountId: fullBet.lay.accountId,
                type: "adjustment",
                amount: layProfitLoss,
                currency: fullBet.lay.currency ?? "NOK",
                occurredAt: now,
                notes: `Settlement: ${fullBet.matched.market} - ${fullBet.matched.selection}`,
              })
            );
          }
        }

        // Execute all transaction creations in parallel
        if (transactionPromises.length > 0) {
          await Promise.allSettled(transactionPromises);
        }
      }
    }

    // Determine action type based on what changed
    let action: "update" | "status_change" | "attach_leg" = "update";
    if (changes) {
      if (
        "status" in changes &&
        Object.keys(changes).length === 1
      ) {
        action = "status_change";
      } else if (
        ("backBetId" in changes || "layBetId" in changes) &&
        (existing.backBetId === null || existing.layBetId === null)
      ) {
        action = "attach_leg";
      }
    }

    // Create audit entry
    if (changes) {
      await createAuditEntry({
        userId: session.user.id,
        entityType: "matched_bet",
        entityId: updated.id,
        action,
        changes,
        notes: body.notes ?? null,
      });
    }

    return NextResponse.json({ matched: updated });
  } catch (error) {
    console.error("Failed to update matched bet", error);
    return NextResponse.json(
      { error: "Failed to update matched bet" },
      { status: 500 }
    );
  }
}
