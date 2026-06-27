import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale } from "./sales";
import { createLot, updateLotStatus } from "./lots";
import { createUser } from "./users";
import { createRegistration, setRegistrationKyc } from "./registrations";
import { appendBid } from "./bids";
import { closeLot } from "./close";
import { createInvoiceWithLedger } from "./invoices";
import { getSaleResults, getPublicSaleResults, getLotHammer } from "./results";

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

async function seedSaleWithSoldAndUnsold() {
  const sale = await createSale(db, {
    title: "Results Sale",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-02T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });
  const closesAt = new Date("2026-07-01T01:00:00.000Z");
  const sold = await createLot(db, {
    saleId: sale.id, lotNumber: 1, title: "Sold Lot",
    estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
    reserve: null, closesAt,
  });
  const unsold = await createLot(db, {
    saleId: sale.id, lotNumber: 2, title: "Unsold Lot",
    estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
    reserve: 9_000_000, closesAt,
  });
  const buyer = await createUser(db, { email: "winner@example.com" });
  const reg = await createRegistration(db, { userId: buyer.id, saleId: sale.id });
  await setRegistrationKyc(db, reg.id, "approved");
  // Add a competing bidder so settlement produces currentPrice = 2_000_000
  // (winner max 3_000_000 vs runner-up max 1_900_000 → hammer = 1_900_000 + 100_000 = 2_000_000)
  const runner = await createUser(db, { email: "runner@example.com" });
  const regRunner = await createRegistration(db, { userId: runner.id, saleId: sale.id });
  await setRegistrationKyc(db, regRunner.id, "approved");
  await appendBid(db, { lotId: sold.id, bidderId: runner.id, maxAmount: 1_900_000, amount: 1_900_000 });
  await appendBid(db, { lotId: sold.id, bidderId: buyer.id, maxAmount: 3_000_000, amount: 2_000_000 });
  const after = new Date(closesAt.getTime() + 1);
  await closeLot(db, sold.id, after);   // → sold + invoice
  await closeLot(db, unsold.id, after); // → unsold (reserve unmet)
  return { sale, sold, unsold };
}

describe("getPublicSaleResults", () => {
  it("returns public-safe rows: hammer for sold, null for unsold, NO buyer/invoice fields", async () => {
    const { sale, sold, unsold } = await seedSaleWithSoldAndUnsold();
    const rows = await getPublicSaleResults(db, sale.id);

    expect(rows.map((r) => r.lotNumber)).toEqual([1, 2]); // lotNumber asc
    const soldRow = rows.find((r) => r.lotId === sold.id)!;
    const unsoldRow = rows.find((r) => r.lotId === unsold.id)!;
    expect(soldRow.status).toBe("sold");
    expect(soldRow.hammer).toBe(2_000_000);
    expect(unsoldRow.status).toBe("unsold");
    expect(unsoldRow.hammer).toBeNull();

    // buyer identity / invoice status must NOT appear in the public payload
    expect(soldRow).not.toHaveProperty("buyerEmail");
    expect(soldRow).not.toHaveProperty("invoiceStatus");
  });
});

describe("getLotHammer", () => {
  it("returns the hammer for a sold lot and null for an unsold lot", async () => {
    const { sold, unsold } = await seedSaleWithSoldAndUnsold();
    expect(await getLotHammer(db, sold.id)).toBe(2_000_000);
    expect(await getLotHammer(db, unsold.id)).toBeNull();
  });
});
