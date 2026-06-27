import type { Invoice } from "@auction/core";
import { computeSellerSettlement } from "@auction/core";
import type { PrismaClient } from "@prisma/client";
import { invoiceRowToRecord, ledgerEntryRowToRecord, toDbMoney, toMoney } from "../mappers";
import type { InvoiceRecord, LedgerEntryRecord } from "../types";

export async function createInvoiceWithLedger(
  db: PrismaClient,
  input: { lotId: string; buyerId: string; invoice: Invoice }
): Promise<InvoiceRecord> {
  const { lotId, buyerId, invoice } = input;
  const row = await db.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        lotId,
        buyerId,
        hammer: toDbMoney(invoice.hammer),
        premium: toDbMoney(invoice.premium),
        tax: toDbMoney(invoice.tax),
        total: toDbMoney(invoice.total),
      },
    });
    await tx.ledgerEntry.createMany({
      data: invoice.entries.map((entry) => ({
        invoiceId: created.id,
        lotId,
        party: entry.party,
        kind: entry.kind,
        amount: toDbMoney(entry.amount),
      })),
    });
    return created;
  });
  return invoiceRowToRecord(row);
}

export async function getInvoice(
  db: PrismaClient,
  lotId: string
): Promise<InvoiceRecord | null> {
  const row = await db.invoice.findUnique({ where: { lotId } });
  return row ? invoiceRowToRecord(row) : null;
}

export async function getLedgerEntriesForInvoice(
  db: PrismaClient,
  invoiceId: string
): Promise<LedgerEntryRecord[]> {
  const rows = await db.ledgerEntry.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(ledgerEntryRowToRecord);
}

import type { BuyerInvoiceView } from "../types";

export async function getInvoiceById(
  db: PrismaClient,
  id: string
): Promise<InvoiceRecord | null> {
  const row = await db.invoice.findUnique({ where: { id } });
  return row ? invoiceRowToRecord(row) : null;
}

export async function setInvoiceXenditId(
  db: PrismaClient,
  id: string,
  xenditInvoiceId: string
): Promise<InvoiceRecord> {
  const row = await db.invoice.update({
    where: { id },
    data: { xenditInvoiceId },
  });
  return invoiceRowToRecord(row);
}

/** Idempotently mark an invoice paid and flip its lot to paid, in one
 *  transaction. Returns true only if this call performed the transition.
 *  For consigned lots, also writes seller+house ledger entries and creates
 *  a pending Payout (idempotent — the pending→paid claim and Payout.lotId
 *  @unique together ensure at-most-once settlement). */
export async function markInvoicePaid(
  db: PrismaClient,
  id: string
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id } });
    if (!invoice) return false;
    const claim = await tx.invoice.updateMany({
      where: { id, status: "pending" },
      data: { status: "paid" },
    });
    if (claim.count === 0) return false; // already paid/refunded
    await tx.lot.update({
      where: { id: invoice.lotId },
      data: { status: "paid" },
    });

    // Seller settlement — only for consigned lots.
    const lot = await tx.lot.findUnique({ where: { id: invoice.lotId } });
    if (lot?.consignorId) {
      const sale = await tx.sale.findUnique({ where: { id: lot.saleId } });
      if (sale) {
        const settlement = computeSellerSettlement({
          hammer: toMoney(invoice.hammer),
          sellerCommissionPct: sale.sellerCommissionPct,
        });
        await tx.ledgerEntry.createMany({
          data: settlement.entries.map((e) => ({
            invoiceId: invoice.id,
            lotId: lot.id,
            party: e.party,
            kind: e.kind,
            amount: toDbMoney(e.amount),
          })),
        });
        await tx.payout.create({
          data: {
            lotId: lot.id,
            consignorId: lot.consignorId,
            amount: toDbMoney(settlement.consignorNet),
            status: "pending",
          },
        });
      }
    }

    return true;
  });
}

export async function listInvoicesForBuyer(
  db: PrismaClient,
  buyerId: string
): Promise<BuyerInvoiceView[]> {
  const rows = await db.invoice.findMany({
    where: { buyerId },
    orderBy: { createdAt: "desc" },
    include: { lot: { select: { title: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    lotId: r.lotId,
    lotTitle: r.lot.title,
    total: Number(r.total),
    status: r.status as BuyerInvoiceView["status"],
    createdAt: r.createdAt,
  }));
}
