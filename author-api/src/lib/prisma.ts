
import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing from .env");
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
