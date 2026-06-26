import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale, getSale, listSales } from "./sales";

const db = testDb();

const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: null, step: 250_000 },
];

function sampleSale(title: string) {
  return {
    title,
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  };
}

beforeEach(async () => {
  await resetDb(db);
});

describe("sales repository", () => {
  it("creates a sale and round-trips the increment table", async () => {
    const created = await createSale(db, sampleSale("Modern Art"));
    expect(created.title).toBe("Modern Art");
    expect(created.buyersPremiumPct).toBe(20);
    expect(created.taxPct).toBe(11);
    expect(created.status).toBe("draft");
    expect(created.incrementTable).toEqual(incrementTable);

    const fetched = await getSale(db, created.id);
    expect(fetched?.incrementTable).toEqual(incrementTable);
  });

  it("returns null for an unknown id", async () => {
    expect(await getSale(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("lists sales newest first", async () => {
    const first = await createSale(db, sampleSale("First"));
    const second = await createSale(db, sampleSale("Second"));
    const all = await listSales(db);
    expect(all.map((s) => s.id)).toEqual([second.id, first.id]);
  });
});
