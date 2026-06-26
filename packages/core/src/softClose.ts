/**
 * Returns the new close time for a lot after a bid.
 * A bid inside the final `windowMs` extends the close to `bidAt + windowMs`,
 * guaranteeing a full window of quiet before the lot closes. Bids at or after
 * the close are ignored (they belong to the closing job, not this function).
 */
export function applySoftClose(
  closesAt: number,
  bidAt: number,
  windowMs: number
): number {
  if (bidAt >= closesAt) return closesAt;
  if (closesAt - bidAt <= windowMs) return bidAt + windowMs;
  return closesAt;
}
