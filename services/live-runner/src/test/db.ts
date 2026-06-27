import { prisma } from "@auction/db";

export { prisma };

/** Truncate all tables so the integration test starts clean. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "LedgerEntry","Invoice","Bid","Registration","Lot","Sale","User" RESTART IDENTITY CASCADE'
  );
}
