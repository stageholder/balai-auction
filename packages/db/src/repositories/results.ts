import type { PrismaClient } from "@prisma/client";
import type { SaleResultRow } from "../types";

export async function getSaleResults(
  db: PrismaClient,
  saleId: string
): Promise<SaleResultRow[]> {
  const rows = await db.lot.findMany({
    where: { saleId },
    orderBy: { lotNumber: "asc" },
    include: {
      invoice: { include: { buyer: { select: { email: true } } } },
    },
  });
  return rows.map((lot) => ({
    lotId: lot.id,
    lotNumber: lot.lotNumber,
    title: lot.title,
    status: lot.status as SaleResultRow["status"],
    hammer: lot.invoice ? Number(lot.invoice.hammer) : null,
    invoiceStatus: lot.invoice
      ? (lot.invoice.status as SaleResultRow["invoiceStatus"])
      : null,
    buyerEmail: lot.invoice ? lot.invoice.buyer.email : null,
  }));
}
