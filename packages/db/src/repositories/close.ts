import { computeInvoice, settleLot } from "@auction/core";
import type { PrismaClient } from "@prisma/client";
import { toDbMoney } from "../mappers";
import { getLotsDueToClose, getLot } from "./lots";
import { getSale } from "./sales";
import { getBidEventsForLot } from "./bids";

export interface CloseResult {
  lotId: string;
  outcome: "sold" | "unsold" | "skipped";
  winnerId: string | null;
  hammerPrice: number;
}

const SKIPPED = (lotId: string): CloseResult => ({
  lotId,
  outcome: "skipped",
  winnerId: null,
  hammerPrice: 0,
});

/** Close one lot: settle from the bid ledger, then atomically claim the lot
 *  (conditional update on status="live") and write the invoice + ledger in a
 *  single transaction. A concurrent runner that loses the claim makes no
 *  changes. Idempotent: a non-live or not-yet-due lot is skipped. */
export async function closeLot(
  db: PrismaClient,
  lotId: string,
  now: Date
): Promise<CloseResult> {
  const lot = await getLot(db, lotId);
  if (!lot || lot.status !== "live" || lot.closesAt > now) return SKIPPED(lotId);

  const sale = await getSale(db, lot.saleId);
  if (!sale) return SKIPPED(lotId);

  const events = await getBidEventsForLot(db, lotId);
  const settlement = settleLot(
    lot.startingPrice,
    events,
    sale.incrementTable,
    lot.reserve
  );
  const invoice =
    settlement.outcome === "sold"
      ? computeInvoice({
          hammer: settlement.hammerPrice,
          premiumPct: sale.buyersPremiumPct,
          taxPct: sale.taxPct,
        })
      : null;

  return db.$transaction(async (tx) => {
    // Atomic claim: only the runner that flips status from "live" proceeds.
    const claim = await tx.lot.updateMany({
      where: { id: lotId, status: "live" },
      data: { status: settlement.outcome },
    });
    if (claim.count === 0) return SKIPPED(lotId);

    if (settlement.outcome === "sold" && invoice && settlement.winnerId) {
      const created = await tx.invoice.create({
        data: {
          lotId,
          buyerId: settlement.winnerId,
          hammer: toDbMoney(invoice.hammer),
          premium: toDbMoney(invoice.premium),
          tax: toDbMoney(invoice.tax),
          total: toDbMoney(invoice.total),
        },
      });
      await tx.ledgerEntry.createMany({
        data: invoice.entries.map((e) => ({
          invoiceId: created.id,
          lotId,
          party: e.party,
          kind: e.kind,
          amount: toDbMoney(e.amount),
        })),
      });
    }

    return {
      lotId,
      outcome: settlement.outcome,
      winnerId: settlement.winnerId,
      hammerPrice: settlement.outcome === "sold" ? settlement.hammerPrice : 0,
    };
  });
}

/** Close every live lot whose closesAt has passed. */
export async function closeDueLots(
  db: PrismaClient,
  now: Date
): Promise<CloseResult[]> {
  const due = await getLotsDueToClose(db, now);
  const results: CloseResult[] = [];
  for (const lot of due) {
    results.push(await closeLot(db, lot.id, now));
  }
  return results;
}
