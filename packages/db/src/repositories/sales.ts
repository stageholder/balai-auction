import type { Prisma, PrismaClient } from "@prisma/client";
import { saleRowToRecord } from "../mappers";
import type { NewSale, SaleRecord, SaleStatus, UpdateSale } from "../types";

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
      ...(input.sellerCommissionPct !== undefined ? { sellerCommissionPct: input.sellerCommissionPct } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.liveLotSeconds !== undefined ? { liveLotSeconds: input.liveLotSeconds } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
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

export async function updateSale(
  db: PrismaClient,
  id: string,
  fields: UpdateSale
): Promise<SaleRecord> {
  const row = await db.sale.update({
    where: { id },
    data: {
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      ...(fields.startsAt !== undefined ? { startsAt: fields.startsAt } : {}),
      ...(fields.endsAt !== undefined ? { endsAt: fields.endsAt } : {}),
      ...(fields.buyersPremiumPct !== undefined ? { buyersPremiumPct: fields.buyersPremiumPct } : {}),
      ...(fields.taxPct !== undefined ? { taxPct: fields.taxPct } : {}),
      ...(fields.sellerCommissionPct !== undefined ? { sellerCommissionPct: fields.sellerCommissionPct } : {}),
      ...(fields.incrementTable !== undefined
        ? { incrementTable: fields.incrementTable as unknown as Prisma.InputJsonValue }
        : {}),
      ...(fields.mode !== undefined ? { mode: fields.mode } : {}),
      ...(fields.liveLotSeconds !== undefined ? { liveLotSeconds: fields.liveLotSeconds } : {}),
      ...(fields.category !== undefined ? { category: fields.category } : {}),
    },
  });
  return saleRowToRecord(row);
}

export async function listRunningLiveSales(
  db: PrismaClient
): Promise<SaleRecord[]> {
  const rows = await db.sale.findMany({
    where: { mode: "live", status: "live" },
    orderBy: { startsAt: "asc" },
  });
  return rows.map(saleRowToRecord);
}

export async function updateSaleStatus(
  db: PrismaClient,
  id: string,
  status: SaleStatus
): Promise<SaleRecord> {
  const row = await db.sale.update({ where: { id }, data: { status } });
  return saleRowToRecord(row);
}
