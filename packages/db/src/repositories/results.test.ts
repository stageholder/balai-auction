import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale } from "./sales";
import { createLot, updateLotStatus } from "./lots";
import { createUser } from "./users";
import { createInvoiceWithLedger } from "./invoices";
import { getSaleResults } from "./results";

const db = testDb();
const incrementTable: IncrementTable = [{ upTo: null, step: 100_000 }];

beforeEach(async () => {
  await resetDb(db);
});

describe("getSaleResults", () => {
  it("reports lots with sold/invoice info in lot-number order", async () => {
    const sale = await createSale(db, {
      title: "Sale",
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-08T00:00:00.000Z"),
      buyersPremiumPct: 20,
      taxPct: 11,
      incrementTable,
    });
    const buyer = await createUser(db, { email: "buyer@example.com" });
    const close = new Date("2026-07-08T00:00:00.000Z");
    const sold = await createLot(db, {
      saleId: sale.id, lotNumber: 1, title: "Sold Lot",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: null, closesAt: close,
    });
    await createLot(db, {
      saleId: sale.id, lotNumber: 2, title: "Live Lot",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: null, closesAt: close,
    });
    await updateLotStatus(db, sold.id, "sold");
    await createInvoiceWithLedger(db, {
      lotId: sold.id,
      buyerId: buyer.id,
      invoice: {
        hammer: 1_500_000, premium: 300_000, tax: 33_000, total: 1_833_000,
        entries: [{ party: "buyer", kind: "hammer", amount: 1_500_000 }],
      },
    });

    const rows = await getSaleResults(db, sale.id);
    expect(rows.map((r) => r.lotNumber)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      title: "Sold Lot",
      status: "sold",
      hammer: 1_500_000,
      invoiceStatus: "pending",
      buyerEmail: "buyer@example.com",
    });
    expect(rows[1]).toMatchObject({
      title: "Live Lot",
      status: "live",
      hammer: null,
      invoiceStatus: null,
      buyerEmail: null,
    });
  });
});
