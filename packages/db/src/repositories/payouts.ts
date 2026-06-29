import type { PrismaClient } from "@prisma/client";
import { payoutRowToRecord, toMoney, toDbMoney } from "../mappers";
import type { PayoutRecord, PayoutStatus } from "../types";

export interface PayoutListItem {
  id: string;
  status: PayoutStatus;
  lotId: string;
  lotNumber: number;
  lotTitle: string;
  consignorId: string;
  consignorEmail: string;
  hasBankDetails: boolean;
  hammer: number;
  commission: number;
  net: number;
  xenditDisbursementId: string | null;
  createdAt: Date;
}

export async function listPayouts(db: PrismaClient): Promise<PayoutListItem[]> {
  const rows = await db.payout.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      lot: {
        include: {
          invoice: { select: { hammer: true } },
        },
      },
      consignor: {
        select: {
          email: true,
          payoutBankCode: true,
          payoutAccountNumber: true,
          payoutAccountHolder: true,
        },
      },
    },
  });

  return rows.map((p) => {
    const net = toMoney(p.amount);
    const hammer = p.lot.invoice ? toMoney(p.lot.invoice.hammer) : 0;
    const commission = hammer - net;
    const { payoutBankCode, payoutAccountNumber, payoutAccountHolder } = p.consignor;
    const hasBankDetails = !!(
      payoutBankCode &&
      payoutAccountNumber &&
      payoutAccountHolder
    );
    return {
      id: p.id,
      status: p.status as PayoutStatus,
      lotId: p.lotId,
      lotNumber: p.lot.lotNumber,
      lotTitle: p.lot.title,
      consignorId: p.consignorId,
      consignorEmail: p.consignor.email,
      hasBankDetails,
      hammer,
      commission,
      net,
      xenditDisbursementId: p.xenditDisbursementId,
      createdAt: p.createdAt,
    };
  });
}

export async function getPayout(
  db: PrismaClient,
  id: string
): Promise<PayoutRecord | null> {
  const row = await db.payout.findUnique({ where: { id } });
  return row ? payoutRowToRecord(row) : null;
}

/** Guarded pending→released transition. Returns the updated record, or null
 *  if the payout was not in pending state (already released/paid/failed). */
export async function releasePayout(
  db: PrismaClient,
  id: string,
  xenditDisbursementId: string
): Promise<PayoutRecord | null> {
  const now = new Date();
  const result = await db.payout.updateMany({
    where: { id, status: "pending" },
    data: { status: "released", xenditDisbursementId, releasedAt: now },
  });
  if (result.count === 0) return null;
  const row = await db.payout.findUnique({ where: { id } });
  return row ? payoutRowToRecord(row) : null;
}

/** Guarded released→paid transition. Runs in a $transaction: claims the
 *  payout, then writes the seller payout ledger entry. Returns false if the
 *  payout was not in released state (idempotent on double-delivery). */
export async function markPayoutPaid(
  db: PrismaClient,
  xenditDisbursementId: string
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const paidAt = new Date();
    const claim = await tx.payout.updateMany({
      where: { xenditDisbursementId, status: "released" },
      data: { status: "paid", paidAt },
    });
    if (claim.count === 0) return false;

    // The claim just set exactly this payout to "paid"; assert it (don't guard)
    // so a missing row throws and rolls back rather than silently skipping the
    // seller payout ledger entry — never lose a money record.
    const payout = await tx.payout.findFirstOrThrow({
      where: { xenditDisbursementId, status: "paid" },
    });
    const net = toMoney(payout.amount);
    await tx.ledgerEntry.create({
      data: {
        lotId: payout.lotId,
        party: "seller",
        kind: "payout",
        amount: toDbMoney(net),
      },
    });
    return true;
  });
}

/** Guarded released→failed transition via xenditDisbursementId. */
export async function markPayoutFailed(
  db: PrismaClient,
  xenditDisbursementId: string
): Promise<boolean> {
  const result = await db.payout.updateMany({
    where: { xenditDisbursementId, status: "released" },
    data: { status: "failed" },
  });
  return result.count > 0;
}

/** Guarded failed→pending transition. Clears xenditDisbursementId and releasedAt,
 *  freeing the @unique disbursement id so the payout can be released again.
 *  Returns the updated record, or null if the payout was not in failed state. */
export async function rearmPayout(
  db: PrismaClient,
  payoutId: string
): Promise<PayoutRecord | null> {
  const claim = await db.payout.updateMany({
    where: { id: payoutId, status: "failed" },
    // Bump releaseAttempt so the next release uses a fresh idempotency key
    // (`payout-{id}-{attempt}`); reusing the prior key would make Xendit return
    // the old FAILED disbursement instead of minting a new one.
    data: {
      status: "pending",
      releaseAttempt: { increment: 1 },
      xenditDisbursementId: null,
      releasedAt: null,
    },
  });
  if (claim.count === 0) return null;
  const row = await db.payout.findUnique({ where: { id: payoutId } });
  return row ? payoutRowToRecord(row) : null;
}
