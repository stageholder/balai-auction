import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../test/testDb";
import { createUser, getUser } from "./users";
import { upsertUserById, updateUserProfile, listUsers, setUserRole, listConsignors, setConsignorPayoutAccount, submitConsignorKyc, setConsignorKycStatus, setConsignorAml, listConsignorsForReview } from "./users";

const db = testDb();

beforeEach(async () => {
  await resetDb(db);
});

describe("users repository", () => {
  it("creates a buyer by default and reads it back", async () => {
    const created = await createUser(db, { email: "buyer@example.com" });
    expect(created.email).toBe("buyer@example.com");
    expect(created.role).toBe("buyer");
    expect(created.id).toMatch(/[0-9a-f-]{36}/);

    const fetched = await getUser(db, created.id);
    expect(fetched).toEqual(created);
  });

  it("creates a staff user when role is given", async () => {
    const created = await createUser(db, {
      email: "staff@example.com",
      role: "staff",
    });
    expect(created.role).toBe("staff");
  });

  it("returns null for an unknown id", async () => {
    expect(await getUser(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("upsertUserById", () => {
  it("creates a user with a caller-supplied id (Supabase uid)", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const u = await upsertUserById(db, { id, email: "sb@example.com" });
    expect(u.id).toBe(id);
    expect(u.email).toBe("sb@example.com");
    expect(u.role).toBe("buyer");
    expect(u.legalName).toBeNull();
  });

  it("is idempotent and updates email on repeat", async () => {
    const id = "22222222-2222-2222-2222-222222222222";
    await upsertUserById(db, { id, email: "old@example.com" });
    const again = await upsertUserById(db, { id, email: "new@example.com" });
    expect(again.id).toBe(id);
    expect(again.email).toBe("new@example.com");
    expect(await db.user.count()).toBe(1);
  });
});

describe("updateUserProfile", () => {
  it("sets legalName and phone", async () => {
    const id = "33333333-3333-3333-3333-333333333333";
    await upsertUserById(db, { id, email: "p@example.com" });
    const updated = await updateUserProfile(db, id, {
      legalName: "Sukarno Putra",
      phone: "+6281234567890",
    });
    expect(updated.legalName).toBe("Sukarno Putra");
    expect(updated.phone).toBe("+6281234567890");
  });
});

describe("listUsers / setUserRole", () => {
  it("lists users and promotes one to staff", async () => {
    const a = await createUser(db, { email: "a@example.com" });
    await createUser(db, { email: "b@example.com" });
    expect((await listUsers(db)).length).toBe(2);

    const promoted = await setUserRole(db, a.id, "staff");
    expect(promoted.role).toBe("staff");
  });
});

describe("listConsignors", () => {
  it("returns only consignor-role users", async () => {
    await createUser(db, { email: "buyer@example.com" }); // default role buyer
    const c1 = await createUser(db, { email: "c1@example.com", role: "consignor" });
    const c2 = await createUser(db, { email: "c2@example.com", role: "consignor" });
    const ids = (await listConsignors(db)).map((u) => u.id).sort();
    expect(ids).toEqual([c1.id, c2.id].sort());
  });
});

describe("setConsignorPayoutAccount", () => {
  it("sets the three payout fields and they round-trip via the user record", async () => {
    const user = await createUser(db, { email: "seller@example.com", role: "consignor" });
    const updated = await setConsignorPayoutAccount(db, user.id, {
      bankCode: "BCA",
      accountNumber: "1234567890",
      accountHolder: "Budi Santoso",
    });
    expect(updated.payoutBankCode).toBe("BCA");
    expect(updated.payoutAccountNumber).toBe("1234567890");
    expect(updated.payoutAccountHolder).toBe("Budi Santoso");

    const fetched = await getUser(db, user.id);
    expect(fetched?.payoutBankCode).toBe("BCA");
    expect(fetched?.payoutAccountNumber).toBe("1234567890");
    expect(fetched?.payoutAccountHolder).toBe("Budi Santoso");
  });
});

describe("consignor KYC/AML", () => {
  it("self-submit sets identity + bank details and pending KYC", async () => {
    const u = await createUser(db, { email: "c@example.com", role: "consignor" });
    const r = await submitConsignorKyc(db, u.id, {
      legalName: "Jane Consignor", idType: "passport", idNumber: "X123",
      bankCode: "BCA", accountNumber: "111", accountHolder: "Jane Consignor",
    });
    expect(r.consignorLegalName).toBe("Jane Consignor");
    expect(r.consignorKycStatus).toBe("pending");
    expect(r.payoutBankCode).toBe("BCA");
  });
  it("staff transitions KYC and AML", async () => {
    const u = await createUser(db, { email: "c2@example.com", role: "consignor" });
    expect((await setConsignorKycStatus(db, u.id, "approved")).consignorKycStatus).toBe("approved");
    const amled = await setConsignorAml(db, u.id, { amlStatus: "cleared", amlNote: "ok" });
    expect(amled.consignorAmlStatus).toBe("cleared");
  });
  it("listConsignorsForReview returns only consignor-role users", async () => {
    await createUser(db, { email: "buyer@example.com" });
    const c = await createUser(db, { email: "c3@example.com", role: "consignor" });
    expect((await listConsignorsForReview(db)).map((x) => x.id)).toContain(c.id);
    expect((await listConsignorsForReview(db)).every((x) => x.role === "consignor")).toBe(true);
  });
});
