import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../test/testDb";
import {
  createConsignmentRequest,
  listConsignmentRequests,
  setConsignmentRequestStatus,
} from "./consignment-requests";

const db = testDb();
beforeEach(async () => {
  await resetDb(db);
});

describe("consignment requests", () => {
  it("creates a request with defaults (pending, null optionals)", async () => {
    const r = await createConsignmentRequest(db, {
      name: "Jane Seller",
      email: "jane@example.com",
      itemTitle: "A bronze figure",
      itemDescription: "circa 1900, good condition",
    });
    expect(r.status).toBe("pending");
    expect(r.phone).toBeNull();
    expect(r.category).toBeNull();
    expect(r.sellerEstimate).toBeNull();
    expect(r.name).toBe("Jane Seller");
  });

  it("round-trips optional fields + transitions status", async () => {
    const r = await createConsignmentRequest(db, {
      name: "Bo",
      email: "bo@example.com",
      phone: "0812",
      category: "watches",
      itemTitle: "A Daytona",
      itemDescription: "ref 116500",
      sellerEstimate: 50_000_000,
    });
    expect(r.category).toBe("watches");
    expect(r.sellerEstimate).toBe(50_000_000);

    const upd = await setConsignmentRequestStatus(db, r.id, "accepted");
    expect(upd.status).toBe("accepted");
  });

  it("lists newest first", async () => {
    const a = await createConsignmentRequest(db, {
      name: "A",
      email: "a@x.com",
      itemTitle: "A",
      itemDescription: "a",
    });
    const b = await createConsignmentRequest(db, {
      name: "B",
      email: "b@x.com",
      itemTitle: "B",
      itemDescription: "b",
    });
    expect((await listConsignmentRequests(db)).map((x) => x.id)).toEqual([
      b.id,
      a.id,
    ]);
  });
});
