/**
 * Backfill script to populate amountNok for existing AccountTransaction rows.
 * Run with: HOME=$PWD/.home pnpm exec tsx scripts/backfill-transaction-nok.ts
 *
 * This is a one-time migration to compute NOK values for historical transactions
 * so that getBalanceTrends() doesn't need to call the FX API on every page load.
 */

import { config } from "dotenv";
import { eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { accountTransaction } from "../lib/db/schema";
import { convertAmountToNok } from "../lib/fx-rates";

config({ path: ".env.local" });

async function backfillTransactionNok() {
  const client = postgres(process.env.POSTGRES_URL!);
  const db = drizzle(client);

  console.log("🔍 Finding transactions without amountNok...");

  // Find all transactions that don't have amountNok set
  const rows = await db
    .select({
      id: accountTransaction.id,
      amount: accountTransaction.amount,
      currency: accountTransaction.currency,
    })
    .from(accountTransaction)
    .where(isNull(accountTransaction.amountNok));

  console.log(`📊 Found ${rows.length} transactions to backfill`);

  if (rows.length === 0) {
    console.log("✅ All transactions already have amountNok - nothing to do!");
    await client.end();
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      const amount = row.amount ? Number.parseFloat(row.amount) : 0;
      const currency = row.currency ?? "NOK";
      const amountNok = await convertAmountToNok(amount, currency);

      await db
        .update(accountTransaction)
        .set({ amountNok: amountNok.toString() })
        .where(eq(accountTransaction.id, row.id));

      successCount++;
      if (successCount % 10 === 0) {
        console.log(`  Processed ${successCount}/${rows.length}...`);
      }
    } catch (error) {
      errorCount++;
      console.error(`  ❌ Failed to backfill transaction ${row.id}:`, error);
    }
  }

  console.log("\n✅ Backfill complete!");
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);

  await client.end();
}

backfillTransactionNok()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
