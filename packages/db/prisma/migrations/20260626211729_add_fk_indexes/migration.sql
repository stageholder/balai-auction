-- CreateIndex
CREATE INDEX "Bid_bidderId_idx" ON "Bid"("bidderId");

-- CreateIndex
CREATE INDEX "Invoice_buyerId_idx" ON "Invoice"("buyerId");

-- CreateIndex
CREATE INDEX "LedgerEntry_invoiceId_idx" ON "LedgerEntry"("invoiceId");

-- CreateIndex
CREATE INDEX "Lot_consignorId_idx" ON "Lot"("consignorId");

-- CreateIndex
CREATE INDEX "Registration_saleId_idx" ON "Registration"("saleId");
