import { describe, it, expect } from "vitest";
import { settleLot } from "./settlement";
import type { BidEvent, IncrementTable } from "./types";

const table: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];
const START = 1_000_000;

describe("settleLot", () => {
  it("is unsold with no bids", () => {
    expect(settleLot(START, [], table, null)).toEqual({
      outcome: "unsold",
      winnerId: null,
      hammerPrice: 0,
    });
  });

  it("sells at the resolved price when there is no reserve", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    expect(settleLot(START, events, table, null)).toEqual({
      outcome: "sold",
      winnerId: "A",
      hammerPrice: 3_100_000,
    });
  });

  it("is unsold when the top bidder's max is below the reserve", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 2_000_000, createdAt: 1 },
    ];
    expect(settleLot(START, events, table, 3_000_000)).toEqual({
      outcome: "unsold",
      winnerId: null,
      hammerPrice: 0,
    });
  });

  it("sells at the reserve when the reserve is met but resolved price is below it", () => {
    // Lone bidder: resolved price sits at START (1,000,000) but max clears reserve
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 4_000_000, createdAt: 1 },
    ];
    expect(settleLot(START, events, table, 2_500_000)).toEqual({
      outcome: "sold",
      winnerId: "A",
      hammerPrice: 2_500_000,
    });
  });

  it("sells at the resolved price when it already exceeds the reserve", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    // resolved price 3,100,000 > reserve 2,000,000
    expect(settleLot(START, events, table, 2_000_000)).toEqual({
      outcome: "sold",
      winnerId: "A",
      hammerPrice: 3_100_000,
    });
  });
});
