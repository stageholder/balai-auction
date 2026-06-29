import { NextResponse, type NextRequest } from "next/server";
import { prisma, markPayoutPaid, markPayoutFailed } from "@/lib/db";
import {
  verifyCallbackToken,
  isCompletedDisbursementStatus,
  isFailedDisbursementStatus,
} from "@/lib/xendit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyCallbackToken(request.headers.get("x-callback-token"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const { id, status } = body;
  if (!id || !status) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
  }

  // Acknowledge (200) regardless so Xendit stops retrying; only
  // terminal statuses transition the payout (best-effort, never throws).
  try {
    if (isCompletedDisbursementStatus(status)) {
      await markPayoutPaid(prisma, id);
    } else if (isFailedDisbursementStatus(status)) {
      await markPayoutFailed(prisma, id);
    }
  } catch (err) {
    console.error(`disbursement webhook error for id ${id}:`, err);
  }

  return NextResponse.json({ ok: true });
}
