/**
 * Cleanup script to remove all guest users and their related data from the database.
 * Run with: HOME=$PWD/.home pnpm exec tsx scripts/cleanup-guests.ts
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not configured");
  }

  const sql = postgres(process.env.POSTGRES_URL);

  try {
    // Find all guest users (email starting with "guest-")
    const guestUsers = await sql`
      SELECT id, email FROM "User" WHERE email LIKE 'guest-%'
    `;

    console.log(`Found ${guestUsers.length} guest users to delete`);

    if (guestUsers.length === 0) {
      console.log("No guest users found. Database is clean.");
      return;
    }

    console.log(`\nDeleting related data for ${guestUsers.length} guest users...`);

    // Delete in order of dependencies (children first)
    // Using raw SQL with subqueries to handle tables without direct userId

    // 1. Audit logs
    await sql`
      DELETE FROM "AuditLog" WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Deleted audit logs");

    // 2. Qualifying bets (links via freeBetId → FreeBet.userId or matchedBetId → MatchedBet.userId)
    await sql`
      DELETE FROM "QualifyingBet" WHERE "freeBetId" IN (
        SELECT id FROM "FreeBet" WHERE "userId" IN (
          SELECT id FROM "User" WHERE email LIKE 'guest-%'
        )
      )
    `;
    console.log("  ✓ Deleted qualifying bets");

    // 3. Clear usedInMatchedBetId references in FreeBet before deleting matched bets
    await sql`
      UPDATE "FreeBet" SET "usedInMatchedBetId" = NULL 
      WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Cleared free bet matched bet references");

    // 4. Delete matched bets (before back/lay bets due to FK references)
    await sql`
      DELETE FROM "MatchedBet" WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Deleted matched bets");

    // 5. Delete back bets
    await sql`
      DELETE FROM "BackBet" WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Deleted back bets");

    // 6. Delete lay bets
    await sql`
      DELETE FROM "LayBet" WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Deleted lay bets");

    // 7. Delete free bets (after matching bets and qualifying bets)
    await sql`
      DELETE FROM "FreeBet" WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Deleted free bets");

    // 8. Delete account transactions
    await sql`
      DELETE FROM "AccountTransaction" WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Deleted account transactions");

    // 9. Delete promos
    await sql`
      DELETE FROM "Promo" WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Deleted promos");

    // 10. Screenshot uploads
    await sql`
      DELETE FROM "ScreenshotUpload" WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Deleted screenshot uploads");

    // 11. Accounts
    await sql`
      DELETE FROM "Account" WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Deleted accounts");

    // 12. User settings
    await sql`
      DELETE FROM "UserSettings" WHERE "userId" IN (
        SELECT id FROM "User" WHERE email LIKE 'guest-%'
      )
    `;
    console.log("  ✓ Deleted user settings");

    // 13. Finally, delete the guest users themselves
    await sql`DELETE FROM "User" WHERE email LIKE 'guest-%'`;
    console.log("  ✓ Deleted guest users");

    console.log(
      `\n✅ Successfully deleted ${guestUsers.length} guest users and all their data.`
    );
    console.log(
      "Note: Users will need to log in with OAuth (Google/GitHub) to continue."
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Failed to cleanup guests:", error);
  process.exit(1);
});
