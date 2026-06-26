import { describe, it, expect } from "vitest";
import { computeInvoice } from "./invoice";

describe("computeInvoice", () => {
  it("applies a 20% premium and 11% PPN on the premium", () => {
    const inv = computeInvoice({
      hammer: 10_000_000,
      premiumPct: 20,
      taxPct: 11,
    });
    // premium = 2,000,000; tax = 220,000; total = 12,220,000
    expect(inv).toEqual({
      hammer: 10_000_000,
      premium: 2_000_000,
      tax: 220_000,
      total: 12_220_000,
      entries: [
        { party: "buyer", kind: "hammer", amount: 10_000_000 },
        { party: "buyer", kind: "premium", amount: 2_000_000 },
        { party: "buyer", kind: "tax", amount: 220_000 },
      ],
    });
  });

  it("rounds premium and tax to whole rupiah", () => {
    const inv = computeInvoice({
      hammer: 3_333_333,
      premiumPct: 20,
      taxPct: 11,
    });
    // premium = round(666,666.6) = 666,667; tax = round(73,333.37) = 73,333
    expect(inv.premium).toBe(666_667);
    expect(inv.tax).toBe(73_333);
    expect(inv.total).toBe(3_333_333 + 666_667 + 73_333);
  });

  it("handles a zero tax rate", () => {
    const inv = computeInvoice({ hammer: 1_000_000, premiumPct: 20, taxPct: 0 });
    expect(inv.tax).toBe(0);
    expect(inv.total).toBe(1_200_000);
  });
});
