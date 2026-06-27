import { NextResponse, type NextRequest } from "next/server";
import { prisma, closeDueLots, getUser, getLot } from "@/lib/db";
import { broadcastLotPrice } from "@/lib/realtime";
import { notifyWon } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await closeDueLots(prisma, new Date());

  // Notify live viewers of the final hammer price on lots that sold. (Unsold
  // lots have hammerPrice 0, which would zero a viewer's price display, so we
  // don't broadcast a price for them — their countdown shows "ended".)
  // allSettled is defensive; broadcastLotPrice already swallows its own errors.
  await Promise.allSettled(
    results
      .filter((r) => r.outcome === "sold")
      .map((r) =>
        broadcastLotPrice(r.lotId, {
          currentPrice: r.hammerPrice,
          closesAt: new Date().toISOString(),
          status: "sold",
        })
      )
  );

  await Promise.allSettled(
    results
      .filter((r) => r.outcome === "sold" && r.winnerId)
      .map(async (r) => {
        const [winner, lot] = await Promise.all([
          getUser(prisma, r.winnerId as string),
          getLot(prisma, r.lotId),
        ]);
        if (winner && lot) await notifyWon(winner.email, lot.title, lot.id);
      })
  );

  return NextResponse.json({
    closed: results.filter((r) => r.outcome !== "skipped").length,
    results,
  });
}
