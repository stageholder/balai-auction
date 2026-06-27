export type SaleMode = "timed" | "live";

/** Soft-close (anti-snipe) windows by sale mode. */
export const TIMED_SOFT_CLOSE_MS = 120_000; // 2 minutes
export const LIVE_SOFT_CLOSE_MS = 12_000; // 12 seconds

export function softCloseWindowMs(mode: SaleMode): number {
  return mode === "live" ? LIVE_SOFT_CLOSE_MS : TIMED_SOFT_CLOSE_MS;
}
