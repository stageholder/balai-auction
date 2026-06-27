"use server";

import { revalidatePath } from "next/cache";
import { resolveBids, nextBidFloor, applySoftClose } from "@auction/core";
import {
  prisma,
  getLot,
  getSale,
  getRegistration,
  getBidEventsForLot,
  appendBid,
  updateLotClosesAt,
  getUser,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { broadcastLotPrice, SOFT_CLOSE_WINDOW_MS } from "@/lib/realtime";
import { notifyOutbid } from "@/lib/notifications";

export async function placeBid(
  lotId: string,
  maxAmount: number
): Promise<{ ok: boolean; error?: string; currentPrice?: number; closesAt?: string }> {
  const user = await requireUser();

  if (!Number.isInteger(maxAmount) || maxAmount <= 0) {
    return { ok: false, error: "Enter a valid bid amount." };
  }

  const lot = await getLot(prisma, lotId);
  if (!lot) return { ok: false, error: "Lot not found." };
  if (lot.status !== "live") return { ok: false, error: "Bidding is closed for this lot." };

  const now = new Date();
  if (lot.closesAt <= now) return { ok: false, error: "Bidding has ended for this lot." };

  const registration = await getRegistration(prisma, user.id, lot.saleId);
  if (!registration || registration.kycStatus !== "approved") {
    return { ok: false, error: "You must be approved to bid in this sale." };
  }

  const sale = await getSale(prisma, lot.saleId);
  if (!sale) return { ok: false, error: "Sale not found." };

  const events = await getBidEventsForLot(prisma, lotId);
  const floor = nextBidFloor(lot.startingPrice, events, sale.incrementTable);
  if (maxAmount < floor) {
    return { ok: false, error: `Your maximum must be at least ${floor}.` };
  }

  // Resolved price after including this bid (stored as the bid's revealed amount).
  const resolution = resolveBids(
    lot.startingPrice,
    [...events, { bidderId: user.id, maxAmount, createdAt: now.getTime() }],
    sale.incrementTable
  );

  const priorLeaderId = resolveBids(
    lot.startingPrice,
    events,
    sale.incrementTable
  ).winnerId;

  await appendBid(prisma, {
    lotId,
    bidderId: user.id,
    maxAmount,
    amount: resolution.currentPrice,
  });

  // Soft-close: a late bid extends the close.
  const extended = applySoftClose(
    lot.closesAt.getTime(),
    now.getTime(),
    SOFT_CLOSE_WINDOW_MS
  );
  let closesAt = lot.closesAt;
  if (extended !== lot.closesAt.getTime()) {
    closesAt = new Date(extended);
    await updateLotClosesAt(prisma, lotId, closesAt);
  }

  await broadcastLotPrice(lotId, {
    currentPrice: resolution.currentPrice,
    closesAt: closesAt.toISOString(),
    bidCount: events.length + 1,
  });

  if (
    priorLeaderId &&
    priorLeaderId !== user.id &&
    resolution.winnerId !== priorLeaderId
  ) {
    const outbid = await getUser(prisma, priorLeaderId);
    if (outbid) await notifyOutbid(outbid.email, lot.title, lotId);
  }

  revalidatePath(`/lots/${lotId}`);
  return {
    ok: true,
    currentPrice: resolution.currentPrice,
    closesAt: closesAt.toISOString(),
  };
}
