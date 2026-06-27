-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'released', 'paid', 'failed');

-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'commission';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "payoutAccountHolder" TEXT,
ADD COLUMN     "payoutAccountNumber" TEXT,
ADD COLUMN     "payoutBankCode" TEXT;

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "consignorId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "xenditDisbursementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payout_lotId_key" ON "Payout"("lotId");

-- CreateIndex
CREATE INDEX "Payout_consignorId_idx" ON "Payout"("consignorId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
