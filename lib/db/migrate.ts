import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  getMigrationPostgresSource,
  getMigrationPostgresUrl,
} from "./get-connection-string";

config({
  path: ".env.local",
});

const runMigrate = async () => {
  const connectionString = getMigrationPostgresUrl();
  const connectionSource = getMigrationPostgresSource();

  if (!connectionString) {
    throw new Error(
      "POSTGRES_URL_NON_POOLING, POSTGRES_URL, or APP_POSTGRES_URL must be defined"
    );
  }

  const connection = postgres(connectionString, { max: 1 });
  const db = drizzle(connection);
  const { host } = new URL(connectionString);

  console.log(
    `⏳ Running migrations with ${connectionSource ?? "unknown"} on ${host}...`
  );

  const start = Date.now();
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
  const end = Date.now();

  console.log("✅ Migrations completed in", end - start, "ms");
  process.exit(0);
};

runMigrate().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});
