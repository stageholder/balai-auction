import type { BidEvent } from "@auction/core";
import type { PrismaClient } from "@prisma/client";
import { bidRowToEvent, bidRowToRecord, toDbMoney } from "../mappers";
import type { BidRecord, NewBid } from "../types";

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
