import { NextResponse } from "next/server";
import { prisma, getInvoiceById, markInvoicePaid } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getXenditInvoice, isPaidXenditStatus } from "@/lib/xendit";

export const dynamic = "force-dynamic";

/**
 * Xendit success-redirect lands here. We confirm the payment with Xendit's API
 * before finalising the invoice — the redirect alone is never trusted. This
 * also lets payment complete in local dev without a publicly-reachable webhook
 * (the webhook still finalises it independently in deployed environments).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${base}/sign-in`);
  if (!id) return NextResponse.redirect(`${base}/invoices`);

  const invoice = await getInvoiceById(prisma, id);
  if (!invoice || invoice.buyerId !== user.id) {
    return NextResponse.redirect(`${base}/invoices`);
  }
  if (invoice.status === "paid") {
    return NextResponse.redirect(`${base}/invoices?paid=1`);
  }

  if (invoice.xenditInvoiceId) {
    try {
      const xendit = await getXenditInvoice(invoice.xenditInvoiceId);
      if (xendit && isPaidXenditStatus(xendit.status)) {
        await markInvoicePaid(prisma, invoice.id);
        return NextResponse.redirect(`${base}/invoices?paid=1`);
      }
    } catch (err) {
      console.error(
        "invoice confirm failed:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Not confirmed paid yet — the webhook will finalise it shortly.
  return NextResponse.redirect(`${base}/invoices?pending=1`);
}
