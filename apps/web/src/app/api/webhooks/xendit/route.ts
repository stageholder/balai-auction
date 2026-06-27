import { NextResponse, type NextRequest } from "next/server";
import { prisma, markInvoicePaid } from "@/lib/db";
import { verifyCallbackToken, isPaidXenditStatus } from "@/lib/xendit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyCallbackToken(request.headers.get("x-callback-token"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: { external_id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const { external_id, status } = body;
  if (!external_id || !status) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
  }

  // external_id is our Invoice.id. Acknowledge (200) regardless so Xendit
  // stops retrying; only paid statuses transition the invoice.
  if (isPaidXenditStatus(status)) {
    const transitioned = await markInvoicePaid(prisma, external_id);
    return NextResponse.json({ ok: true, transitioned });
  }
  return NextResponse.json({ ok: true, ignored: status });
}
