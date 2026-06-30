"use server";

import {
  prisma,
  getInvoiceById,
  setInvoiceXenditId,
  markInvoicePaid,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createXenditInvoice, getXenditInvoice } from "@/lib/xendit";

export async function startInvoicePayment(
  invoiceId: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const user = await requireUser();

  const invoice = await getInvoiceById(prisma, invoiceId);
  if (!invoice || invoice.buyerId !== user.id) {
    return { ok: false, error: "Invoice not found." };
  }
  if (invoice.status !== "pending") {
    return { ok: false, error: "This invoice is not awaiting payment." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Local dev only: with no Xendit key, simulate a successful payment so the
  // whole flow (invoice → paid → consignor settlement & payout) is testable.
  // markInvoicePaid is exactly what the real Xendit webhook calls. Gated to
  // NODE_ENV === "development" (true only under `next dev`), so a deployed
  // build NEVER bypasses payment regardless of env-var state.
  if (!process.env.XENDIT_SECRET_KEY && process.env.NODE_ENV === "development") {
    await markInvoicePaid(prisma, invoice.id);
    return { ok: true, url: `${appUrl}/invoices?paid=1` };
  }

  try {
    // Reuse an already-open Xendit invoice instead of minting a new one, so a
    // second "Pay now" (back-button / two tabs) can't lead to two completed
    // checkouts (a double charge). Only create fresh if none exists or the
    // prior one is no longer payable.
    if (invoice.xenditInvoiceId) {
      const existing = await getXenditInvoice(invoice.xenditInvoiceId).catch(
        () => null
      );
      if (existing && existing.status === "PENDING") {
        return { ok: true, url: existing.invoiceUrl };
      }
    }

    const xendit = await createXenditInvoice({
      externalId: invoice.id,
      amount: invoice.total,
      payerEmail: user.email,
      description: `Payment for lot ${invoice.lotId}`,
      successRedirectUrl: `${appUrl}/invoices?paid=1`,
      failureRedirectUrl: `${appUrl}/invoices?failed=1`,
    });
    await setInvoiceXenditId(prisma, invoice.id, xendit.id);
    return { ok: true, url: xendit.invoiceUrl };
  } catch (err) {
    console.error(
      "startInvoicePayment failed:",
      err instanceof Error ? err.message : String(err)
    );
    return { ok: false, error: "Could not start payment. Please try again." };
  }
}
