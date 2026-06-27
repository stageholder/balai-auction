import { describe, it, expect } from "vitest";
import { DEFAULT_SELLER_COMMISSION_PCT, isValidCommissionPct } from "./commission";

describe("seller commission", () => {
  it("has a sensible house default", () => {
    expect(DEFAULT_SELLER_COMMISSION_PCT).toBe(10);
  });

  it("accepts integer percents in [0, 100]", () => {
    expect(isValidCommissionPct(0)).toBe(true);
    expect(isValidCommissionPct(10)).toBe(true);
    expect(isValidCommissionPct(100)).toBe(true);
  });

  it("rejects out-of-range and non-integer values", () => {
    expect(isValidCommissionPct(-1)).toBe(false);
    expect(isValidCommissionPct(101)).toBe(false);
    expect(isValidCommissionPct(10.5)).toBe(false);
    expect(isValidCommissionPct(Number.NaN)).toBe(false);
  });
});
