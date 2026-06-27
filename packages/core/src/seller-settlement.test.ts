import { describe, it, expect } from "vitest";
import { computeSellerSettlement } from "./seller-settlement";

describe("computeSellerSettlement", () => {
  it("splits hammer into consignor net + house commission", () => {
    const s = computeSellerSettlement({ hammer: 1_000_000, sellerCommissionPct: 10 });
    expect(s.sellerCommission).toBe(100_000);
    expect(s.consignorNet).toBe(900_000);
    expect(s.entries).toEqual([
      { party: "seller", kind: "hammer", amount: 1_000_000 },
      { party: "house", kind: "commission", amount: 100_000 },
    ]);
  });

  it("rounds the commission to the nearest rupiah", () => {
    const s = computeSellerSettlement({ hammer: 1_000_005, sellerCommissionPct: 10 });
    expect(s.sellerCommission).toBe(100_001); // round(100000.5)
    expect(s.consignorNet).toBe(900_004);
  });

  it("handles 0% and 100% edges", () => {
    const zero = computeSellerSettlement({ hammer: 500_000, sellerCommissionPct: 0 });
    expect(zero.sellerCommission).toBe(0);
    expect(zero.consignorNet).toBe(500_000);

    const full = computeSellerSettlement({ hammer: 500_000, sellerCommissionPct: 100 });
    expect(full.sellerCommission).toBe(500_000);
    expect(full.consignorNet).toBe(0);
  });
});
