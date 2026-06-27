import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale, getSale, listSales, listPublishedSales, isPublicSaleStatus, getPublishedSale, updateSale, updateSaleStatus, listRunningLiveSales } from "./sales";

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

describe("isPublicSaleStatus", () => {
  it("returns false for draft", () => {
    expect(isPublicSaleStatus("draft")).toBe(false);
  });

  it("returns true for live", () => {
    expect(isPublicSaleStatus("live")).toBe(true);
  });

  it("returns true for scheduled", () => {
    expect(isPublicSaleStatus("scheduled")).toBe(true);
  });

  it("returns true for closed", () => {
    expect(isPublicSaleStatus("closed")).toBe(true);
  });
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
    // ordered newest-first by createdAt. Asserted on the returned timestamps
    // (tolerant of equal createdAt for rows inserted in the same microsecond)
    // rather than on creation order, which would flake on a timestamp collision.
    const times = published.map((s) => s.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // exactly two results
    expect(published).toHaveLength(2);
  });

  it("getPublishedSale returns the sale when status is live", async () => {
    const created = await createSale(db, { ...sampleSale("Live Sale"), status: "live" });
    const fetched = await getPublishedSale(db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
  });

  it("getPublishedSale returns null when sale is draft", async () => {
    const created = await createSale(db, sampleSale("Draft Sale"));
    expect(created.status).toBe("draft");
    const fetched = await getPublishedSale(db, created.id);
    expect(fetched).toBeNull();
  });

  it("getPublishedSale returns null for an unknown id", async () => {
    const fetched = await getPublishedSale(db, "00000000-0000-0000-0000-000000000000");
    expect(fetched).toBeNull();
  });
});

describe("updateSale / updateSaleStatus", () => {
  it("updates provided fields and leaves others unchanged", async () => {
    const sale = await createSale(db, sampleSale("Original"));
    const updated = await updateSale(db, sale.id, {
      title: "Renamed",
      taxPct: 5,
    });
    expect(updated.title).toBe("Renamed");
    expect(updated.taxPct).toBe(5);
    expect(updated.buyersPremiumPct).toBe(sale.buyersPremiumPct);
    expect(updated.incrementTable).toEqual(sale.incrementTable);
  });

  it("publishes a sale by setting its status", async () => {
    const sale = await createSale(db, sampleSale("Draft"));
    expect(sale.status).toBe("draft");
    const live = await updateSaleStatus(db, sale.id, "live");
    expect(live.status).toBe("live");
  });
});

describe("listRunningLiveSales", () => {
  it("returns only live-mode sales with live status", async () => {
    await createSale(db, sampleSale("Timed Live")); // timed, draft
    const liveDraft = await createSale(db, {
      ...sampleSale("Live Draft"),
      mode: "live",
    });
    const running = await createSale(db, {
      ...sampleSale("Live Running"),
      mode: "live",
    });
    await updateSaleStatus(db, running.id, "live");
    // liveDraft stays draft; should be excluded
    void liveDraft;

    const list = await listRunningLiveSales(db);
    expect(list.map((s) => s.id)).toEqual([running.id]);
  });
});

describe("live sale fields", () => {
  it("defaults a new sale to timed mode with liveLotSeconds 45", async () => {
    const sale = await createSale(db, sampleSale("Timed Sale"));
    expect(sale.mode).toBe("timed");
    expect(sale.liveLotSeconds).toBe(45);
  });

  it("creates a live-mode sale with a custom lot timer", async () => {
    const sale = await createSale(db, {
      ...sampleSale("Live Sale"),
      mode: "live",
      liveLotSeconds: 30,
    });
    expect(sale.mode).toBe("live");
    expect(sale.liveLotSeconds).toBe(30);
  });

  it("updates a sale's mode and timer", async () => {
    const sale = await createSale(db, sampleSale("To Convert"));
    const updated = await updateSale(db, sale.id, {
      mode: "live",
      liveLotSeconds: 60,
    });
    expect(updated.mode).toBe("live");
    expect(updated.liveLotSeconds).toBe(60);
  });
});
