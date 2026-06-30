import type { PrismaClient } from "../generated/client";
import type { LotStatus, PublicLotResult, SaleResultRow } from "../types";

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

export async function getPublicSaleResults(
  db: PrismaClient,
  saleId: string
): Promise<PublicLotResult[]> {
  const rows = await db.lot.findMany({
    where: { saleId },
    orderBy: { lotNumber: "asc" },
    // Public path: select ONLY the invoice hammer. Never buyer, never status.
    include: { invoice: { select: { hammer: true } } },
  });
  return rows.map((lot) => ({
    lotId: lot.id,
    lotNumber: lot.lotNumber,
    title: lot.title,
    status: lot.status as LotStatus,
    hammer: lot.invoice ? Number(lot.invoice.hammer) : null,
  }));
}

export async function getLotHammer(
  db: PrismaClient,
  lotId: string
): Promise<number | null> {
  const lot = await db.lot.findUnique({
    where: { id: lotId },
    include: { invoice: { select: { hammer: true } } },
  });
  return lot?.invoice ? Number(lot.invoice.hammer) : null;
}
