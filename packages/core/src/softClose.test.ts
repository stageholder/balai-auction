import { describe, it, expect } from "vitest";
import { applySoftClose } from "./softClose";

const WINDOW = 2 * 60_000; // 2 minutes in ms

describe("applySoftClose", () => {
  it("does not extend when the bid is well before the close window", () => {
    const closesAt = 1_000_000;
    const bidAt = closesAt - WINDOW - 1; // just outside the window
    expect(applySoftClose(closesAt, bidAt, WINDOW)).toBe(closesAt);
  });

  it("extends to bidAt + window when the bid lands inside the window", () => {
    const closesAt = 1_000_000;
    const bidAt = closesAt - 30_000; // 30s before close
    expect(applySoftClose(closesAt, bidAt, WINDOW)).toBe(bidAt + WINDOW);
  });

  it("extends when the bid lands exactly at the window boundary", () => {
    const closesAt = 1_000_000;
    const bidAt = closesAt - WINDOW;
    expect(applySoftClose(closesAt, bidAt, WINDOW)).toBe(bidAt + WINDOW);
  });

  it("ignores bids at or after the close time", () => {
    const closesAt = 1_000_000;
    expect(applySoftClose(closesAt, closesAt, WINDOW)).toBe(closesAt);
    expect(applySoftClose(closesAt, closesAt + 5, WINDOW)).toBe(closesAt);
  });
});
