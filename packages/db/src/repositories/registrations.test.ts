import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createUser } from "./users";
import { createSale } from "./sales";
import {
  createRegistration,
  getRegistration,
  setRegistrationKyc,
} from "./registrations";

const db = testDb();
const incrementTable: IncrementTable = [{ upTo: null, step: 100_000 }];

async function scaffold() {
  const user = await createUser(db, { email: "buyer@example.com" });
  const sale = await createSale(db, {
    title: "Sale",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });
  return { user, sale };
}

beforeEach(async () => {
  await resetDb(db);
});

describe("registrations repository", () => {
  it("creates a pending registration and reads it by user+sale", async () => {
    const { user, sale } = await scaffold();
    const reg = await createRegistration(db, {
      userId: user.id,
      saleId: sale.id,
      xenditCardToken: "tok_123",
    });
    expect(reg.kycStatus).toBe("pending");
    expect(reg.xenditCardToken).toBe("tok_123");

    const fetched = await getRegistration(db, user.id, sale.id);
    expect(fetched?.id).toBe(reg.id);
  });

  it("approves a registration", async () => {
    const { user, sale } = await scaffold();
    const reg = await createRegistration(db, {
      userId: user.id,
      saleId: sale.id,
    });
    const approved = await setRegistrationKyc(db, reg.id, "approved");
    expect(approved.kycStatus).toBe("approved");
  });

  it("rejects a duplicate registration for the same user and sale", async () => {
    const { user, sale } = await scaffold();
    await createRegistration(db, { userId: user.id, saleId: sale.id });
    await expect(
      createRegistration(db, { userId: user.id, saleId: sale.id })
    ).rejects.toThrow();
  });
});
