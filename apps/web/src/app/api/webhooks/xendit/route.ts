import { NextResponse, type NextRequest } from "next/server";
import { prisma, markInvoicePaid, getInvoiceById, getUser, getLot } from "@/lib/db";
import { verifyCallbackToken, isPaidXenditStatus } from "@/lib/xendit";
import { notifyReceipt } from "@/lib/notifications";

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
    if (transitioned) {
      // Receipt email is best-effort and runs AFTER the payment is committed —
      // a lookup/send failure here must not turn a recorded payment into a 500.
      try {
        const invoice = await getInvoiceById(prisma, external_id);
        if (invoice) {
          const [buyer, lot] = await Promise.all([
            getUser(prisma, invoice.buyerId),
            getLot(prisma, invoice.lotId),
          ]);
          if (buyer && lot) {
            await notifyReceipt(buyer.email, lot.title, invoice.total);
          }
        }
      } catch (err) {
        console.error(`receipt email failed for invoice ${external_id}:`, err);
      }
    }
    return NextResponse.json({ ok: true, transitioned });
  }
  return NextResponse.json({ ok: true, ignored: status });
}
