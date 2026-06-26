import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale, getSale, listSales, listPublishedSales } from "./sales";

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

  it("createSale with status 'live' returns a record with status 'live'", async () => {
    const created = await createSale(db, { ...sampleSale("Live Sale"), status: "live" });
    expect(created.status).toBe("live");
  });

  it("listPublishedSales excludes drafts and includes non-drafts newest first", async () => {
    // draft sale (default)
    await createSale(db, sampleSale("Draft Sale"));
    // two published sales
    const scheduled = await createSale(db, { ...sampleSale("Scheduled Sale"), status: "scheduled" });
    const live = await createSale(db, { ...sampleSale("Live Sale"), status: "live" });

    const published = await listPublishedSales(db);
    const ids = published.map((s) => s.id);

    // must contain the two published sales
    expect(ids).toContain(scheduled.id);
    expect(ids).toContain(live.id);
    // must not contain the draft
    const titles = published.map((s) => s.title);
    expect(titles).not.toContain("Draft Sale");
    // newest first: live was created after scheduled
    expect(ids.indexOf(live.id)).toBeLessThan(ids.indexOf(scheduled.id));
    // exactly two results
    expect(published).toHaveLength(2);
  });
});
