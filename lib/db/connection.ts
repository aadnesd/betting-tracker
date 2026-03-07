import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getPostgresUrl } from "./get-connection-string";

const connectionString = getPostgresUrl();

if (!connectionString) {
  throw new Error("POSTGRES_URL or APP_POSTGRES_URL must be defined");
}

export const client = postgres(connectionString);
export const db = drizzle(client);
