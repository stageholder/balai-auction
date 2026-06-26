import { describe, it, expect } from "vitest";
import {
  toMoney,
  toDbMoney,
  toIncrementTable,
  bidRowToEvent,
} from "./mappers";

describe("toMoney / toDbMoney", () => {
  it("round-trips an integer rupiah value", () => {
    expect(toMoney(2_000_000n)).toBe(2_000_000);
    expect(toDbMoney(2_000_000)).toBe(2_000_000n);
  });

  it("throws if a stored value exceeds the safe integer range", () => {
    const tooBig = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(() => toMoney(tooBig)).toThrow();
  });

  it("throws if asked to store a non-integer", () => {
    expect(() => toDbMoney(1.5)).toThrow();
  });
});

describe("toIncrementTable", () => {
  it("parses a JSON array of brackets into an IncrementTable", () => {
    const json = [
      { upTo: 1_000_000, step: 50_000 },
      { upTo: null, step: 250_000 },
    ];
    expect(toIncrementTable(json)).toEqual([
      { upTo: 1_000_000, step: 50_000 },
      { upTo: null, step: 250_000 },
    ]);
  });

  it("throws on a non-array value", () => {
    expect(() => toIncrementTable({ nope: true })).toThrow();
  });
});

describe("bidRowToEvent", () => {
  it("maps a Bid row to a core BidEvent (createdAt to epoch ms)", () => {
    const when = new Date("2026-06-27T00:00:00.000Z");
    expect(
      bidRowToEvent({ bidderId: "A", maxAmount: 3_000_000n, createdAt: when })
    ).toEqual({
      bidderId: "A",
      maxAmount: 3_000_000,
      createdAt: when.getTime(),
    });
  });
});
