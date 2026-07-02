"use server";

import { revalidatePath } from "next/cache";
import { resolveBids, nextBidFloor, applySoftClose, softCloseWindowMs } from "@auction/core";
import {
  prisma,
  getLot,
  getSale,
  getRegistration,
  getUser,
  bidRowToEvent,
  toDbMoney,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { broadcastLotPrice } from "@/lib/realtime";
import { notifyOutbid } from "@/lib/notifications";
import { formatRupiah } from "@/lib/format";

export async function placeBid(
  lotId: string,
  maxAmount: number
): Promise<{
  ok: boolean;
  error?: string;
  currentPrice?: number;
  closesAt?: string;
  leading?: boolean;
  /** Minimum acceptable maximum for the NEXT bid, after this one. */
  floor?: number;
  /** The bidder's own confidential maximum after this bid. */
  yourMax?: number;
}> {
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

  // Critical section: serialize with concurrent bids AND the close path on this
  // lot via a per-lot advisory lock (released at commit). Everything that reads
  // the bid ledger, validates the floor, appends the bid, and extends the close
  // runs under the lock and re-reads authoritative state, so no bid is dropped,
  // no bid lands on an already-closed lot, and the anti-snipe extension can't be
  // clobbered by a stale concurrent write.
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lotId}, 0))`;

    const fresh = await tx.lot.findUnique({
      where: { id: lotId },
      select: { status: true, closesAt: true },
    });
    if (!fresh || fresh.status !== "live" || fresh.closesAt <= now) {
      return { kind: "closed" as const };
    }

    const rows = await tx.bid.findMany({
      where: { lotId },
      orderBy: { createdAt: "asc" },
      select: { bidderId: true, maxAmount: true, createdAt: true },
    });
    const events = rows.map(bidRowToEvent);

    const floor = nextBidFloor(lot.startingPrice, events, sale.incrementTable);
    if (maxAmount < floor) {
      return { kind: "belowFloor" as const, floor };
    }

    const newEvents = [
      ...events,
      { bidderId: user.id, maxAmount, createdAt: now.getTime() },
    ];
    const resolution = resolveBids(lot.startingPrice, newEvents, sale.incrementTable);
    const priorLeaderId = resolveBids(
      lot.startingPrice,
      events,
      sale.incrementTable
    ).winnerId;

    // Stored `amount` is the revealed price at this moment; `maxAmount` is the
    // confidential proxy ceiling used for resolution.
    await tx.bid.create({
      data: {
        lotId,
        bidderId: user.id,
        maxAmount: toDbMoney(maxAmount),
        amount: toDbMoney(resolution.currentPrice),
        type: "bid",
      },
    });

    // Soft-close: a late bid extends the close (monotonic — computed from the
    // fresh close time under the lock).
    const extended = applySoftClose(
      fresh.closesAt.getTime(),
      now.getTime(),
      softCloseWindowMs(sale.mode)
    );
    let closesAt = fresh.closesAt;
    if (extended !== fresh.closesAt.getTime()) {
      closesAt = new Date(extended);
      await tx.lot.update({ where: { id: lotId }, data: { closesAt } });
    }

    const nextFloor = nextBidFloor(lot.startingPrice, newEvents, sale.incrementTable);
    const yourMax = Math.max(
      maxAmount,
      ...events.filter((e) => e.bidderId === user.id).map((e) => e.maxAmount)
    );

    return {
      kind: "ok" as const,
      currentPrice: resolution.currentPrice,
      winnerId: resolution.winnerId,
      priorLeaderId,
      closesAt,
      nextFloor,
      yourMax,
      bidCount: newEvents.length,
    };
  });

  if (outcome.kind === "closed") {
    return { ok: false, error: "Bidding has ended for this lot." };
  }
  if (outcome.kind === "belowFloor") {
    return {
      ok: false,
      error: `Your maximum must be at least ${formatRupiah(outcome.floor)}.`,
      floor: outcome.floor,
    };
  }

  // Side effects (network I/O) run AFTER the transaction commits — never hold a
  // DB lock across a broadcast/email.
  await broadcastLotPrice(lotId, {
    currentPrice: outcome.currentPrice,
    closesAt: outcome.closesAt.toISOString(),
    bidCount: outcome.bidCount,
  });

  if (
    outcome.priorLeaderId &&
    outcome.priorLeaderId !== user.id &&
    outcome.winnerId !== outcome.priorLeaderId
  ) {
    const outbid = await getUser(prisma, outcome.priorLeaderId);
    if (outbid) await notifyOutbid(outbid.email, lot.title, lotId);
  }

  revalidatePath(`/lots/${lotId}`);
  return {
    ok: true,
    currentPrice: outcome.currentPrice,
    closesAt: outcome.closesAt.toISOString(),
    leading: outcome.winnerId === user.id,
    floor: outcome.nextFloor,
    yourMax: outcome.yourMax,
  };
}
