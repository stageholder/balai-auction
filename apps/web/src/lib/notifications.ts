import "server-only";
import { formatRupiah } from "@/lib/format";
import { sendEmail } from "@/lib/email";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Escape a value before interpolating it into email HTML, so staff-entered
 *  titles can't inject markup into emails sent to buyers. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrap(heading: string, body: string): string {
  return `<div style="font-family:Georgia,serif;color:#1a1a1a;max-width:480px">
  <h1 style="font-size:20px;font-weight:500">${heading}</h1>
  <div style="font-size:14px;line-height:1.6;color:#3a3a3a">${body}</div>
  <p style="margin-top:24px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#9a9a9a">BALAI — Lelang Seni &amp; Koleksi</p>
</div>`;
}

export function buildRegistrationDecisionEmail(
  saleTitle: string,
  approved: boolean
): { subject: string; html: string } {
  if (approved) {
    return {
      subject: `You're approved to bid — ${saleTitle}`,
      html: wrap(
        "Registration approved",
        `<p>You are now approved to bid in <strong>${esc(saleTitle)}</strong>. We wish you the best of luck.</p>`
      ),
    };
  }
  return {
    subject: `Registration not approved — ${saleTitle}`,
    html: wrap(
      "Registration not approved",
      `<p>Unfortunately your registration for <strong>${esc(saleTitle)}</strong> was not approved. Please contact us if you have questions.</p>`
    ),
  };
}

export function buildOutbidEmail(
  lotTitle: string,
  lotUrl: string
): { subject: string; html: string } {
  return {
    subject: `You've been outbid — ${lotTitle}`,
    html: wrap(
      "You've been outbid",
      `<p>Another bidder has surpassed your maximum on <strong>${esc(lotTitle)}</strong>.</p>
       <p><a href="${esc(lotUrl)}">View the lot and raise your bid →</a></p>`
    ),
  };
}

export function buildWonEmail(
  lotTitle: string,
  lotUrl: string
): { subject: string; html: string } {
  return {
    subject: `Congratulations — you won ${lotTitle}`,
    html: wrap(
      "Congratulations",
      `<p>You are the winning bidder for <strong>${esc(lotTitle)}</strong>.</p>
       <p><a href="${esc(lotUrl)}">View the lot →</a> An invoice is now available under <a href="${appUrl()}/invoices">Your invoices</a>.</p>`
    ),
  };
}

export function buildReceiptEmail(
  lotTitle: string,
  total: number
): { subject: string; html: string } {
  return {
    subject: `Payment received — ${lotTitle}`,
    html: wrap(
      "Payment received",
      `<p>We have received your payment of <strong>${formatRupiah(total)}</strong> for <strong>${esc(lotTitle)}</strong>. Thank you.</p>`
    ),
  };
}

export async function notifyRegistrationDecision(
  to: string,
  saleTitle: string,
  approved: boolean
): Promise<void> {
  await sendEmail({ to, ...buildRegistrationDecisionEmail(saleTitle, approved) });
}

export async function notifyOutbid(
  to: string,
  lotTitle: string,
  lotId: string
): Promise<void> {
  await sendEmail({ to, ...buildOutbidEmail(lotTitle, `${appUrl()}/lots/${lotId}`) });
}

export async function notifyWon(
  to: string,
  lotTitle: string,
  lotId: string
): Promise<void> {
  await sendEmail({ to, ...buildWonEmail(lotTitle, `${appUrl()}/lots/${lotId}`) });
}

export async function notifyReceipt(
  to: string,
  lotTitle: string,
  total: number
): Promise<void> {
  await sendEmail({ to, ...buildReceiptEmail(lotTitle, total) });
}
