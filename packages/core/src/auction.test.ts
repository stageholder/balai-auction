import { describe, it, expect } from "vitest";
import { resolveBids } from "./auction";
import type { BidEvent, IncrementTable } from "./types";

const table: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];
const START = 1_000_000;

describe("resolveBids", () => {
  it("returns no winner at the starting price when there are no bids", () => {
    expect(resolveBids(START, [], table)).toEqual({
      winnerId: null,
      currentPrice: START,
      contested: false,
    });
  });

  it("keeps the price at the opening for a lone bidder", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
    ];
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: START,
      contested: false,
    });
  });

  it("sets price to second max plus one increment when contested", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    // increment at 3,000,000 is 100,000 → 3,100,000, below A's max
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: 3_100_000,
      contested: true,
    });
  });

  it("caps the price at the winner's own max", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 3_050_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    // 3,000,000 + 100,000 = 3,100,000 > A's max → cap at 3,050,000
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: 3_050_000,
      contested: true,
    });
  });

  it("awards a tie in max to the earlier bidder at that max", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 3_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: 3_000_000,
      contested: true,
    });
  });

  it("uses a bidder's highest max across multiple of their own bids", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 2_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
      { bidderId: "A", maxAmount: 6_000_000, createdAt: 3 },
    ];
    // A leads with 6,000,000; second max 3,000,000 + 100,000 = 3,100,000
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: 3_100_000,
      contested: true,
    });
  });

  it("treats a lone bidder below the starting price as no bid", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 500_000, createdAt: 1 },
    ];
    // 500,000 < 1,000,000 → invalid bid → no winner
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: null,
      currentPrice: START,
      contested: false,
    });
  });

  it("ignores a below-start bid when mixed with a valid bid", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 500_000, createdAt: 2 },
    ];
    // B's bid is below starting price → filtered; only A remains → lone valid bidder
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: START,
      contested: false,
    });
  });
});
