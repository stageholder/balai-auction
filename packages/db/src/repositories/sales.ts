import type { Prisma, PrismaClient } from "@prisma/client";
import { saleRowToRecord } from "../mappers";
import type { NewSale, SaleRecord, SaleStatus } from "../types";

/** Sale statuses that must NOT appear in the public catalogue. */
export const NON_PUBLIC_SALE_STATUSES = ["draft"] as const;

/** True when a sale status is allowed to appear in the public catalogue. */
export function isPublicSaleStatus(status: SaleStatus): boolean {
  return !NON_PUBLIC_SALE_STATUSES.includes(status as (typeof NON_PUBLIC_SALE_STATUSES)[number]);
}

export async function createSale(
  db: PrismaClient,
  input: NewSale
): Promise<SaleRecord> {
  const row = await db.sale.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      buyersPremiumPct: input.buyersPremiumPct,
      taxPct: input.taxPct,
      incrementTable: input.incrementTable as unknown as Prisma.InputJsonValue,
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
  return saleRowToRecord(row);
}

export async function getSale(
  db: PrismaClient,
  id: string
): Promise<SaleRecord | null> {
  const row = await db.sale.findUnique({ where: { id } });
  return row ? saleRowToRecord(row) : null;
}

export async function listSales(db: PrismaClient): Promise<SaleRecord[]> {
  const rows = await db.sale.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(saleRowToRecord);
}

export async function listPublishedSales(db: PrismaClient): Promise<SaleRecord[]> {
  const rows = await db.sale.findMany({
    where: { status: { notIn: [...NON_PUBLIC_SALE_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(saleRowToRecord);
}

export async function getPublishedSale(
  db: PrismaClient,
  id: string
): Promise<SaleRecord | null> {
  const sale = await getSale(db, id);
  return sale && isPublicSaleStatus(sale.status) ? sale : null;
}
