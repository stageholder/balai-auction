import { NextResponse, type NextRequest } from "next/server";
import { prisma, closeDueLots } from "@/lib/db";
import { broadcastLotPrice } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await closeDueLots(prisma, new Date());

  // Notify live viewers that closed lots have ended.
  await Promise.all(
    results
      .filter((r) => r.outcome !== "skipped")
      .map((r) =>
        broadcastLotPrice(r.lotId, {
          currentPrice: r.hammerPrice,
          closesAt: new Date().toISOString(),
          bidCount: 0,
          status: r.outcome,
        })
      )
  );

  return NextResponse.json({
    closed: results.filter((r) => r.outcome !== "skipped").length,
    results,
  });
}
