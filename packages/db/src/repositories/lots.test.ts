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
  openQueuedLot,
  addLotMedia,
  removeLotMedia,
  listLotMedia,
} from "./lots";
import { createUser } from "./users";

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

describe("openQueuedLot", () => {
  it("promotes a queued lot to live with a new closesAt", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    await updateLotStatus(db, lot.id, "queued");

    const closesAt = new Date("2026-07-10T00:00:45.000Z");
    const opened = await openQueuedLot(db, lot.id, closesAt);
    expect(opened?.status).toBe("live");
    expect(opened?.closesAt.getTime()).toBe(closesAt.getTime());
  });

  it("returns null when the lot is not queued (already opened/closed)", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    // lot is "live" by default, not "queued"
    expect(await openQueuedLot(db, lot.id, new Date())).toBeNull();
  });
});

describe("createLot status", () => {
  it("defaults to live when no status is given", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    expect(lot.status).toBe("live");
  });

  it("creates a queued lot when status is queued", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      ...sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z")),
      status: "queued",
    });
    expect(lot.status).toBe("queued");
  });
});

describe("updateLot", () => {
  it("updates fields incl. money, leaving others unchanged", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const updated = await updateLot(db, lot.id, {
      title: "Updated Title",
      reserve: 2_000_000,
    });
    expect(updated.title).toBe("Updated Title");
    expect(updated.reserve).toBe(2_000_000);
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

describe("getLotsDueToClose excludes live-mode lots", () => {
  it("returns only due lots whose sale is timed-mode", async () => {
    const past = new Date("2026-07-01T00:00:00.000Z");
    const now = new Date("2026-07-10T00:00:00.000Z");

    const timedSale = await createSale(db, {
      ...sampleSaleForLotsExcludeTest(),
    });
    const liveSale = await createSale(db, {
      ...sampleSaleForLotsExcludeTest(),
      mode: "live",
    });
    const timedLot = await createLot(db, lotInExcludeTest(timedSale.id, 1, past));
    await createLot(db, lotInExcludeTest(liveSale.id, 1, past)); // live-mode, due, but excluded

    const due = await getLotsDueToClose(db, now);
    expect(due.map((l) => l.id)).toEqual([timedLot.id]);
  });
});

describe("lot consignor", () => {
  it("creates a lot with a consignor and clears it on update", async () => {
    const sale = await makeSale();
    const consignor = await createUser(db, { email: "consignor@example.com", role: "consignor" });
    const lot = await createLot(db, {
      ...sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z")),
      consignorId: consignor.id,
    });
    expect(lot.consignorId).toBe(consignor.id);

    const cleared = await updateLot(db, lot.id, { consignorId: null });
    expect(cleared.consignorId).toBeNull();
  });
});

describe("lot media", () => {
  function sampleMedia(name: string) {
    return {
      bucket: "lots",
      path: `lot/${name}`,
      url: `https://cdn.example.com/${name}`,
      contentType: "image/jpeg",
      sizeBytes: 1234,
    };
  }

  it("derives images (in order) from media created with the lot", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      ...sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z")),
      media: [sampleMedia("a.jpg"), sampleMedia("b.jpg")],
    });
    expect(lot.images).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]);
    const fetched = await getLot(db, lot.id);
    expect(fetched?.images).toEqual(lot.images);
  });

  it("appends, lists and removes lot media", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      ...sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z")),
      media: [sampleMedia("a.jpg")],
    });
    await addLotMedia(db, lot.id, [sampleMedia("b.jpg"), sampleMedia("c.jpg")]);

    const media = await listLotMedia(db, lot.id);
    expect(media.map((m) => m.url)).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
      "https://cdn.example.com/c.jpg",
    ]);

    const removed = await removeLotMedia(db, lot.id, media[1]!.id);
    expect(removed).toEqual({ bucket: "lots", path: "lot/b.jpg" });

    const after = await getLot(db, lot.id);
    expect(after?.images).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/c.jpg",
    ]);
  });

  it("does not remove media belonging to another lot", async () => {
    const sale = await makeSale();
    const a = await createLot(db, {
      ...sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z")),
      media: [sampleMedia("a.jpg")],
    });
    const b = await createLot(db, {
      ...sampleLot(sale.id, 2, new Date("2026-07-08T00:00:00.000Z")),
      media: [sampleMedia("b.jpg")],
    });
    const bMedia = await listLotMedia(db, b.id);
    expect(await removeLotMedia(db, a.id, bMedia[0]!.id)).toBeNull();
    // b's media is untouched
    expect((await getLot(db, b.id))?.images).toEqual([
      "https://cdn.example.com/b.jpg",
    ]);
  });
});

// helpers local to getLotsDueToClose exclude test
function sampleSaleForLotsExcludeTest() {
  return {
    title: "Sale",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable: [{ upTo: null, step: 100_000 }],
  };
}
function lotInExcludeTest(saleId: string, lotNumber: number, closesAt: Date) {
  return {
    saleId,
    lotNumber,
    title: `Lot ${lotNumber}`,
    estimateLow: 1_000_000,
    estimateHigh: 2_000_000,
    startingPrice: 1_000_000,
    reserve: null,
    closesAt,
  };
}
