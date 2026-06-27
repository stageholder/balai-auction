import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../test/testDb";
import { createUser, getUser } from "./users";
import { upsertUserById, updateUserProfile } from "./users";

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
