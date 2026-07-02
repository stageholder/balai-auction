import type { PrismaClient } from "@prisma/client";
import { saleRowToRecord, toMoney } from "../mappers";
import type { SaleRecord, SearchLotItem } from "../types";
import { NON_PUBLIC_SALE_STATUSES } from "./sales";

const PUBLISHED = { status: { notIn: [...NON_PUBLIC_SALE_STATUSES] } };

export async function searchSales(
  db: PrismaClient,
  q: string,
  limit = 50
): Promise<SaleRecord[]> {
  const term = q.trim();
  if (!term) return [];
  const rows = await db.sale.findMany({
    where: {
      ...PUBLISHED,
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
        { category: { contains: term, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(saleRowToRecord);
}

export async function searchLots(
  db: PrismaClient,
  q: string,
  limit = 50
): Promise<SearchLotItem[]> {
  const term = q.trim();
  if (!term) return [];
  const rows = await db.lot.findMany({
    where: {
      sale: PUBLISHED,
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ],
    },
    include: {
      sale: { select: { title: true } },
      media: {
        where: { url: { not: null } },
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { url: true },
      },
    },
    orderBy: [{ saleId: "asc" }, { lotNumber: "asc" }],
    take: limit,
  });
  return rows.map((l) => {
    return {
      id: l.id,
      lotNumber: l.lotNumber,
      title: l.title,
      saleId: l.saleId,
      saleTitle: l.sale.title,
      image: l.media[0]?.url ?? null,
      status: l.status,
      estimateLow: toMoney(l.estimateLow),
      estimateHigh: toMoney(l.estimateHigh),
    };
  });
}
