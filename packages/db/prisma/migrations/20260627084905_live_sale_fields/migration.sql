-- CreateEnum
CREATE TYPE "SaleMode" AS ENUM ('timed', 'live');

-- AlterEnum
ALTER TYPE "LotStatus" ADD VALUE 'queued';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "liveLotSeconds" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "mode" "SaleMode" NOT NULL DEFAULT 'timed';
