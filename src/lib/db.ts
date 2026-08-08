import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function getRealClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * A lazy proxy, not the client itself. Next.js imports every route module
 * during `next build` just to read its exports (`dynamic`, `maxDuration`)
 * — if the real client were constructed at module-eval time, a missing
 * DATABASE_URL (e.g. on a fresh Vercel deploy before env vars are set)
 * would fail the *entire build*, not just requests that touch the
 * database. Deferring construction to first property access means the
 * build always succeeds; only an actual database call fails, with the
 * same clear error, at the point something actually needed it.
 *
 * Every access is forwarded to the real client with the real client as
 * the `this` receiver (not the proxy) — Prisma's methods rely on
 * internal instance state, and functions are explicitly re-bound to the
 * real client so `prisma.$transaction(...)` etc. still work correctly
 * regardless of how they're later invoked.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getRealClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
