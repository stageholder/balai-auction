import { describe, it, expect } from "vitest";
import { advanceLiveSale, type LiveLot } from "./live";

const START = new Date("2026-07-01T10:00:00.000Z");
const NOW = new Date("2026-07-01T10:05:00.000Z"); // after start

function lot(
  id: string,
  lotNumber: number,
  status: string,
  closesAt: Date
): LiveLot {
  return { id, lotNumber, status, closesAt };
}

describe("advanceLiveSale", () => {
  it("waits when the sale is not live", () => {
    expect(advanceLiveSale("scheduled", START, [], NOW)).toEqual({ kind: "wait" });
  });

  it("waits when the start time has not arrived", () => {
    const future = new Date("2026-07-01T11:00:00.000Z");
    expect(advanceLiveSale("live", future, [], NOW)).toEqual({ kind: "wait" });
  });

  it("opens the lowest-numbered queued lot when none is active", () => {
    const lots = [
      lot("b", 2, "queued", NOW),
      lot("a", 1, "queued", NOW),
    ];
    expect(advanceLiveSale("live", START, lots, NOW)).toEqual({
      kind: "open",
      lotId: "a",
    });
  });

  it("waits while the active lot's timer has not expired", () => {
    const future = new Date("2026-07-01T10:06:00.000Z");
    const lots = [lot("a", 1, "live", future), lot("b", 2, "queued", NOW)];
    expect(advanceLiveSale("live", START, lots, NOW)).toEqual({ kind: "wait" });
  });

  it("closes the active lot when its timer has expired", () => {
    const past = new Date("2026-07-01T10:04:00.000Z");
    const lots = [lot("a", 1, "live", past), lot("b", 2, "queued", NOW)];
    expect(advanceLiveSale("live", START, lots, NOW)).toEqual({
      kind: "close",
      lotId: "a",
    });
  });

  it("finishes when no active and no queued lots remain", () => {
    const lots = [lot("a", 1, "sold", NOW), lot("b", 2, "unsold", NOW)];
    expect(advanceLiveSale("live", START, lots, NOW)).toEqual({ kind: "finish" });
  });
});
