import { describe, it, expect } from "vitest";
import { formatRupiah } from "./format";

describe("formatRupiah", () => {
  it("formats whole rupiah with id-ID grouping and no decimals", () => {
    expect(formatRupiah(3_100_000)).toMatch(/^Rp\s?3\.100\.000$/);
  });

  it("formats zero", () => {
    expect(formatRupiah(0)).toMatch(/^Rp\s?0$/);
  });

  it("formats large values", () => {
    expect(formatRupiah(12_220_000)).toMatch(/^Rp\s?12\.220\.000$/);
  });
});
