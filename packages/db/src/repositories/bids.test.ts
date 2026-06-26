import { describe, it, expect, beforeEach } from "vitest";
import { resolveBids, type IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale } from "./sales";
import { createLot } from "./lots";
import { createUser } from "./users";
import { appendBid, getBidEventsForLot } from "./bids";

const db = testDb();
const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

async function scaffold() {
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
  return { lot, a, b };
}

beforeEach(async () => {
  await resetDb(db);
});

describe("bids repository", () => {
  it("appends a bid and reads it back as a record", async () => {
    const { lot, a } = await scaffold();
    const bid = await appendBid(db, {
      lotId: lot.id,
      bidderId: a.id,
      maxAmount: 3_000_000,
      amount: 1_000_000,
    });
    expect(bid.maxAmount).toBe(3_000_000);
    expect(bid.amount).toBe(1_000_000);
    expect(bid.type).toBe("bid");
  });

  it("returns persisted bids as core BidEvents and resolves a winner", async () => {
    const { lot, a, b } = await scaffold();
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

    const events = await getBidEventsForLot(db, lot.id);
    expect(events).toHaveLength(2);
    expect(typeof events[0]?.createdAt).toBe("number");

    const resolution = resolveBids(1_000_000, events, incrementTable);
    expect(resolution.winnerId).toBe(a.id);
    expect(resolution.currentPrice).toBe(3_100_000);
    expect(resolution.contested).toBe(true);
  });
});
