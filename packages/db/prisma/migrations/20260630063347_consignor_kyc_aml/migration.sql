-- CreateEnum
CREATE TYPE "AmlStatus" AS ENUM ('pending', 'cleared', 'flagged');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "consignorLegalName" TEXT,
ADD COLUMN "consignorIdType" TEXT,
ADD COLUMN "consignorIdNumber" TEXT,
ADD COLUMN "consignorKycStatus" "KycStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "consignorAmlStatus" "AmlStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "consignorAmlNote" TEXT;
