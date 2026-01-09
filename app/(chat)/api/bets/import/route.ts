import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { parseBetsCsv, parseBalancesCsv, type CsvRowError } from "@/lib/csv";
import {
  createBetForImport,
  createScreenshotForImport,
  createTransactionForImport,
  findOrCreateAccount,
} from "@/lib/db/queries";

/**
 * POST /api/bets/import
 *
 * Import bets or balances from CSV file.
 *
 * Request body:
 * - type: "bets" | "balances"
 * - csv: string (CSV file content)
 *
 * Response:
 * - success: boolean
 * - imported: number (successfully imported rows)
 * - errors: CsvRowError[] (row-level errors)
 * - totalRows: number
 */

const ImportRequestSchema = z.object({
  type: z.enum(["bets", "balances"]),
  csv: z.string().min(1, "CSV content is required"),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = ImportRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { type, csv } = validation.data;
    const userId = session.user.id;

    if (type === "bets") {
      return await importBets(userId, csv);
    }
    return await importBalances(userId, csv);
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to process import" },
      { status: 500 }
    );
  }
}

/**
 * Import bets from CSV.
 * Creates a placeholder screenshot for each bet (required by schema).
 * Sets bet status to "placed".
 */
async function importBets(userId: string, csvContent: string) {
  const parseResult = parseBetsCsv(csvContent);

  if (parseResult.totalCount === 0) {
    return NextResponse.json(
      { error: "No data rows found in CSV" },
      { status: 400 }
    );
  }

  const allErrors: CsvRowError[] = [...parseResult.errors];
  let importedCount = 0;

  // Process each successfully parsed bet
  for (let i = 0; i < parseResult.data.length; i++) {
    const bet = parseResult.data[i];

    try {
      // Create a placeholder screenshot for this imported bet
      // (required by schema, marked as "parsed" since data came from CSV)
      const screenshot = await createScreenshotForImport({
        userId,
        kind: bet.kind,
        parsedData: {
          source: "csv_import",
          market: bet.market,
          selection: bet.selection,
          odds: bet.odds,
          stake: bet.stake,
          exchange: bet.exchange,
          currency: bet.currency,
        },
      });

      // Create the bet with audit entry
      await createBetForImport({
        userId,
        kind: bet.kind,
        screenshotId: screenshot.id,
        market: bet.market,
        selection: bet.selection,
        odds: String(bet.odds),
        stake: String(bet.stake),
        exchange: bet.exchange,
        currency: bet.currency,
        placedAt: bet.placedAt,
        notes: bet.notes,
      });

      importedCount++;
    } catch (error) {
      console.error(`Error importing bet at row ${i + 2}:`, error);
      allErrors.push({
        row: i + 2,
        field: "database",
        message:
          error instanceof Error ? error.message : "Failed to save to database",
      });
    }
  }

  return NextResponse.json({
    success: allErrors.length === 0,
    imported: importedCount,
    errors: allErrors,
    totalRows: parseResult.totalCount,
  });
}

/**
 * Import balances/transactions from CSV.
 * Creates accounts if they don't exist.
 */
async function importBalances(userId: string, csvContent: string) {
  const parseResult = parseBalancesCsv(csvContent);

  if (parseResult.totalCount === 0) {
    return NextResponse.json(
      { error: "No data rows found in CSV" },
      { status: 400 }
    );
  }

  const allErrors: CsvRowError[] = [...parseResult.errors];
  let importedCount = 0;

  // Cache for accounts to avoid repeated lookups
  const accountCache = new Map<string, string>();

  for (let i = 0; i < parseResult.data.length; i++) {
    const balance = parseResult.data[i];

    try {
      const accountName = balance.account.trim();
      const accountNameNormalized = accountName.toLowerCase();

      // Find or create account (with caching)
      let accountId = accountCache.get(accountNameNormalized);

      if (!accountId) {
        const accountRecord = await findOrCreateAccount({
          userId,
          name: accountName,
          currency: balance.currency,
        });
        accountId = accountRecord.id;
        accountCache.set(accountNameNormalized, accountId);
      }

      // Create transaction
      await createTransactionForImport({
        userId,
        accountId,
        type: balance.type,
        amount: String(balance.amount),
        currency: balance.currency,
        occurredAt: balance.date,
        notes: balance.notes,
      });

      importedCount++;
    } catch (error) {
      console.error(`Error importing balance at row ${i + 2}:`, error);
      allErrors.push({
        row: i + 2,
        field: "database",
        message:
          error instanceof Error ? error.message : "Failed to save to database",
      });
    }
  }

  return NextResponse.json({
    success: allErrors.length === 0,
    imported: importedCount,
    errors: allErrors,
    totalRows: parseResult.totalCount,
  });
}
