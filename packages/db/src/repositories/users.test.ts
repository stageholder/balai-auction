import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../test/testDb";
import { createUser, getUser } from "./users";

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
