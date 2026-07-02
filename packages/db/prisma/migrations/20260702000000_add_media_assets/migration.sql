-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('lot_image', 'consignment_photo', 'kyc_document');

-- AlterTable (drop the legacy JSON image array; images now live in MediaAsset)
ALTER TABLE "Lot" DROP COLUMN "images";

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "bucket" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "url" TEXT,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lotId" TEXT,
    "consignmentRequestId" TEXT,
    "kycUserId" TEXT,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_lotId_idx" ON "MediaAsset"("lotId");

-- CreateIndex
CREATE INDEX "MediaAsset_consignmentRequestId_idx" ON "MediaAsset"("consignmentRequestId");

-- CreateIndex
CREATE INDEX "MediaAsset_kycUserId_idx" ON "MediaAsset"("kycUserId");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_consignmentRequestId_fkey" FOREIGN KEY ("consignmentRequestId") REFERENCES "ConsignmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_kycUserId_fkey" FOREIGN KEY ("kycUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
