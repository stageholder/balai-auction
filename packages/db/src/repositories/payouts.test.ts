import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../test/testDb";
import { createUser } from "./users";
import { createSale } from "./sales";
import { createLot } from "./lots";
import { updateLotStatus } from "./lots";
import { createInvoiceWithLedger, markInvoicePaid } from "./invoices";
import {
  listPayouts,
  getPayout,
  releasePayout,
  markPayoutPaid,
  markPayoutFailed,
} from "./payouts";

const db = testDb();

const incrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

beforeEach(async () => {
  await resetDb(db);
});

/** Seed: consigned lot, invoice created, markInvoicePaid → pending Payout exists */
async function consignedPaidSetup() {
  const consignor = await createUser(db, {
    email: "consignor@example.com",
    role: "consignor",
  });
  const sale = await createSale(db, {
    title: "Sale A",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    sellerCommissionPct: 10,
    incrementTable,
  });
  const lot = await createLot(db, {
    saleId: sale.id,
    lotNumber: 1,
    title: "Lot 1",
    estimateLow: 500_000,
    estimateHigh: 2_000_000,
    startingPrice: 500_000,
    reserve: null,
    closesAt: new Date("2026-07-08T00:00:00.000Z"),
    consignorId: consignor.id,
  });
  const buyer = await createUser(db, { email: "buyer@example.com" });
  await updateLotStatus(db, lot.id, "sold");
  const invoice = await createInvoiceWithLedger(db, {
    lotId: lot.id,
    buyerId: buyer.id,
    invoice: {
      hammer: 1_000_000,
      premium: 200_000,
      tax: 22_000,
      total: 1_222_000,
      entries: [
        { party: "buyer", kind: "hammer", amount: 1_000_000 },
        { party: "buyer", kind: "premium", amount: 200_000 },
        { party: "buyer", kind: "tax", amount: 22_000 },
      ],
    },
  });
  // Mark invoice paid → creates the pending Payout
  await markInvoicePaid(db, invoice.id);
  return { consignor, lot, buyer, invoice };
}

describe("listPayouts", () => {
  it("returns a pending payout item with correct statement math and consignor info", async () => {
    const { consignor, lot } = await consignedPaidSetup();
    const list = await listPayouts(db);
    expect(list).toHaveLength(1);
    const item = list[0]!;
    expect(item.lotId).toBe(lot.id);
    expect(item.lotNumber).toBe(1);
    expect(item.lotTitle).toBe("Lot 1");
    expect(item.consignorId).toBe(consignor.id);
    expect(item.consignorEmail).toBe("consignor@example.com");
    expect(item.hasBankDetails).toBe(false);
    expect(item.status).toBe("pending");
    expect(item.hammer).toBe(1_000_000);
    expect(item.net).toBe(900_000);           // consignorNet = hammer − 10%
    expect(item.commission).toBe(100_000);    // hammer − net
    expect(item.xenditDisbursementId).toBeNull();
  });
});

describe("getPayout", () => {
  it("fetches a payout record by id", async () => {
    await consignedPaidSetup();
    const raw = await db.payout.findFirst();
    const record = await getPayout(db, raw!.id);
    expect(record?.id).toBe(raw!.id);
    expect(record?.status).toBe("pending");
    expect(record?.amount).toBe(900_000);
  });

  it("returns null for an unknown id", async () => {
    expect(
      await getPayout(db, "00000000-0000-0000-0000-000000000000")
    ).toBeNull();
  });
});

describe("releasePayout", () => {
  it("transitions pending→released with the disbursement id set, and is idempotent", async () => {
    await consignedPaidSetup();
    const raw = await db.payout.findFirst();

    const released = await releasePayout(db, raw!.id, "disb_1");
    expect(released?.status).toBe("released");
    expect(released?.xenditDisbursementId).toBe("disb_1");
    expect(released?.releasedAt).toBeInstanceOf(Date);

    // Second call on the same id → null (guard: no longer pending)
    const second = await releasePayout(db, raw!.id, "disb_1");
    expect(second).toBeNull();
  });
});

describe("markPayoutPaid", () => {
  it("transitions released→paid, writes seller payout ledger entry, is idempotent", async () => {
    const { lot } = await consignedPaidSetup();
    const raw = await db.payout.findFirst();
    await releasePayout(db, raw!.id, "disb_1");

    const ok = await markPayoutPaid(db, "disb_1");
    expect(ok).toBe(true);

    const updated = await getPayout(db, raw!.id);
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAt).toBeInstanceOf(Date);

    // Seller payout ledger entry must exist for the lot
    const entry = await db.ledgerEntry.findFirst({
      where: { lotId: lot.id, party: "seller", kind: "payout" },
    });
    expect(entry).not.toBeNull();
    expect(Number(entry!.amount)).toBe(900_000);

    // Second call → false (guard: no longer released)
    expect(await markPayoutPaid(db, "disb_1")).toBe(false);
  });
});

describe("markPayoutFailed", () => {
  it("transitions released→failed via xenditDisbursementId", async () => {
    await consignedPaidSetup();
    const raw = await db.payout.findFirst();
    await releasePayout(db, raw!.id, "disb_2");

    const ok = await markPayoutFailed(db, "disb_2");
    expect(ok).toBe(true);

    const updated = await getPayout(db, raw!.id);
    expect(updated?.status).toBe("failed");
  });

  it("returns false for an unknown disbursement id", async () => {
    expect(await markPayoutFailed(db, "disb_unknown")).toBe(false);
  });
});
