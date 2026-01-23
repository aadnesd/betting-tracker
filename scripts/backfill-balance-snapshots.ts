/**
 * Backfill balance snapshots with simulated historical data.
 * 
 * Creates snapshots from 01.01.2026 to now with a gradual increase
 * from 113,000 NOK to the current total capital.
 * 
 * Run with: npx tsx scripts/backfill-balance-snapshots.ts
 */

import postgres from "postgres";
import "dotenv/config";

async function main() {
  const client = postgres(process.env.POSTGRES_URL!);

  // Get the user by email (use actual user, not test user)
  const [user] = await client`SELECT id, email FROM "User" WHERE email = 'aadne.s.djuve@gmail.com' LIMIT 1`;
  if (!user) {
    console.error("User not found!");
    await client.end();
    return;
  }
  const userId = user.id;
  console.log(`Backfilling for user: ${userId} (${user.email})`);

  // Configuration
  const startDate = new Date("2026-01-01T08:00:00Z");
  const endDate = new Date("2026-01-23T22:00:00Z"); // Today at 22:00
  const startValue = 113000;
  const endValue = 119449; // Current total capital

  // Calculate number of snapshots (twice daily)
  const msPerDay = 24 * 60 * 60 * 1000;
  const totalDays = (endDate.getTime() - startDate.getTime()) / msPerDay;
  const snapshotsPerDay = 2; // 08:00 and 20:00
  const totalSnapshots = Math.ceil(totalDays * snapshotsPerDay);

  console.log(`Creating ${totalSnapshots} snapshots from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log(`Value range: ${startValue} NOK → ${endValue} NOK`);

  // Clear existing snapshots for this user (for idempotent reruns)
  await client`DELETE FROM "BalanceSnapshot" WHERE "userId" = ${userId}`;
  console.log("Cleared existing snapshots");

  // Generate snapshots with some randomness for realistic look
  const valueRange = endValue - startValue;
  const snapshots: Array<{
    createdAt: Date;
    userId: string;
    totalCapitalNok: string;
    accountsNok: string | null;
    walletsNok: string | null;
  }> = [];

  let currentDate = new Date(startDate);
  let i = 0;

  while (currentDate <= endDate) {
    // Progress from 0 to 1 with some noise
    const baseProgress = i / totalSnapshots;
    // Add some random daily fluctuation (±500 NOK)
    const noise = (Math.random() - 0.5) * 1000;
    // Ensure general upward trend with occasional dips
    const trendMultiplier = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
    
    const rawValue = startValue + (valueRange * baseProgress * trendMultiplier) + noise;
    // Clamp to reasonable bounds, ensuring end value matches
    const totalCapitalNok = Math.max(
      startValue - 2000,
      Math.min(endValue + 2000, rawValue)
    );

    // Split roughly 90% accounts, 10% wallets
    const accountsNok = totalCapitalNok * (0.88 + Math.random() * 0.04);
    const walletsNok = totalCapitalNok - accountsNok;

    snapshots.push({
      createdAt: new Date(currentDate),
      userId,
      totalCapitalNok: totalCapitalNok.toFixed(2),
      accountsNok: accountsNok.toFixed(2),
      walletsNok: walletsNok.toFixed(2),
    });

    // Move to next snapshot time (08:00 or 20:00)
    const hours = currentDate.getUTCHours();
    if (hours < 20) {
      currentDate.setUTCHours(20, 0, 0, 0);
    } else {
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      currentDate.setUTCHours(8, 0, 0, 0);
    }
    i++;
  }

  // Ensure the last snapshot matches the exact current value
  if (snapshots.length > 0) {
    const last = snapshots[snapshots.length - 1];
    last.totalCapitalNok = endValue.toFixed(2);
    last.accountsNok = (endValue * 0.9).toFixed(2);
    last.walletsNok = (endValue * 0.1).toFixed(2);
  }

  // Insert all snapshots
  console.log(`Inserting ${snapshots.length} snapshots...`);
  
  for (const snapshot of snapshots) {
    await client`
      INSERT INTO "BalanceSnapshot" (id, "createdAt", "userId", "totalCapitalNok", "accountsNok", "walletsNok")
      VALUES (gen_random_uuid(), ${snapshot.createdAt}, ${snapshot.userId}, ${snapshot.totalCapitalNok}, ${snapshot.accountsNok}, ${snapshot.walletsNok})
    `;
  }

  console.log("Done! Sample snapshots:");
  const samples = await client`
    SELECT "createdAt", "totalCapitalNok" 
    FROM "BalanceSnapshot" 
    WHERE "userId" = ${userId}
    ORDER BY "createdAt"
    LIMIT 5
  `;
  for (const s of samples) {
    console.log(`  ${s.createdAt}: ${s.totalCapitalNok} NOK`);
  }
  console.log("  ...");
  const lastSamples = await client`
    SELECT "createdAt", "totalCapitalNok" 
    FROM "BalanceSnapshot" 
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" DESC
    LIMIT 3
  `;
  for (const s of lastSamples.reverse()) {
    console.log(`  ${s.createdAt}: ${s.totalCapitalNok} NOK`);
  }

  await client.end();
}

main().catch(console.error);
