import { PrismaClient } from "@prisma/client";

/**
 * How many database connections this process may open at once. With 1, every query waits for the
 * previous one, so a page that runs 15 small queries in parallel makes 15 trips to Supabase one
 * after another (seconds when the database is far away). Supabase's pooler (port 6543) handles many
 * clients, so a long-running server uses 10 and each Vercel instance 5. Override with DB_CONNECTION_LIMIT
 * (set it to 1 for a local "prisma dev" database, which accepts only one connection).
 */
function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const limit = process.env.DB_CONNECTION_LIMIT ?? (process.env.VERCEL ? "5" : "10");
  return url.replace(/([?&]connection_limit=)1(?!\d)/, `$1${limit}`);
}

/** One PrismaClient per process (dev hot reload would otherwise open many pools). */
const g = globalThis as unknown as { prisma?: PrismaClient };
const url = databaseUrl();
export const prisma =
  g.prisma ??
  new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
g.prisma = prisma;
