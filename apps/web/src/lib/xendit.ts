import "server-only";
import { timingSafeEqual } from "node:crypto";

const XENDIT_API = "https://api.xendit.co";

/** Xendit invoice statuses that mean the buyer has paid. */
export function isPaidXenditStatus(status: string): boolean {
  return status === "PAID" || status === "SETTLED";
}

/** True when the webhook's x-callback-token matches our configured token.
 *  Uses a constant-time comparison to avoid leaking the token via timing. */
export function verifyCallbackToken(header: string | null): boolean {
  const token = process.env.XENDIT_CALLBACK_TOKEN;
  if (!token || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(token);
  // Length comparison is not secret; timingSafeEqual requires equal lengths.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Create a Xendit hosted invoice and return its id + payment page URL. */
export async function createXenditInvoice(params: {
  externalId: string;
  amount: number;
  payerEmail: string;
  description: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
}): Promise<{ id: string; invoiceUrl: string }> {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new Error("XENDIT_SECRET_KEY is not set");

  const auth = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(`${XENDIT_API}/v2/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      external_id: params.externalId,
      amount: params.amount,
      payer_email: params.payerEmail,
      description: params.description,
      currency: "IDR",
      success_redirect_url: params.successRedirectUrl,
      failure_redirect_url: params.failureRedirectUrl,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Xendit createInvoice failed: ${res.status} ${detail}`);
  }
  const data = (await res.json()) as { id: string; invoice_url: string };
  return { id: data.id, invoiceUrl: data.invoice_url };
}

/** Create a Xendit disbursement (consignor payout) and return its id + status. */
export async function createDisbursement(params: {
  externalId: string;
  amount: number;
  bankCode: string;
  accountHolderName: string;
  accountNumber: string;
  description: string;
}): Promise<{ id: string; status: string }> {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new Error("XENDIT_SECRET_KEY is not set");

  const auth = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(`${XENDIT_API}/disbursements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
      "X-IDEMPOTENCY-KEY": params.externalId,
    },
    body: JSON.stringify({
      external_id: params.externalId,
      amount: params.amount,
      bank_code: params.bankCode,
      account_holder_name: params.accountHolderName,
      account_number: params.accountNumber,
      description: params.description,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Xendit disbursement failed: ${res.status} ${detail}`);
  }
  const json = (await res.json()) as { id: string; status: string };
  return { id: json.id, status: json.status };
}

/** True when a disbursement has been fully processed by Xendit. */
export function isCompletedDisbursementStatus(status: string): boolean {
  return status === "COMPLETED";
}

/** True when a disbursement has permanently failed. */
export function isFailedDisbursementStatus(status: string): boolean {
  return status === "FAILED";
}

/** Fetch an existing Xendit invoice (to reuse a still-pending one). Returns
 *  null if it cannot be retrieved. */
export async function getXenditInvoice(
  id: string
): Promise<{ id: string; status: string; invoiceUrl: string } | null> {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new Error("XENDIT_SECRET_KEY is not set");

  const auth = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(`${XENDIT_API}/v2/invoices/${id}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    id: string;
    status: string;
    invoice_url: string;
  };
  return { id: data.id, status: data.status, invoiceUrl: data.invoice_url };
}
