import { describe, it, expect } from "vitest";
import {
  softCloseWindowMs,
  TIMED_SOFT_CLOSE_MS,
  LIVE_SOFT_CLOSE_MS,
} from "./timing";

describe("softCloseWindowMs", () => {
  it("uses the 2-minute window for timed sales", () => {
    expect(softCloseWindowMs("timed")).toBe(TIMED_SOFT_CLOSE_MS);
    expect(TIMED_SOFT_CLOSE_MS).toBe(120000);
  });
  it("uses the short window for live sales", () => {
    expect(softCloseWindowMs("live")).toBe(LIVE_SOFT_CLOSE_MS);
    expect(LIVE_SOFT_CLOSE_MS).toBe(12000);
  });
});
