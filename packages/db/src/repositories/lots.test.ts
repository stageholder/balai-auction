import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale } from "./sales";
import {
  createLot,
  getLot,
  listLotsForSale,
  getLotsDueToClose,
  updateLotStatus,
  updateLotClosesAt,
  updateLot,
} from "./lots";

const db = testDb();
const incrementTable: IncrementTable = [{ upTo: null, step: 100_000 }];

async function makeSale() {
  return createSale(db, {
    title: "Sale",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });
}

function sampleLot(saleId: string, lotNumber: number, closesAt: Date) {
  return {
    saleId,
    lotNumber,
    title: `Lot ${lotNumber}`,
    estimateLow: 1_000_000,
    estimateHigh: 2_000_000,
    startingPrice: 1_000_000,
    reserve: 1_500_000,
    closesAt,
  };
}

beforeEach(async () => {
  await resetDb(db);
});

describe("lots repository", () => {
  it("creates a lot with money fields round-tripped and reads it back", async () => {
    const sale = await makeSale();
    const created = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    expect(created.startingPrice).toBe(1_000_000);
    expect(created.estimateHigh).toBe(2_000_000);
    expect(created.reserve).toBe(1_500_000);
    expect(created.images).toEqual([]);
    expect(created.status).toBe("live");

    const fetched = await getLot(db, created.id);
    expect(fetched).toEqual(created);
  });

  it("lists a sale's lots in ascending lot number", async () => {
    const sale = await makeSale();
    const close = new Date("2026-07-08T00:00:00.000Z");
    await createLot(db, sampleLot(sale.id, 2, close));
    await createLot(db, sampleLot(sale.id, 1, close));
    const lots = await listLotsForSale(db, sale.id);
    expect(lots.map((l) => l.lotNumber)).toEqual([1, 2]);
  });

  it("returns only live lots whose closesAt has passed", async () => {
    const sale = await makeSale();
    const past = new Date("2026-07-01T00:00:00.000Z");
    const future = new Date("2026-07-31T00:00:00.000Z");
    const due = await createLot(db, sampleLot(sale.id, 1, past));
    await createLot(db, sampleLot(sale.id, 2, future));
    const sold = await createLot(db, sampleLot(sale.id, 3, past));
    await updateLotStatus(db, sold.id, "sold");

    const now = new Date("2026-07-10T00:00:00.000Z");
    const dueLots = await getLotsDueToClose(db, now);
    expect(dueLots.map((l) => l.id)).toEqual([due.id]);
  });

  it("updates a lot's status", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const updated = await updateLotStatus(db, lot.id, "sold");
    expect(updated.status).toBe("sold");
  });
});

describe("updateLotClosesAt", () => {
  it("extends a lot's close time", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const newClose = new Date("2026-07-08T00:02:00.000Z");
    const updated = await updateLotClosesAt(db, lot.id, newClose);
    expect(updated.closesAt.getTime()).toBe(newClose.getTime());
  });
});

describe("queued lot status", () => {
  it("accepts the queued status via updateLotStatus", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const updated = await updateLotStatus(db, lot.id, "queued");
    expect(updated.status).toBe("queued");
  });
});

describe("updateLot", () => {
  it("updates fields incl. money + images, leaving others unchanged", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const updated = await updateLot(db, lot.id, {
      title: "Updated Title",
      reserve: 2_000_000,
      images: ["https://example.com/a.jpg"],
    });
    expect(updated.title).toBe("Updated Title");
    expect(updated.reserve).toBe(2_000_000);
    expect(updated.images).toEqual(["https://example.com/a.jpg"]);
    expect(updated.startingPrice).toBe(lot.startingPrice);
  });

  it("can clear the reserve", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const updated = await updateLot(db, lot.id, { reserve: null });
    expect(updated.reserve).toBeNull();
  });
});
