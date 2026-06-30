import { PrismaClient } from "@prisma/client";

let client: PrismaClient | null = null;

/** A PrismaClient pinned to TEST_DATABASE_URL, shared across the test run. */
export function testDb(): PrismaClient {
  if (!client) {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
      throw new Error("TEST_DATABASE_URL not set (see packages/db/.env.test)");
    }
    client = new PrismaClient({ datasources: { db: { url } } });
  }
  return client;
}

/** Truncate every table so each test starts from an empty database. */
export async function resetDb(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "LedgerEntry","Invoice","Bid","Registration","Lot","Sale","User","ConsignmentRequest" RESTART IDENTITY CASCADE'
  );
}
