import { describe, it, expect } from "vitest";
import { settleLot } from "./settlement";
import { computeInvoice } from "./invoice";
import type { BidEvent, IncrementTable } from "./types";

const table: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

describe("settleLot → computeInvoice contract", () => {
  it("produces correct hammer, premium, tax and total for a contested lot", () => {
    const startingPrice = 1_000_000;
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];

    // Step 1: settle the lot (reserve = null)
    // A wins; second max 3,000,000 + increment(100,000) = 3,100,000 < A's max
    // → hammerPrice = 3,100,000
    const settlement = settleLot(startingPrice, events, table, null);
    expect(settlement).toEqual({
      outcome: "sold",
      winnerId: "A",
      hammerPrice: 3_100_000,
    });

    // Step 2: compute the invoice from the hammer price
    // premium = round(3,100,000 × 20 / 100) = 620,000
    // tax     = round(620,000 × 11 / 100)   = 68,200
    // total   = 3,100,000 + 620,000 + 68,200 = 3,788,200
    const invoice = computeInvoice({
      hammer: settlement.hammerPrice,
      premiumPct: 20,
      taxPct: 11,
    });

    expect(invoice).toEqual({
      hammer: 3_100_000,
      premium: 620_000,
      tax: 68_200,
      total: 3_788_200,
      entries: [
        { party: "buyer", kind: "hammer", amount: 3_100_000 },
        { party: "buyer", kind: "premium", amount: 620_000 },
        { party: "buyer", kind: "tax", amount: 68_200 },
      ],
    });
  });
});
