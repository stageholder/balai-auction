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
