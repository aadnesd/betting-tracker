/**
 * Backfill stakeNok and profitLossNok for existing bets.
 *
 * Uses current FX rates (acceptable for historical data per spec).
 * Run with: HOME=$PWD/.home pnpm exec tsx scripts/backfill-nok-values.ts
 */
import { config } from "dotenv";
import { eq, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { backBet, layBet } from "../lib/db/schema";
import { convertAmountToNok } from "../lib/fx-rates";

config({ path: ".env.local" });

const BATCH_SIZE = 200;

async function backfillTable<T extends typeof backBet | typeof layBet>({
  tableName,
  table,
}: {
  tableName: "BackBet" | "LayBet";
  table: T;
}) {
  const client = postgres(process.env.POSTGRES_URL!);
  const db = drizzle(client);

  let updated = 0;

  try {
    while (true) {
      const rows = await db
        .select({
          id: table.id,
          stake: table.stake,
          stakeNok: table.stakeNok,
          profitLoss: table.profitLoss,
          profitLossNok: table.profitLossNok,
          currency: table.currency,
        })
        .from(table)
        .where(or(isNull(table.stakeNok), isNull(table.profitLossNok)))
        .limit(BATCH_SIZE);

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const currency = row.currency ?? "NOK";
        const stakeValue = Number.parseFloat(row.stake);
        const stakeNok = await convertAmountToNok(stakeValue, currency);

        const profitLossValue = row.profitLoss
          ? Number.parseFloat(row.profitLoss)
          : null;
        const profitLossNok =
          profitLossValue === null
            ? null
            : await convertAmountToNok(profitLossValue, currency);

        await db
          .update(table)
          .set({
            stakeNok: stakeNok.toFixed(2),
            profitLossNok:
              profitLossNok === null ? null : profitLossNok.toFixed(2),
            // biome-ignore lint/suspicious/noExplicitAny: Generic table type requires type assertion
          } as any)
          .where(eq(table.id, row.id));

        updated += 1;
      }
    }
  } finally {
    await client.end();
  }

  console.log(`[Backfill] ${tableName}: updated ${updated} rows`);
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not configured");
  }

  await backfillTable({ tableName: "BackBet", table: backBet });
  await backfillTable({ tableName: "LayBet", table: layBet });
}

main().catch((error) => {
  console.error("[Backfill] Failed to backfill NOK values:", error);
  process.exit(1);
});
