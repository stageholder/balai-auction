import { resolveBids } from "./auction";
import type { BidEvent, IncrementTable, Money } from "./types";

export interface Settlement {
  outcome: "sold" | "unsold";
  winnerId: string | null;
  hammerPrice: Money;
}

export function settleLot(
  startingPrice: Money,
  events: BidEvent[],
  table: IncrementTable,
  reserve: Money | null
): Settlement {
  const resolution = resolveBids(startingPrice, events, table);
  if (resolution.winnerId === null) {
    return { outcome: "unsold", winnerId: null, hammerPrice: 0 };
  }

  const winnerMax = Math.max(
    ...events
      .filter((e) => e.bidderId === resolution.winnerId)
      .map((e) => e.maxAmount)
  );

  if (reserve !== null && winnerMax < reserve) {
    return { outcome: "unsold", winnerId: null, hammerPrice: 0 };
  }

  const hammerPrice =
    reserve !== null
      ? Math.max(resolution.currentPrice, reserve)
      : resolution.currentPrice;

  return { outcome: "sold", winnerId: resolution.winnerId, hammerPrice };
}
