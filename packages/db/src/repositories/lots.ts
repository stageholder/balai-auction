import type { PrismaClient } from "@prisma/client";
import { lotRowToRecord, toDbMoney } from "../mappers";
import type { LotRecord, LotStatus, NewLot } from "../types";

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
    where: { status: "live", closesAt: { lte: now } },
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
