import { describe, it, expect } from "vitest";
import { CORE_VERSION } from "./index";

describe("core package", () => {
  it("is importable and exposes a version", () => {
    expect(CORE_VERSION).toBe("0.0.0");
  });
});
