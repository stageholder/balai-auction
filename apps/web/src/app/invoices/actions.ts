"use server";

import { prisma, getInvoiceById, setInvoiceXenditId } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createXenditInvoice } from "@/lib/xendit";

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
  try {
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
  } catch {
    return { ok: false, error: "Could not start payment. Please try again." };
  }
}
