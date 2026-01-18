import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  generateMatchedBetsCsv,
  type ExportableMatchedBet,
} from "@/lib/csv";
import { getSettledMatchedBetsForReporting } from "@/lib/db/queries";
import { createXlsxBuffer } from "@/lib/xlsx";

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
      // Build XLSX rows: first the headers, then the data
      const headers = [
        "matchedSetId",
        "market",
        "selection",
        "promoType",
        "status",
        "backExchange",
        "backOdds",
        "backStake",
        "backCurrency",
        "backProfitLoss",
        "layExchange",
        "layOdds",
        "layStake",
        "layCurrency",
        "layProfitLoss",
        "netExposure",
        "netProfit",
        "settledAt",
      ];

      const dataRows = exportableBets.map((bet) => {
        const backPL = Number.parseFloat(bet.backBet?.profitLoss ?? "0");
        const layPL = Number.parseFloat(bet.layBet?.profitLoss ?? "0");
        const netProfit = backPL + layPL;

        return [
          bet.id,
          bet.market,
          bet.selection,
          bet.promoType ?? "",
          bet.status,
          bet.backBet?.exchange ?? "",
          bet.backBet?.odds ? Number.parseFloat(bet.backBet.odds) : null,
          bet.backBet?.stake ? Number.parseFloat(bet.backBet.stake) : null,
          bet.backBet?.currency ?? "",
          bet.backBet?.profitLoss
            ? Number.parseFloat(bet.backBet.profitLoss)
            : null,
          bet.layBet?.exchange ?? "",
          bet.layBet?.odds ? Number.parseFloat(bet.layBet.odds) : null,
          bet.layBet?.stake ? Number.parseFloat(bet.layBet.stake) : null,
          bet.layBet?.currency ?? "",
          bet.layBet?.profitLoss
            ? Number.parseFloat(bet.layBet.profitLoss)
            : null,
          bet.netExposure ? Number.parseFloat(bet.netExposure) : null,
          Number.isNaN(netProfit) ? null : netProfit,
          bet.settledAt?.toISOString() ?? "",
        ];
      });

      const xlsxBuffer = createXlsxBuffer({
        name: "Matched Bets",
        rows: [headers, ...dataRows],
      });

      return new NextResponse(xlsxBuffer, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="matched-bets-export-${new Date().toISOString().split("T")[0]}.xlsx"`,
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
