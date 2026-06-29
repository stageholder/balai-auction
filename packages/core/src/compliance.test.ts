import { describe, it, expect } from "vitest";
import { screenName, consignorPayoutGate, SANCTIONS_WATCHLIST } from "./compliance";

describe("screenName", () => {
  it("flags an exact (case/spacing-insensitive) watchlist name", () => {
    expect(screenName("ivan  SAMPLE sanctioned").length).toBe(1);
  });
  it("flags when the screened name has extra/reordered tokens (entry tokens ⊆ name)", () => {
    expect(screenName("Sanctioned Ivan Q Sample").length).toBe(1);
  });
  it("does not flag a clean name or a partial name", () => {
    expect(screenName("Jane Ordinary Doe")).toEqual([]);
    expect(screenName("Ivan Sample")).toEqual([]); // missing "sanctioned"
  });
  it("returns [] for an empty name", () => {
    expect(screenName("   ")).toEqual([]);
  });
});

describe("consignorPayoutGate", () => {
  const ok = { kycStatus: "approved", amlStatus: "cleared", bankCode: "BCA", accountNumber: "1", accountHolder: "X" };
  it("passes when approved + cleared + bank details present", () => {
    expect(consignorPayoutGate(ok)).toEqual({ ok: true });
  });
  it("fails on missing bank details first", () => {
    expect(consignorPayoutGate({ ...ok, accountNumber: null })).toEqual({ ok: false, reason: expect.stringMatching(/bank/i) });
  });
  it("fails when KYC not approved", () => {
    expect(consignorPayoutGate({ ...ok, kycStatus: "pending" })).toEqual({ ok: false, reason: expect.stringMatching(/kyc/i) });
  });
  it("fails when AML not cleared", () => {
    expect(consignorPayoutGate({ ...ok, amlStatus: "flagged" })).toEqual({ ok: false, reason: expect.stringMatching(/aml/i) });
  });
});
