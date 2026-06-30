import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../test/testDb";
import { createSale, updateSaleStatus } from "./sales";
import { createLot } from "./lots";
import { searchSales, searchLots } from "./search";

const db = testDb();

beforeEach(async () => {
  await resetDb(db);
});

function sampleSale(title: string, extra?: Record<string, unknown>) {
  return {
    title,
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable: [{ upTo: null, step: 100_000 }],
    ...extra,
  };
}

function sampleLot(
  saleId: string,
  n: number,
  title: string,
  description?: string
) {
  return {
    saleId,
    lotNumber: n,
    title,
    description,
    estimateLow: 1_000_000,
    estimateHigh: 2_000_000,
    startingPrice: 1_000_000,
    reserve: null,
    closesAt: new Date("2026-07-08T00:00:00.000Z"),
  };
}

describe("searchSales", () => {
  it("matches title/description/category case-insensitively, published only", async () => {
    const pub = await createSale(db, {
      ...sampleSale("Rolex Watches Spring"),
      category: "watches",
    });
    await updateSaleStatus(db, pub.id, "scheduled");
    await createSale(db, sampleSale("Rolex Draft")); // stays draft

    const hits = await searchSales(db, "rolex");
    expect(hits.map((s) => s.id)).toEqual([pub.id]); // draft excluded
    expect(
      (await searchSales(db, "WATCHES")).map((s) => s.id)
    ).toContain(pub.id); // category, case-insensitive
  });

  it("returns [] for a blank query", async () => {
    expect(await searchSales(db, "   ")).toEqual([]);
  });
});

describe("searchLots", () => {
  it("matches lot title/description in published sales only", async () => {
    const pub = await createSale(db, sampleSale("Spring Sale"));
    await updateSaleStatus(db, pub.id, "scheduled");
    const lot = await createLot(
      db,
      sampleLot(pub.id, 1, "A fine Daytona", "steel chronograph")
    );
    const draft = await createSale(db, sampleSale("Hidden Sale"));
    await createLot(
      db,
      sampleLot(draft.id, 1, "A fine Daytona", "in a draft sale")
    );

    const byTitle = await searchLots(db, "daytona");
    expect(byTitle.map((l) => l.id)).toEqual([lot.id]); // only the published-sale lot
    expect(
      (await searchLots(db, "chronograph")).map((l) => l.id)
    ).toEqual([lot.id]); // description
    expect(byTitle[0]!.saleTitle).toBe("Spring Sale");
  });

  it("returns [] for a blank query", async () => {
    expect(await searchLots(db, "")).toEqual([]);
  });
});
