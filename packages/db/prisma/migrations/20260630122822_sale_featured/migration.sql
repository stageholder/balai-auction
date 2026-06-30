-- AddColumn
ALTER TABLE "Sale" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Sale_featured_idx" ON "Sale"("featured");
