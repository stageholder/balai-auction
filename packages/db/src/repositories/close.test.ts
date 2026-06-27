import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale } from "./sales";
import { createLot, getLot } from "./lots";
import { createUser } from "./users";
import { appendBid } from "./bids";
import { getInvoice, getLedgerEntriesForInvoice } from "./invoices";
import { closeLot, closeDueLots } from "./close";

const db = testDb();
const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];
const PAST = new Date("2026-07-01T00:00:00.000Z");
const FUTURE = new Date("2026-12-01T00:00:00.000Z");
const NOW = new Date("2026-07-10T00:00:00.000Z");

async function makeSale() {
  return createSale(db, {
    title: "Sale",
    startsAt: PAST,
    endsAt: NOW,
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });
}

beforeEach(async () => {
  await resetDb(db);
});

describe("closeLot", () => {
  it("settles a contested lot: sold, invoice + ledger written, status sold", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      saleId: sale.id,
      lotNumber: 1,
      title: "Lot 1",
      estimateLow: 1_000_000,
      estimateHigh: 2_000_000,
      startingPrice: 1_000_000,
      reserve: null,
      closesAt: PAST,
    });
    const a = await createUser(db, { email: "a@example.com" });
    const b = await createUser(db, { email: "b@example.com" });
    await appendBid(db, { lotId: lot.id, bidderId: a.id, maxAmount: 5_000_000, amount: 1_000_000 });
    await appendBid(db, { lotId: lot.id, bidderId: b.id, maxAmount: 3_000_000, amount: 1_100_000 });

    const result = await closeLot(db, lot.id, NOW);
    expect(result.outcome).toBe("sold");
    expect(result.winnerId).toBe(a.id);
    expect(result.hammerPrice).toBe(3_100_000);

    expect((await getLot(db, lot.id))?.status).toBe("sold");
    const invoice = await getInvoice(db, lot.id);
    expect(invoice?.total).toBe(3_788_200); // 3.1M + 20% + 11% PPN on premium
    expect(await getLedgerEntriesForInvoice(db, invoice!.id)).toHaveLength(3);
  });

  it("marks a lot unsold when the reserve is not met (no invoice)", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      saleId: sale.id,
      lotNumber: 1,
      title: "Lot 1",
      estimateLow: 1_000_000,
      estimateHigh: 2_000_000,
      startingPrice: 1_000_000,
      reserve: 5_000_000,
      closesAt: PAST,
    });
    const a = await createUser(db, { email: "a@example.com" });
    await appendBid(db, { lotId: lot.id, bidderId: a.id, maxAmount: 2_000_000, amount: 1_000_000 });

    const result = await closeLot(db, lot.id, NOW);
    expect(result.outcome).toBe("unsold");
    expect((await getLot(db, lot.id))?.status).toBe("unsold");
    expect(await getInvoice(db, lot.id)).toBeNull();
  });

  it("skips a lot that is not yet due", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      saleId: sale.id,
      lotNumber: 1,
      title: "Lot 1",
      estimateLow: 1_000_000,
      estimateHigh: 2_000_000,
      startingPrice: 1_000_000,
      reserve: null,
      closesAt: FUTURE,
    });
    const result = await closeLot(db, lot.id, NOW);
    expect(result.outcome).toBe("skipped");
    expect((await getLot(db, lot.id))?.status).toBe("live");
  });

  it("is idempotent: closing an already-closed lot skips with no duplicate invoice", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      saleId: sale.id,
      lotNumber: 1,
      title: "Lot 1",
      estimateLow: 1_000_000,
      estimateHigh: 2_000_000,
      startingPrice: 1_000_000,
      reserve: null,
      closesAt: PAST,
    });
    const a = await createUser(db, { email: "a@example.com" });
    await appendBid(db, { lotId: lot.id, bidderId: a.id, maxAmount: 2_000_000, amount: 1_000_000 });

    const first = await closeLot(db, lot.id, NOW);
    expect(first.outcome).toBe("sold");
    const second = await closeLot(db, lot.id, NOW);
    expect(second.outcome).toBe("skipped");
    expect(await db.invoice.count({ where: { lotId: lot.id } })).toBe(1);
  });
});

describe("closeDueLots", () => {
  it("closes all due live lots and leaves future ones live", async () => {
    const sale = await makeSale();
    const due = await createLot(db, {
      saleId: sale.id, lotNumber: 1, title: "Due",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: null, closesAt: PAST,
    });
    const later = await createLot(db, {
      saleId: sale.id, lotNumber: 2, title: "Later",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: null, closesAt: FUTURE,
    });
    const a = await createUser(db, { email: "a@example.com" });
    await appendBid(db, { lotId: due.id, bidderId: a.id, maxAmount: 2_000_000, amount: 1_000_000 });

    const results = await closeDueLots(db, NOW);
    expect(results).toHaveLength(1);
    expect(results[0]?.lotId).toBe(due.id);
    expect((await getLot(db, due.id))?.status).toBe("sold");
    expect((await getLot(db, later.id))?.status).toBe("live");
  });
});
