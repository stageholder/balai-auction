import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./test/testDb";

describe("database connectivity", () => {
  beforeEach(async () => {
    await resetDb(testDb());
  });

  it("connects and runs a trivial query", async () => {
    const rows = await testDb().$queryRawUnsafe<{ ok: number }[]>(
      "SELECT 1 as ok"
    );
    expect(rows[0]?.ok).toBe(1);
  });

  it("has the migrated tables and they start empty", async () => {
    expect(await testDb().user.count()).toBe(0);
    expect(await testDb().sale.count()).toBe(0);
    expect(await testDb().lot.count()).toBe(0);
  });
});
