import type { BidEvent } from "@auction/core";
import type { PrismaClient } from "@prisma/client";
import { bidRowToEvent, bidRowToRecord, toDbMoney, toMoney } from "../mappers";
import type { BidHistoryItem, BidRecord, NewBid } from "../types";

export async function appendBid(
  db: PrismaClient,
  input: NewBid
): Promise<BidRecord> {
  const row = await db.bid.create({
    data: {
      lotId: input.lotId,
      bidderId: input.bidderId,
      maxAmount: toDbMoney(input.maxAmount),
      amount: toDbMoney(input.amount),
      type: input.type ?? "bid",
    },
  });
  return bidRowToRecord(row);
}

export async function getBidEventsForLot(
  db: PrismaClient,
  lotId: string
): Promise<BidEvent[]> {
  const rows = await db.bid.findMany({
    where: { lotId },
    orderBy: { createdAt: "asc" },
    select: { bidderId: true, maxAmount: true, createdAt: true },
  });
  return rows.map(bidRowToEvent);
}

/** Full bid history for a lot, oldest first — for the bid list + price chart.
 *  `amount` is the revealed price at the time of each bid. */
export async function listBidsForLot(
  db: PrismaClient,
  lotId: string
): Promise<BidHistoryItem[]> {
  const rows = await db.bid.findMany({
    where: { lotId },
    orderBy: { createdAt: "asc" },
    include: { bidder: { select: { email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    amount: toMoney(r.amount),
    maxAmount: toMoney(r.maxAmount),
    bidderId: r.bidderId,
    bidderEmail: r.bidder.email,
    createdAt: r.createdAt,
  }));
}
