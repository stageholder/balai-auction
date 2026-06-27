import { describe, it, expect, beforeEach } from "vitest";
import {
  settleLot,
  computeInvoice,
  type BidEvent,
  type IncrementTable,
} from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createUser } from "./users";
import { createSale } from "./sales";
import { createLot } from "./lots";
import { appendBid, getBidEventsForLot } from "./bids";
import {
  createInvoiceWithLedger,
  getInvoice,
  getLedgerEntriesForInvoice,
} from "./invoices";
import {
  getInvoiceById,
  setInvoiceXenditId,
  markInvoicePaid,
  listInvoicesForBuyer,
} from "./invoices";
import { updateLotStatus } from "./lots";

const db = testDb();
const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

beforeEach(async () => {
  await resetDb(db);
});

describe("invoices repository", () => {
  it("persists an invoice and its ledger entries from the full core pipeline", async () => {
    const sale = await createSale(db, {
      title: "Sale",
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-08T00:00:00.000Z"),
      buyersPremiumPct: 20,
      taxPct: 11,
      incrementTable,
    });
    const lot = await createLot(db, {
      saleId: sale.id,
      lotNumber: 1,
      title: "Lot 1",
      estimateLow: 1_000_000,
      estimateHigh: 2_000_000,
      startingPrice: 1_000_000,
      reserve: null,
      closesAt: new Date("2026-07-08T00:00:00.000Z"),
    });
    const a = await createUser(db, { email: "a@example.com" });
    const b = await createUser(db, { email: "b@example.com" });
    await appendBid(db, {
      lotId: lot.id,
      bidderId: a.id,
      maxAmount: 5_000_000,
      amount: 1_000_000,
    });
    await appendBid(db, {
      lotId: lot.id,
      bidderId: b.id,
      maxAmount: 3_000_000,
      amount: 1_100_000,
    });

    const events: BidEvent[] = await getBidEventsForLot(db, lot.id);
    const settlement = settleLot(
      lot.startingPrice,
      events,
      sale.incrementTable,
      lot.reserve
    );
    expect(settlement.outcome).toBe("sold");
    expect(settlement.winnerId).toBe(a.id);
    expect(settlement.hammerPrice).toBe(3_100_000);

    const invoice = computeInvoice({
      hammer: settlement.hammerPrice,
      premiumPct: sale.buyersPremiumPct,
      taxPct: sale.taxPct,
    });

    const saved = await createInvoiceWithLedger(db, {
      lotId: lot.id,
      buyerId: settlement.winnerId!,
      invoice,
    });
    expect(saved.hammer).toBe(3_100_000);
    expect(saved.premium).toBe(620_000);
    expect(saved.tax).toBe(68_200);
    expect(saved.total).toBe(3_788_200);
    expect(saved.status).toBe("pending");

    const fetched = await getInvoice(db, lot.id);
    expect(fetched?.id).toBe(saved.id);

    const entries = await getLedgerEntriesForInvoice(db, saved.id);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.party === "buyer")).toBe(true);
    expect(entries.every((e) => e.lotId === lot.id)).toBe(true);
    expect(entries.map((e) => e.kind).sort()).toEqual([
      "hammer",
      "premium",
      "tax",
    ]);
  });
});

async function soldLotWithInvoice() {
  const sale = await createSale(db, {
    title: "Sale",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });
  const lot = await createLot(db, {
    saleId: sale.id,
    lotNumber: 1,
    title: "Lot 1",
    estimateLow: 1_000_000,
    estimateHigh: 2_000_000,
    startingPrice: 1_000_000,
    reserve: null,
    closesAt: new Date("2026-07-08T00:00:00.000Z"),
  });
  const buyer = await createUser(db, { email: "buyer@example.com" });
  await updateLotStatus(db, lot.id, "sold");
  const invoice = await createInvoiceWithLedger(db, {
    lotId: lot.id,
    buyerId: buyer.id,
    invoice: {
      hammer: 3_100_000,
      premium: 620_000,
      tax: 68_200,
      total: 3_788_200,
      entries: [
        { party: "buyer", kind: "hammer", amount: 3_100_000 },
        { party: "buyer", kind: "premium", amount: 620_000 },
        { party: "buyer", kind: "tax", amount: 68_200 },
      ],
    },
  });
  return { lot, buyer, invoice };
}

describe("invoice payment repositories", () => {
  it("gets an invoice by id and stores the Xendit id", async () => {
    const { invoice } = await soldLotWithInvoice();
    expect((await getInvoiceById(db, invoice.id))?.id).toBe(invoice.id);

    const updated = await setInvoiceXenditId(db, invoice.id, "xnd-inv-123");
    expect(updated.xenditInvoiceId).toBe("xnd-inv-123");
  });

  it("marks an invoice paid and flips the lot to paid (idempotently)", async () => {
    const { lot, invoice } = await soldLotWithInvoice();

    const first = await markInvoicePaid(db, invoice.id);
    expect(first).toBe(true);
    expect((await getInvoiceById(db, invoice.id))?.status).toBe("paid");
    const { getLot } = await import("./lots");
    expect((await getLot(db, lot.id))?.status).toBe("paid");

    // Duplicate webhook delivery is a no-op.
    const second = await markInvoicePaid(db, invoice.id);
    expect(second).toBe(false);
    expect((await getInvoiceById(db, invoice.id))?.status).toBe("paid");
  });

  it("returns false when marking an unknown invoice id", async () => {
    expect(
      await markInvoicePaid(db, "00000000-0000-0000-0000-000000000000")
    ).toBe(false);
  });

  it("lists a buyer's invoices with the lot title, newest first", async () => {
    const { buyer } = await soldLotWithInvoice();
    const list = await listInvoicesForBuyer(db, buyer.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.lotTitle).toBe("Lot 1");
    expect(list[0]?.total).toBe(3_788_200);
    expect(list[0]?.status).toBe("pending");
  });
});

async function consignedSoldLotWithInvoice() {
  const consignor = await createUser(db, {
    email: "consignor@example.com",
    role: "consignor",
  });
  const sale = await createSale(db, {
    title: "Sale",
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
  return { lot, consignor, buyer, invoice, sale };
}

describe("markInvoicePaid seller settlement", () => {
  it("writes seller+house ledger entries and a pending payout for a consigned lot", async () => {
    const { lot, invoice } = await consignedSoldLotWithInvoice();

    const ok = await markInvoicePaid(db, invoice.id);
    expect(ok).toBe(true);

    const payout = await db.payout.findUnique({ where: { lotId: lot.id } });
    expect(payout?.status).toBe("pending");
    expect(Number(payout?.amount)).toBe(900_000); // hammer - 10%

    const entries = await getLedgerEntriesForInvoice(db, invoice.id);
    expect(
      entries.some(
        (e) => e.party === "seller" && e.kind === "hammer" && e.amount === 1_000_000
      )
    ).toBe(true);
    expect(
      entries.some(
        (e) => e.party === "house" && e.kind === "commission" && e.amount === 100_000
      )
    ).toBe(true);
  });

  it("creates NO payout for a non-consigned lot", async () => {
    const { lot, invoice } = await soldLotWithInvoice();
    await markInvoicePaid(db, invoice.id);
    expect(await db.payout.findUnique({ where: { lotId: lot.id } })).toBeNull();
  });

  it("is idempotent — a second markInvoicePaid does not double-settle", async () => {
    const { lot, invoice } = await consignedSoldLotWithInvoice();
    await markInvoicePaid(db, invoice.id);
    const second = await markInvoicePaid(db, invoice.id);
    expect(second).toBe(false);
    expect(await db.payout.count({ where: { lotId: lot.id } })).toBe(1);
  });
});
