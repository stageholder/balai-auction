import { describe, it, expect, beforeEach } from "vitest";
import { isPaidXenditStatus, verifyCallbackToken } from "./xendit";

describe("isPaidXenditStatus", () => {
  it("is true for PAID and SETTLED", () => {
    expect(isPaidXenditStatus("PAID")).toBe(true);
    expect(isPaidXenditStatus("SETTLED")).toBe(true);
  });
  it("is false for other statuses", () => {
    expect(isPaidXenditStatus("PENDING")).toBe(false);
    expect(isPaidXenditStatus("EXPIRED")).toBe(false);
  });
});

describe("verifyCallbackToken", () => {
  beforeEach(() => {
    process.env.XENDIT_CALLBACK_TOKEN = "secret-token";
  });
  it("accepts the matching token", () => {
    expect(verifyCallbackToken("secret-token")).toBe(true);
  });
  it("rejects a wrong or missing token", () => {
    expect(verifyCallbackToken("nope")).toBe(false);
    expect(verifyCallbackToken(null)).toBe(false);
  });
  it("rejects when no token is configured", () => {
    delete process.env.XENDIT_CALLBACK_TOKEN;
    expect(verifyCallbackToken("anything")).toBe(false);
  });
});
