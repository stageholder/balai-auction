export type Broadcast = (
  topic: string,
  event: string,
  payload: unknown
) => Promise<void>;

/** A sale-channel broadcaster backed by the Supabase Realtime REST endpoint.
 *  Best-effort: never throws into the caller (a failed broadcast must not stop
 *  the runner from advancing the sale). */
export function createBroadcaster(url: string, serviceKey: string): Broadcast {
  return async (topic, event, payload) => {
    try {
      const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: serviceKey },
        body: JSON.stringify({ messages: [{ topic, event, payload }] }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(`broadcast ${topic}/${event}: ${res.status} ${detail}`);
      }
    } catch (err) {
      console.error(`broadcast ${topic}/${event} failed:`, err);
    }
  };
}
