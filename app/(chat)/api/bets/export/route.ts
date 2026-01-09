import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  generateMatchedBetsCsv,
  type ExportableMatchedBet,
} from "@/lib/csv";
import { getSettledMatchedBetsForReporting } from "@/lib/db/queries";

/**
 * GET /api/bets/export
 *
 * Export matched bets as CSV.
 *
 * Query params:
 * - format: "csv" (default) | "xlsx"
 * - status: "settled" (default) | "all"
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 *
 * Response:
 * - CSV file download with matched sets data
 */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    const startDate = startDateParam ? new Date(startDateParam) : null;
    const endDate = endDateParam ? new Date(endDateParam) : null;

    // Currently only supports settled bets for export (per spec)
    const settledBets = await getSettledMatchedBetsForReporting({
      userId: session.user.id,
      startDate,
      endDate,
    });

    // Transform to exportable format
    const exportableBets: ExportableMatchedBet[] = settledBets.map((row) => ({
      id: row.matched.id,
      market: row.matched.market,
      selection: row.matched.selection,
      promoType: row.matched.promoType,
      status: row.matched.status,
      netExposure: row.matched.netExposure,
      settledAt: row.back?.settledAt ?? row.lay?.settledAt ?? null,
      backBet: row.back
        ? {
            exchange: row.back.exchange,
            odds: row.back.odds,
            stake: row.back.stake,
            currency: row.back.currency,
            profitLoss: row.back.profitLoss,
          }
        : null,
      layBet: row.lay
        ? {
            exchange: row.lay.exchange,
            odds: row.lay.odds,
            stake: row.lay.stake,
            currency: row.lay.currency,
            profitLoss: row.lay.profitLoss,
          }
        : null,
    }));

    if (format === "xlsx") {
      // For XLSX, we'd need a library like xlsx or exceljs
      // For now, return CSV with xlsx extension hint
      // This can be extended later with proper XLSX generation
      const csvContent = generateMatchedBetsCsv(exportableBets);

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="matched-bets-export-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    // Default: CSV export
    const csvContent = generateMatchedBetsCsv(exportableBets);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="matched-bets-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to generate export" },
      { status: 500 }
    );
  }
}
