import type { PrismaClient } from "@prisma/client";
import { lotRowToRecord, mediaAssetRowToRecord, toDbMoney } from "../mappers";
import type {
  LotRecord,
  LotStatus,
  MediaAssetRecord,
  NewLot,
  NewMedia,
  UpdateLot,
} from "../types";

// Every lot query maps through lotRowToRecord, which derives `images` from the
// media relation — so all of them MUST include it, ordered by sortOrder.
const LOT_INCLUDE = { media: { orderBy: { sortOrder: "asc" as const } } };

function mediaCreateData(media: NewMedia[] | undefined) {
  if (!media || media.length === 0) return undefined;
  return {
    create: media.map((m, i) => ({
      kind: "lot_image" as const,
      bucket: m.bucket,
      path: m.path,
      url: m.url ?? null,
      contentType: m.contentType,
      sizeBytes: m.sizeBytes,
      originalName: m.originalName ?? null,
      caption: m.caption ?? null,
      sortOrder: i,
    })),
  };
}

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
      media: mediaCreateData(input.media),
      estimateLow: toDbMoney(input.estimateLow),
      estimateHigh: toDbMoney(input.estimateHigh),
      startingPrice: toDbMoney(input.startingPrice),
      reserve: input.reserve == null ? null : toDbMoney(input.reserve),
      closesAt: input.closesAt,
      consignorId: input.consignorId ?? null,
      ...(input.status ? { status: input.status } : {}),
    },
    include: LOT_INCLUDE,
  });
  return lotRowToRecord(row);
}

export async function getLot(
  db: PrismaClient,
  id: string
): Promise<LotRecord | null> {
  const row = await db.lot.findUnique({ where: { id }, include: LOT_INCLUDE });
  return row ? lotRowToRecord(row) : null;
}

export async function listLotsForSale(
  db: PrismaClient,
  saleId: string
): Promise<LotRecord[]> {
  const rows = await db.lot.findMany({
    where: { saleId },
    orderBy: { lotNumber: "asc" },
    include: LOT_INCLUDE,
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
    include: LOT_INCLUDE,
  });
  return rows.map(lotRowToRecord);
}

export async function updateLotStatus(
  db: PrismaClient,
  id: string,
  status: LotStatus
): Promise<LotRecord> {
  const row = await db.lot.update({
    where: { id },
    data: { status },
    include: LOT_INCLUDE,
  });
  return lotRowToRecord(row);
}

export async function updateLotClosesAt(
  db: PrismaClient,
  id: string,
  closesAt: Date
): Promise<LotRecord> {
  const row = await db.lot.update({
    where: { id },
    data: { closesAt },
    include: LOT_INCLUDE,
  });
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
  const row = await db.lot.findUnique({ where: { id }, include: LOT_INCLUDE });
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
      ...(fields.estimateLow !== undefined ? { estimateLow: toDbMoney(fields.estimateLow) } : {}),
      ...(fields.estimateHigh !== undefined ? { estimateHigh: toDbMoney(fields.estimateHigh) } : {}),
      ...(fields.startingPrice !== undefined ? { startingPrice: toDbMoney(fields.startingPrice) } : {}),
      ...(fields.reserve !== undefined
        ? { reserve: fields.reserve === null ? null : toDbMoney(fields.reserve) }
        : {}),
      ...(fields.closesAt !== undefined ? { closesAt: fields.closesAt } : {}),
      ...(fields.consignorId !== undefined ? { consignorId: fields.consignorId } : {}),
    },
    include: LOT_INCLUDE,
  });
  return lotRowToRecord(row);
}

/** Append images to a lot's gallery, keeping them after any existing ones. */
export async function addLotMedia(
  db: PrismaClient,
  lotId: string,
  media: NewMedia[]
): Promise<void> {
  if (media.length === 0) return;
  const max = await db.mediaAsset.aggregate({
    where: { lotId },
    _max: { sortOrder: true },
  });
  const base = (max._max.sortOrder ?? -1) + 1;
  await db.mediaAsset.createMany({
    data: media.map((m, i) => ({
      lotId,
      kind: "lot_image" as const,
      bucket: m.bucket,
      path: m.path,
      url: m.url ?? null,
      contentType: m.contentType,
      sizeBytes: m.sizeBytes,
      originalName: m.originalName ?? null,
      caption: m.caption ?? null,
      sortOrder: base + i,
    })),
  });
}

/** Remove one image from a lot. Returns its storage location so the caller can
 *  delete the underlying object, or null if it does not belong to the lot. */
export async function removeLotMedia(
  db: PrismaClient,
  lotId: string,
  mediaId: string
): Promise<{ bucket: string; path: string } | null> {
  const asset = await db.mediaAsset.findUnique({ where: { id: mediaId } });
  if (!asset || asset.lotId !== lotId) return null;
  await db.mediaAsset.delete({ where: { id: mediaId } });
  return { bucket: asset.bucket, path: asset.path };
}

export async function listLotMedia(
  db: PrismaClient,
  lotId: string
): Promise<MediaAssetRecord[]> {
  const rows = await db.mediaAsset.findMany({
    where: { lotId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(mediaAssetRowToRecord);
}

/**
 * Cover image per sale (the first lot's first image), for image-forward sale
 * cards. Two cheap queries; sales with no lots/images map to null.
 */
export async function getSaleCoverImages(
  db: PrismaClient,
  saleIds: string[]
): Promise<Record<string, string | null>> {
  if (saleIds.length === 0) return {};
  const lots = await db.lot.findMany({
    where: { saleId: { in: saleIds } },
    orderBy: [{ saleId: "asc" }, { lotNumber: "asc" }],
    select: {
      saleId: true,
      media: {
        where: { url: { not: null } },
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { url: true },
      },
    },
  });
  const covers: Record<string, string | null> = {};
  for (const lot of lots) {
    if (lot.saleId in covers) continue; // keep the lowest lotNumber per sale
    covers[lot.saleId] = lot.media[0]?.url ?? null;
  }
  return covers;
}
