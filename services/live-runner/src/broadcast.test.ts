import { describe, it, expect, vi, afterEach } from "vitest";
import { createBroadcaster } from "./broadcast";

afterEach(() => vi.restoreAllMocks());

describe("createBroadcaster", () => {
  it("POSTs a broadcast message to the Supabase realtime endpoint", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    const broadcast = createBroadcaster("http://sb.local", "service-key");
    await broadcast("sale:s1", "lot-opened", { lotId: "l1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://sb.local/realtime/v1/api/broadcast");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.apikey).toBe("service-key");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages[0]).toEqual({
      topic: "sale:s1",
      event: "lot-opened",
      payload: { lotId: "l1" },
    });
  });

  it("never throws when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const broadcast = createBroadcaster("http://sb.local", "service-key");
    await expect(
      broadcast("sale:s1", "sale-ended", {})
    ).resolves.toBeUndefined();
  });
});
