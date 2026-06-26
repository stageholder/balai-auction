import { describe, it, expect } from "vitest";
import { minIncrement, minNextBid } from "./increments";
import type { IncrementTable } from "./types";

// Rupiah brackets: <1,000,000 step 50,000; <5,000,000 step 100,000; else 250,000
const table: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

describe("minIncrement", () => {
  it("returns the step for the bracket containing the price", () => {
    expect(minIncrement(0, table)).toBe(50_000);
    expect(minIncrement(999_999, table)).toBe(50_000);
    expect(minIncrement(1_000_000, table)).toBe(100_000);
    expect(minIncrement(4_999_999, table)).toBe(100_000);
    expect(minIncrement(5_000_000, table)).toBe(250_000);
    expect(minIncrement(50_000_000, table)).toBe(250_000);
  });

  it("throws if the table has no open final bracket", () => {
    const bad: IncrementTable = [{ upTo: 1_000_000, step: 50_000 }];
    expect(() => minIncrement(2_000_000, bad)).toThrow();
  });
});

describe("minNextBid", () => {
  it("adds the current bracket's increment to the current price", () => {
    expect(minNextBid(500_000, table)).toBe(550_000);
    expect(minNextBid(1_000_000, table)).toBe(1_100_000);
  });
});
