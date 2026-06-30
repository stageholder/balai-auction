import type { PrismaClient } from "@prisma/client";
import { toMoney } from "../mappers";
import type { LotStatus, WatchlistItem } from "../types";

export async function toggleWatchlist(
  db: PrismaClient,
  userId: string,
  lotId: string
): Promise<{ watched: boolean }> {
  const existing = await db.watchlist.findUnique({
    where: { userId_lotId: { userId, lotId } },
  });
  if (existing) {
    await db.watchlist.delete({ where: { id: existing.id } });
    return { watched: false };
  }
  await db.watchlist.create({ data: { userId, lotId } });
  return { watched: true };
}

export async function isWatched(
  db: PrismaClient,
  userId: string,
  lotId: string
): Promise<boolean> {
  const row = await db.watchlist.findUnique({
    where: { userId_lotId: { userId, lotId } },
  });
  return row !== null;
}

export async function listWatchlist(
  db: PrismaClient,
  userId: string
): Promise<WatchlistItem[]> {
  const rows = await db.watchlist.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      lot: {
        include: { sale: { select: { title: true } } },
      },
    },
  });
  return rows.map((r) => {
    const images = Array.isArray(r.lot.images) ? (r.lot.images as string[]) : [];
    return {
      id: r.lot.id,
      lotNumber: r.lot.lotNumber,
      title: r.lot.title,
      saleId: r.lot.saleId,
      saleTitle: r.lot.sale.title,
      image: images[0] ?? null,
      status: r.lot.status as LotStatus,
      estimateLow: toMoney(r.lot.estimateLow),
      estimateHigh: toMoney(r.lot.estimateHigh),
    };
  });
}
