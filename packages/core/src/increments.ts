import type { IncrementTable, Money } from "./types";

export function minIncrement(price: Money, table: IncrementTable): Money {
  for (const bracket of table) {
    if (bracket.upTo === null || price < bracket.upTo) {
      return bracket.step;
    }
  }
  throw new Error(
    "increment table must end with an open bracket (upTo: null)"
  );
}

export function minNextBid(currentPrice: Money, table: IncrementTable): Money {
  return currentPrice + minIncrement(currentPrice, table);
}
