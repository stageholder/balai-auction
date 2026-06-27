import { minIncrement, minNextBid } from "./increments";
import type { BidEvent, BidResolution, IncrementTable, Money } from "./types";

interface Standing {
  bidderId: string;
  max: Money;
  reachedAt: number;
}

function rankBidders(events: BidEvent[]): Standing[] {
  const byBidder = new Map<string, Standing>();
  for (const e of events) {
    const cur = byBidder.get(e.bidderId);
    if (!cur || e.maxAmount > cur.max) {
      byBidder.set(e.bidderId, {
        bidderId: e.bidderId,
        max: e.maxAmount,
        reachedAt: e.createdAt,
      });
    } else if (e.maxAmount === cur.max && e.createdAt < cur.reachedAt) {
      cur.reachedAt = e.createdAt;
    }
  }
  return [...byBidder.values()].sort(
    (a, b) => b.max - a.max || a.reachedAt - b.reachedAt
  );
}

export function resolveBids(
  startingPrice: Money,
  events: BidEvent[],
  table: IncrementTable
): BidResolution {
  const validEvents = events.filter((e) => e.maxAmount >= startingPrice);

  if (validEvents.length === 0) {
    return { winnerId: null, currentPrice: startingPrice, contested: false };
  }

  const standings = rankBidders(validEvents);
  const winner = standings[0]!;

  if (standings.length === 1) {
    return {
      winnerId: winner.bidderId,
      currentPrice: startingPrice,
      contested: false,
    };
  }

  const second = standings[1]!;
  let price: Money;
  if (winner.max === second.max) {
    price = winner.max;
  } else {
    price = Math.min(winner.max, second.max + minIncrement(second.max, table));
  }
  price = Math.max(startingPrice, price);

  return { winnerId: winner.bidderId, currentPrice: price, contested: true };
}

/** The minimum acceptable `maxAmount` for the next bid on a lot. */
export function nextBidFloor(
  startingPrice: Money,
  events: BidEvent[],
  table: IncrementTable
): Money {
  const { winnerId, currentPrice } = resolveBids(startingPrice, events, table);
  return winnerId === null ? startingPrice : minNextBid(currentPrice, table);
}
