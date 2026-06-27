import type { Invoice } from "@auction/core";
import type { PrismaClient } from "@prisma/client";
import { invoiceRowToRecord, ledgerEntryRowToRecord, toDbMoney } from "../mappers";
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
 *  transaction. Returns true only if this call performed the transition. */
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
