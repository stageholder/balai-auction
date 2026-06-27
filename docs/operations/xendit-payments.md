# Xendit payments

Buyers pay won-lot invoices via Xendit hosted checkout; a webhook reconciles
payment.

## Env (apps/web/.env.local)
- `XENDIT_SECRET_KEY` — Xendit **test** secret key for development.
- `XENDIT_CALLBACK_TOKEN` — a token you set; paste the same value into the
  Xendit dashboard webhook settings.
- `NEXT_PUBLIC_APP_URL` — absolute base URL for success/failure redirects.

## Flow
1. A lot closes `sold` (Plan 5 cron) → `Invoice` row written `status: pending`.
2. Buyer opens `/invoices` → **Pay now** → `startInvoicePayment` creates a
   Xendit invoice (`external_id` = our `Invoice.id`) and redirects to
   `invoice_url`.
3. Buyer pays on Xendit's page (cards / VA / e-wallet / QRIS).
4. Xendit POSTs the invoice webhook to `/api/webhooks/xendit` with header
   `x-callback-token`. We verify it, then `markInvoicePaid` flips
   `Invoice.status → paid` and `Lot.status → paid` (idempotent).

## Webhook setup (Xendit dashboard)
Set the **Invoices** callback URL to `https://<your-app>/api/webhooks/xendit`
and the callback token to `XENDIT_CALLBACK_TOKEN`.

## Local testing
Expose localhost with a tunnel (e.g. `ngrok http 3000`) and point the Xendit
dashboard webhook at the tunnel URL. Simulate a paid event:

    curl -X POST http://localhost:3000/api/webhooks/xendit \
      -H "x-callback-token: $XENDIT_CALLBACK_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"external_id":"<our-invoice-id>","status":"PAID"}'

A wrong/absent token returns 401; a paid status flips the invoice + lot; a
non-paid status is acknowledged (200) and ignored.
