import { NextResponse } from "next/server";
import {
  getAllUserIds,
  getBankrollSummary,
  getWalletTotals,
  createBalanceSnapshot,
} from "@/lib/db/queries";

/**
 * Balance snapshot cron endpoint.
 *
 * Captures the current total capital (accounts + wallets in NOK) for all users.
 * Stores snapshots in BalanceSnapshot table for historical tracking and charts.
 *
 * Protected by CRON_SECRET header (Vercel cron authentication).
 *
 * Schedule: Runs twice daily (08:00 and 20:00 UTC via vercel.json)
 */

interface SnapshotResult {
  processed: number;
  succeeded: number;
  failed: number;
  details: Array<{
    userId: string;
    status: "success" | "error";
    totalCapitalNok?: number;
    error?: string;
  }>;
}

export async function POST(request: Request) {
  // Validate CRON_SECRET for Vercel cron authentication
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[Balance-Snapshot] Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Balance-Snapshot] Starting balance snapshot run...");

  const result: SnapshotResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    details: [],
  };

  try {
    // Get all user IDs
    const userIds = await getAllUserIds();
    console.log(`[Balance-Snapshot] Found ${userIds.length} users`);

    for (const userId of userIds) {
      result.processed++;

      try {
        // Get current bankroll summary (accounts)
        const bankroll = await getBankrollSummary({ userId });
        const accountsNok = bankroll.totalCapital;

        // Get wallet totals
        const wallets = await getWalletTotals(userId);
        const walletsNok = wallets.totalBalanceNok;

        // Total capital = accounts + wallets
        const totalCapitalNok = accountsNok + walletsNok;

        // Create snapshot
        await createBalanceSnapshot({
          userId,
          totalCapitalNok,
          accountsNok,
          walletsNok,
        });

        result.succeeded++;
        result.details.push({
          userId,
          status: "success",
          totalCapitalNok,
        });

        console.log(
          `[Balance-Snapshot] User ${userId.slice(0, 8)}...: ${totalCapitalNok.toFixed(2)} NOK`
        );
      } catch (error) {
        result.failed++;
        result.details.push({
          userId,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        console.error(
          `[Balance-Snapshot] Error for user ${userId}:`,
          error
        );
      }
    }

    console.log(
      `[Balance-Snapshot] Complete. Processed: ${result.processed}, Succeeded: ${result.succeeded}, Failed: ${result.failed}`
    );

    return NextResponse.json({
      success: true,
      message: "Balance snapshot completed",
      results: result,
    });
  } catch (error) {
    console.error("[Balance-Snapshot] Fatal error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Balance snapshot failed",
        error: error instanceof Error ? error.message : "Unknown error",
        results: result,
      },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing (still requires auth)
export async function GET(request: Request) {
  return POST(request);
}
