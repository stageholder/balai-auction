import { describe, it, expect, vi } from "vitest";
import type { LiveLot } from "@auction/core";
import { tickSale, type TickDeps, type TickSaleInput } from "./tick";

const START = new Date("2026-07-01T10:00:00.000Z");
const NOW = new Date("2026-07-01T10:05:00.000Z");

function fakeDeps(lots: LiveLot[]): TickDeps & {
  openLot: ReturnType<typeof vi.fn>;
  closeLot: ReturnType<typeof vi.fn>;
  finishSale: ReturnType<typeof vi.fn>;
  broadcast: ReturnType<typeof vi.fn>;
} {
  return {
    listLots: vi.fn().mockResolvedValue(lots),
    openLot: vi.fn().mockResolvedValue(undefined),
    closeLot: vi.fn().mockResolvedValue(undefined),
    finishSale: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn().mockResolvedValue(undefined),
  };
}

const sale: TickSaleInput = {
  id: "s1",
  status: "live",
  startsAt: START,
  liveLotSeconds: 45,
};

function lot(id: string, n: number, status: string, closesAt: Date): LiveLot {
  return { id, lotNumber: n, status, closesAt };
}

describe("tickSale", () => {
  it("opens the next queued lot with closesAt = now + liveLotSeconds and broadcasts", async () => {
    const deps = fakeDeps([lot("a", 1, "queued", NOW)]);
    const action = await tickSale(sale, deps, NOW);

    expect(action).toEqual({ kind: "open", lotId: "a" });
    const expectedClose = new Date(NOW.getTime() + 45_000);
    expect(deps.openLot).toHaveBeenCalledWith("a", expectedClose);
    expect(deps.broadcast).toHaveBeenCalledWith("sale:s1", "lot-opened", {
      lotId: "a",
      closesAt: expectedClose.toISOString(),
    });
  });

  it("closes the active lot when expired and broadcasts", async () => {
    const past = new Date("2026-07-01T10:04:00.000Z");
    const deps = fakeDeps([lot("a", 1, "live", past)]);
    const action = await tickSale(sale, deps, NOW);

    expect(action).toEqual({ kind: "close", lotId: "a" });
    expect(deps.closeLot).toHaveBeenCalledWith("a", NOW);
    expect(deps.broadcast).toHaveBeenCalledWith("sale:s1", "lot-closed", {
      lotId: "a",
    });
  });

  it("finishes the sale when no lots remain and broadcasts", async () => {
    const deps = fakeDeps([lot("a", 1, "sold", NOW)]);
    const action = await tickSale(sale, deps, NOW);

    expect(action).toEqual({ kind: "finish" });
    expect(deps.finishSale).toHaveBeenCalledWith("s1");
    expect(deps.broadcast).toHaveBeenCalledWith("sale:s1", "sale-ended", {});
  });

  it("does nothing while the active lot's timer is still running", async () => {
    const future = new Date("2026-07-01T10:06:00.000Z");
    const deps = fakeDeps([lot("a", 1, "live", future)]);
    const action = await tickSale(sale, deps, NOW);

    expect(action).toEqual({ kind: "wait" });
    expect(deps.openLot).not.toHaveBeenCalled();
    expect(deps.closeLot).not.toHaveBeenCalled();
    expect(deps.finishSale).not.toHaveBeenCalled();
    expect(deps.broadcast).not.toHaveBeenCalled();
  });
});
