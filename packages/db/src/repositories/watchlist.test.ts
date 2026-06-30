import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../test/testDb";
import { createUser } from "./users";
import { createSale } from "./sales";
import { createLot } from "./lots";
import { toggleWatchlist, isWatched, listWatchlist } from "./watchlist";

const db = testDb();
beforeEach(async () => {
  await resetDb(db);
});

async function seedLot(title = "A fine lot") {
  const sale = await createSale(db, {
    title: "Sale",
    startsAt: new Date("2026-07-01"),
    endsAt: new Date("2026-07-08"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable: [{ upTo: null, step: 100_000 }],
  });
  return createLot(db, {
    saleId: sale.id,
    lotNumber: 1,
    title,
    estimateLow: 1_000_000,
    estimateHigh: 2_000_000,
    startingPrice: 1_000_000,
    reserve: null,
    closesAt: new Date("2026-07-08"),
  });
}

describe("watchlist", () => {
  it("toggles a lot on then off (idempotent)", async () => {
    const u = await createUser(db, { email: "w@example.com" });
    const lot = await seedLot();
    expect(await isWatched(db, u.id, lot.id)).toBe(false);
    expect(await toggleWatchlist(db, u.id, lot.id)).toEqual({ watched: true });
    expect(await isWatched(db, u.id, lot.id)).toBe(true);
    expect(await toggleWatchlist(db, u.id, lot.id)).toEqual({ watched: false });
    expect(await isWatched(db, u.id, lot.id)).toBe(false);
  });

  it("lists only the given user's saved lots, newest first", async () => {
    const u1 = await createUser(db, { email: "u1@example.com" });
    const u2 = await createUser(db, { email: "u2@example.com" });
    const a = await seedLot("Lot A");
    const b = await seedLot("Lot B");
    await toggleWatchlist(db, u1.id, a.id);
    await toggleWatchlist(db, u1.id, b.id);
    await toggleWatchlist(db, u2.id, a.id);

    const mine = await listWatchlist(db, u1.id);
    expect(mine.map((x) => x.id)).toEqual([b.id, a.id]); // newest saved first
    expect(mine[0]!.saleTitle).toBe("Sale");
    expect(mine[0]!.estimateLow).toBe(1_000_000);
  });
});
