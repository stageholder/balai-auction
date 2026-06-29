import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  isPaidXenditStatus,
  verifyCallbackToken,
  createDisbursement,
  isCompletedDisbursementStatus,
  isFailedDisbursementStatus,
} from "./xendit";

afterEach(() => vi.restoreAllMocks());

describe("createDisbursement", () => {
  it("POSTs a disbursement with idempotency + bank details", async () => {
    process.env.XENDIT_SECRET_KEY = "test-secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "disb_1", status: "PENDING" }), { status: 200 })
    );
    const out = await createDisbursement({
      externalId: "payout-abc",
      amount: 900_000,
      bankCode: "BCA",
      accountHolderName: "Jane Doe",
      accountNumber: "1234567890",
      description: "Consignor payout",
    });
    expect(out).toEqual({ id: "disb_1", status: "PENDING" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/disbursements$/);
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(headers["X-IDEMPOTENCY-KEY"]).toBe("payout-abc");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      external_id: "payout-abc",
      amount: 900_000,
      bank_code: "BCA",
      account_holder_name: "Jane Doe",
      account_number: "1234567890",
    });
  });

  it("throws on a non-ok response", async () => {
    process.env.XENDIT_SECRET_KEY = "test-secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 400 }));
    await expect(
      createDisbursement({
        externalId: "payout-x", amount: 1, bankCode: "BCA",
        accountHolderName: "X", accountNumber: "1", description: "d",
      })
    ).rejects.toThrow();
  });
});

describe("disbursement status helpers", () => {
  it("classifies COMPLETED and FAILED", () => {
    expect(isCompletedDisbursementStatus("COMPLETED")).toBe(true);
    expect(isCompletedDisbursementStatus("PENDING")).toBe(false);
    expect(isFailedDisbursementStatus("FAILED")).toBe(true);
    expect(isFailedDisbursementStatus("COMPLETED")).toBe(false);
  });
});

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
