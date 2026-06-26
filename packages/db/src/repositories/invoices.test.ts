import { describe, it, expect, beforeEach } from "vitest";
import {
  settleLot,
  computeInvoice,
  type BidEvent,
  type IncrementTable,
} from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createUser } from "./users";
import { createSale } from "./sales";
import { createLot } from "./lots";
import { appendBid, getBidEventsForLot } from "./bids";
import {
  createInvoiceWithLedger,
  getInvoice,
  getLedgerEntriesForInvoice,
} from "./invoices";

const db = testDb();
const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

beforeEach(async () => {
  await resetDb(db);
});

describe("invoices repository", () => {
  it("persists an invoice and its ledger entries from the full core pipeline", async () => {
    const sale = await createSale(db, {
      title: "Sale",
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-08T00:00:00.000Z"),
      buyersPremiumPct: 20,
      taxPct: 11,
      incrementTable,
    });
    const lot = await createLot(db, {
      saleId: sale.id,
      lotNumber: 1,
      title: "Lot 1",
      estimateLow: 1_000_000,
      estimateHigh: 2_000_000,
      startingPrice: 1_000_000,
      reserve: null,
      closesAt: new Date("2026-07-08T00:00:00.000Z"),
    });
    const a = await createUser(db, { email: "a@example.com" });
    const b = await createUser(db, { email: "b@example.com" });
    await appendBid(db, {
      lotId: lot.id,
      bidderId: a.id,
      maxAmount: 5_000_000,
      amount: 1_000_000,
    });
    await appendBid(db, {
      lotId: lot.id,
      bidderId: b.id,
      maxAmount: 3_000_000,
      amount: 1_100_000,
    });

    const events: BidEvent[] = await getBidEventsForLot(db, lot.id);
    const settlement = settleLot(
      lot.startingPrice,
      events,
      sale.incrementTable,
      lot.reserve
    );
    expect(settlement.outcome).toBe("sold");
    expect(settlement.winnerId).toBe(a.id);
    expect(settlement.hammerPrice).toBe(3_100_000);

    const invoice = computeInvoice({
      hammer: settlement.hammerPrice,
      premiumPct: sale.buyersPremiumPct,
      taxPct: sale.taxPct,
    });

    const saved = await createInvoiceWithLedger(db, {
      lotId: lot.id,
      buyerId: settlement.winnerId!,
      invoice,
    });
    expect(saved.hammer).toBe(3_100_000);
    expect(saved.premium).toBe(620_000);
    expect(saved.tax).toBe(68_200);
    expect(saved.total).toBe(3_788_200);
    expect(saved.status).toBe("pending");

    const fetched = await getInvoice(db, lot.id);
    expect(fetched?.id).toBe(saved.id);

    const entries = await getLedgerEntriesForInvoice(db, saved.id);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.party === "buyer")).toBe(true);
    expect(entries.every((e) => e.lotId === lot.id)).toBe(true);
    expect(entries.map((e) => e.kind).sort()).toEqual([
      "hammer",
      "premium",
      "tax",
    ]);
  });
});
