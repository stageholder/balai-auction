import "server-only";

const SOFT_CLOSE_MS = 2 * 60_000;
export const SOFT_CLOSE_WINDOW_MS = SOFT_CLOSE_MS;

export interface LotPricePayload {
  currentPrice: number;
  closesAt: string;
  bidCount: number;
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
    await fetch(
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
  } catch (err) {
    // Realtime is best-effort; clients also see the fresh price on next load.
    // Log so a persistently failing broadcast (bad key/URL/outage) is visible.
    console.error(`broadcastLotPrice failed for lot ${lotId}:`, err);
  }
}
