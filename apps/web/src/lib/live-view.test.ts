import { describe, it, expect } from "vitest";
import { liveViewModel, type LiveViewLot } from "./live-view";

const lots: LiveViewLot[] = [
  { id: "a", lotNumber: 1, title: "Lot A" },
  { id: "b", lotNumber: 2, title: "Lot B" },
  { id: "c", lotNumber: 3, title: "Lot C" },
  { id: "d", lotNumber: 4, title: "Lot D" },
];

describe("liveViewModel", () => {
  it("up-next excludes the active and sold lots, ordered by lotNumber", () => {
    const { upNext } = liveViewModel(lots, "b", ["a"]);
    expect(upNext.map((l) => l.id)).toEqual(["c", "d"]);
  });

  it("just-sold lists sold lots most-recent-first", () => {
    const { justSold } = liveViewModel(lots, "c", ["a", "b"]);
    expect(justSold.map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("handles no active lot (all remaining are up-next)", () => {
    const { upNext, justSold } = liveViewModel(lots, null, ["a"]);
    expect(upNext.map((l) => l.id)).toEqual(["b", "c", "d"]);
    expect(justSold.map((l) => l.id)).toEqual(["a"]);
  });
});
