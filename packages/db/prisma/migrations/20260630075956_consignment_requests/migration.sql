-- CreateEnum
CREATE TYPE "ConsignmentRequestStatus" AS ENUM ('pending', 'reviewing', 'accepted', 'declined');

-- CreateTable
CREATE TABLE "ConsignmentRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "category" TEXT,
    "itemTitle" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "sellerEstimate" BIGINT,
    "status" "ConsignmentRequestStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsignmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsignmentRequest_status_idx" ON "ConsignmentRequest"("status");
