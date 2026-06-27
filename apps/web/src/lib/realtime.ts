import "server-only";

const SOFT_CLOSE_MS = 2 * 60_000;
export const SOFT_CLOSE_WINDOW_MS = SOFT_CLOSE_MS;

export interface LotPricePayload {
  currentPrice: number;
  closesAt: string;
  bidCount?: number;
  status?: string;
}

/** Push a price update to subscribers of the public `lot:{id}` channel via the
 *  Supabase Realtime REST broadcast endpoint. Fire-and-forget; never throws
 *  into the caller (a failed broadcast must not fail a committed bid). */
export async function broadcastLotPrice(
  lotId: string,
  payload: LotPricePayload
): Promise<void> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        body: JSON.stringify({
          messages: [{ topic: `lot:${lotId}`, event: "price", payload }],
        }),
      }
    );
    // fetch only rejects on network errors; a bad key/URL returns a non-ok
    // response. Surface that too so a misconfigured broadcast is visible.
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `broadcastLotPrice for lot ${lotId}: ${res.status} ${detail}`
      );
    }
  } catch (err) {
    // Realtime is best-effort; clients also see the fresh price on next load.
    console.error(`broadcastLotPrice failed for lot ${lotId}:`, err);
  }
}
