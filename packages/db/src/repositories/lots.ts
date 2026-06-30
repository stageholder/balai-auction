import type { PrismaClient } from "@prisma/client";
import { lotRowToRecord, toDbMoney } from "../mappers";
import type { LotRecord, LotStatus, NewLot, UpdateLot } from "../types";

export async function createLot(
  db: PrismaClient,
  input: NewLot
): Promise<LotRecord> {
  const row = await db.lot.create({
    data: {
      saleId: input.saleId,
      lotNumber: input.lotNumber,
      title: input.title,
      description: input.description ?? null,
      images: input.images ?? [],
      estimateLow: toDbMoney(input.estimateLow),
      estimateHigh: toDbMoney(input.estimateHigh),
      startingPrice: toDbMoney(input.startingPrice),
      reserve: input.reserve == null ? null : toDbMoney(input.reserve),
      closesAt: input.closesAt,
      consignorId: input.consignorId ?? null,
      ...(input.status ? { status: input.status } : {}),
    },
  });
  return lotRowToRecord(row);
}

export async function getLot(
  db: PrismaClient,
  id: string
): Promise<LotRecord | null> {
  const row = await db.lot.findUnique({ where: { id } });
  return row ? lotRowToRecord(row) : null;
}

export async function listLotsForSale(
  db: PrismaClient,
  saleId: string
): Promise<LotRecord[]> {
  const rows = await db.lot.findMany({
    where: { saleId },
    orderBy: { lotNumber: "asc" },
  });
  return rows.map(lotRowToRecord);
}

export async function getLotsDueToClose(
  db: PrismaClient,
  now: Date
): Promise<LotRecord[]> {
  const rows = await db.lot.findMany({
    where: {
      status: "live",
      closesAt: { lte: now },
      sale: { mode: "timed" },
    },
    orderBy: { closesAt: "asc" },
  });
  return rows.map(lotRowToRecord);
}

export async function updateLotStatus(
  db: PrismaClient,
  id: string,
  status: LotStatus
): Promise<LotRecord> {
  const row = await db.lot.update({ where: { id }, data: { status } });
  return lotRowToRecord(row);
}

export async function updateLotClosesAt(
  db: PrismaClient,
  id: string,
  closesAt: Date
): Promise<LotRecord> {
  const row = await db.lot.update({ where: { id }, data: { closesAt } });
  return lotRowToRecord(row);
}

export async function openQueuedLot(
  db: PrismaClient,
  id: string,
  closesAt: Date
): Promise<LotRecord | null> {
  const claim = await db.lot.updateMany({
    where: { id, status: "queued" },
    data: { status: "live", closesAt },
  });
  if (claim.count === 0) return null;
  const row = await db.lot.findUnique({ where: { id } });
  return row ? lotRowToRecord(row) : null;
}

export async function updateLot(
  db: PrismaClient,
  id: string,
  fields: UpdateLot
): Promise<LotRecord> {
  const row = await db.lot.update({
    where: { id },
    data: {
      ...(fields.lotNumber !== undefined ? { lotNumber: fields.lotNumber } : {}),
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      ...(fields.images !== undefined ? { images: fields.images } : {}),
      ...(fields.estimateLow !== undefined ? { estimateLow: toDbMoney(fields.estimateLow) } : {}),
      ...(fields.estimateHigh !== undefined ? { estimateHigh: toDbMoney(fields.estimateHigh) } : {}),
      ...(fields.startingPrice !== undefined ? { startingPrice: toDbMoney(fields.startingPrice) } : {}),
      ...(fields.reserve !== undefined
        ? { reserve: fields.reserve === null ? null : toDbMoney(fields.reserve) }
        : {}),
      ...(fields.closesAt !== undefined ? { closesAt: fields.closesAt } : {}),
      ...(fields.consignorId !== undefined ? { consignorId: fields.consignorId } : {}),
    },
  });
  return lotRowToRecord(row);
}

/**
 * Cover image per sale (the first lot's first image), for image-forward sale
 * cards. One query; sales with no lots/images map to null.
 */
export async function getSaleCoverImages(
  db: PrismaClient,
  saleIds: string[]
): Promise<Record<string, string | null>> {
  if (saleIds.length === 0) return {};
  const lots = await db.lot.findMany({
    where: { saleId: { in: saleIds } },
    orderBy: [{ saleId: "asc" }, { lotNumber: "asc" }],
    select: { saleId: true, images: true },
  });
  const covers: Record<string, string | null> = {};
  for (const lot of lots) {
    if (lot.saleId in covers) continue; // keep the lowest lotNumber per sale
    const images = Array.isArray(lot.images) ? (lot.images as string[]) : [];
    covers[lot.saleId] = images[0] ?? null;
  }
  return covers;
}
