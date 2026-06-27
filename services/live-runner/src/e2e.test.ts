import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IncrementTable, LiveLot } from "@auction/core";
import {
  createSale,
  updateSaleStatus,
  createLot,
  createUser,
  createRegistration,
  setRegistrationKyc,
  appendBid,
  getLot,
  getInvoice,
  listLotsForSale,
  listRunningLiveSales,
  openQueuedLot,
  closeLot,
  updateSaleStatus as finishSaleRepo,
} from "@auction/db";
import { tickSale, type TickDeps } from "./tick";
import { prisma, resetDb } from "./test/db";

const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

beforeEach(async () => {
  await resetDb();
});

function realDeps(broadcast = vi.fn().mockResolvedValue(undefined)): TickDeps & {
  broadcast: ReturnType<typeof vi.fn>;
} {
  return {
    listLots: async (saleId): Promise<LiveLot[]> => {
      const lots = await listLotsForSale(prisma, saleId);
      return lots.map((l) => ({
        id: l.id,
        lotNumber: l.lotNumber,
        status: l.status,
        closesAt: l.closesAt,
      }));
    },
    openLot: (lotId, closesAt) => openQueuedLot(prisma, lotId, closesAt),
    closeLot: (lotId, now) => closeLot(prisma, lotId, now),
    finishSale: (saleId) => finishSaleRepo(prisma, saleId, "closed"),
    broadcast,
  };
}

describe("live-runner end-to-end", () => {
  it("sequences a 2-lot live sale: open → bid → close (sold) → open → close (unsold) → finish", async () => {
    const past = new Date("2026-07-01T00:00:00.000Z");
    const sale = await createSale(prisma, {
      title: "Live Sale",
      startsAt: past,
      endsAt: new Date("2026-07-02T00:00:00.000Z"),
      buyersPremiumPct: 20,
      taxPct: 11,
      incrementTable,
      mode: "live",
      liveLotSeconds: 30,
    });
    await updateSaleStatus(prisma, sale.id, "live");

    const placeholderClose = new Date("2026-07-01T01:00:00.000Z");
    const lot1 = await createLot(prisma, {
      saleId: sale.id, lotNumber: 1, title: "Lot 1",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: null, closesAt: placeholderClose, status: "queued",
    });
    const lot2 = await createLot(prisma, {
      saleId: sale.id, lotNumber: 2, title: "Lot 2",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: 5_000_000, closesAt: placeholderClose, status: "queued",
    });

    const bidder = await createUser(prisma, { email: "bidder@example.com" });
    const reg = await createRegistration(prisma, { userId: bidder.id, saleId: sale.id });
    await setRegistrationKyc(prisma, reg.id, "approved");

    const broadcast = vi.fn().mockResolvedValue(undefined);
    const deps = realDeps(broadcast);

    // Drive the sale exactly as index.ts's loop does: select it via
    // listRunningLiveSales (mode:"live" AND status:"live"), then feed that
    // record into tickSale — so this e2e covers the production sale-selection
    // query + saleRowToRecord mapping, not just tickSale in isolation.
    const running = await listRunningLiveSales(prisma);
    expect(running.map((s) => s.id)).toEqual([sale.id]);
    const saleInput = running[0]!;

    const t0 = new Date("2026-07-01T10:00:00.000Z");

    // 1) opens lot 1
    expect((await tickSale(saleInput, deps, t0)).kind).toBe("open");
    expect((await getLot(prisma, lot1.id))?.status).toBe("live");

    // a bid lands on lot 1 (placed directly via the ledger for the test)
    await appendBid(prisma, {
      lotId: lot1.id, bidderId: bidder.id, maxAmount: 3_000_000, amount: 1_000_000,
    });

    // 2) after the timer, closes lot 1 → sold
    const t1 = new Date(t0.getTime() + 30_000 + 1);
    expect((await tickSale(saleInput, deps, t1)).kind).toBe("close");
    expect((await getLot(prisma, lot1.id))?.status).toBe("sold");
    expect(await getInvoice(prisma, lot1.id)).not.toBeNull();

    // 3) opens lot 2
    expect((await tickSale(saleInput, deps, t1)).kind).toBe("open");
    expect((await getLot(prisma, lot2.id))?.status).toBe("live");

    // 4) after the timer, closes lot 2 → unsold (no bids, reserve unmet)
    const t2 = new Date(t1.getTime() + 30_000 + 1);
    expect((await tickSale(saleInput, deps, t2)).kind).toBe("close");
    expect((await getLot(prisma, lot2.id))?.status).toBe("unsold");
    expect(await getInvoice(prisma, lot2.id)).toBeNull();

    // 5) finishes the sale
    expect((await tickSale(saleInput, deps, t2)).kind).toBe("finish");

    // broadcasts: 2 lot-opened, 2 lot-closed, 1 sale-ended
    const events = broadcast.mock.calls.map((c) => c[1]);
    expect(events.filter((e) => e === "lot-opened")).toHaveLength(2);
    expect(events.filter((e) => e === "lot-closed")).toHaveLength(2);
    expect(events.filter((e) => e === "sale-ended")).toHaveLength(1);
  });
});
