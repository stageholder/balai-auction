import {
  advanceLiveSale,
  type LiveAdvanceAction,
  type LiveLot,
} from "@auction/core";
import type { Broadcast } from "./broadcast";

export interface TickSaleInput {
  id: string;
  status: string;
  startsAt: Date;
  liveLotSeconds: number;
}

export interface TickDeps {
  listLots(saleId: string): Promise<LiveLot[]>;
  openLot(lotId: string, closesAt: Date): Promise<unknown>;
  closeLot(lotId: string, now: Date): Promise<unknown>;
  finishSale(saleId: string): Promise<unknown>;
  broadcast: Broadcast;
}

/** Advance one live sale by one step: decide via the pure sequencer, then
 *  dispatch the effect through injected deps + broadcast. Returns the action. */
export async function tickSale(
  sale: TickSaleInput,
  deps: TickDeps,
  now: Date
): Promise<LiveAdvanceAction> {
  const lots = await deps.listLots(sale.id);
  const action = advanceLiveSale(sale.status, sale.startsAt, lots, now);
  const topic = `sale:${sale.id}`;

  switch (action.kind) {
    case "open": {
      const closesAt = new Date(now.getTime() + sale.liveLotSeconds * 1000);
      await deps.openLot(action.lotId, closesAt);
      await deps.broadcast(topic, "lot-opened", {
        lotId: action.lotId,
        closesAt: closesAt.toISOString(),
      });
      break;
    }
    case "close": {
      await deps.closeLot(action.lotId, now);
      await deps.broadcast(topic, "lot-closed", { lotId: action.lotId });
      break;
    }
    case "finish": {
      await deps.finishSale(sale.id);
      await deps.broadcast(topic, "sale-ended", {});
      break;
    }
    case "wait":
      break;
  }
  return action;
}
