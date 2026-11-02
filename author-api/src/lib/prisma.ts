
import dotenv from "dotenv";
import path from "node:path";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

// Load local .env, root workspace .env, or Render secret file if used
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: "/etc/secrets/.env" });

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URI;

if (!connectionString) {
  const envKeys = Object.keys(process.env).filter(
    (k) => !k.startsWith("npm_") && !k.startsWith("NODE_")
  );
  console.error("DEBUG: Available environment variables in process.env:", envKeys);
  throw new Error("DATABASE_URL is missing. Please add DATABASE_URL in Render Dashboard -> Environment");
}

// Parse connection_limit from URL or DB_POOL_MAX env var (defaulting to 10)
// to prevent pool exhaustion under concurrent author traffic.
let connectionLimit = 10;
try {
  const parsed = new URL(connectionString);
  const param = parsed.searchParams.get("connection_limit");
  if (param && Number.isInteger(Number(param))) {
    connectionLimit = Number(param);
  }
} catch {
  // If parsing fails, keep default
}

if (process.env.DB_POOL_MAX && Number.isInteger(Number(process.env.DB_POOL_MAX))) {
  connectionLimit = Number(process.env.DB_POOL_MAX);
}

const pool = new pg.Pool({
  connectionString,
  max: connectionLimit,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
