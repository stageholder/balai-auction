# Xendit disbursement (consignor payouts)

After a buyer pays for a **consigned** lot, the system records a pending
`Payout` (consignor net = hammer − seller commission). A staff member reviews
the settlement on `/admin/payouts` and **releases** the payout; a Xendit
**Disbursement** pays the consignor's bank account, and a webhook reconciles
the result. This is the money-out counterpart to [Xendit payments](./xendit-payments.md).

## Env (apps/web/.env.local)
- `XENDIT_SECRET_KEY` — same key as the Invoice client, but the Xendit account
  must have **Money-out / Disbursement** permission enabled, and a funded
  balance (Cash/test balance in test mode) to actually disburse.
- `XENDIT_CALLBACK_TOKEN` — reused for the disbursement callback verification
  (the webhook checks the `x-callback-token` header, timing-safe).

## Pre-release requirement
The consignor must have **payout bank details on file** —
`payoutBankCode` / `payoutAccountNumber` / `payoutAccountHolder`, set by staff
in `/admin/users` (the per-consignor payout-account form). On `/admin/payouts`,
a pending payout with missing bank details shows a disabled **Release** button
("Missing" + an "Add in Users" hint).

## Payout lifecycle
1. **pending** — created in `markInvoicePaid` when a buyer pays a consigned lot
   (writes `seller/hammer` + `house/commission` ledger entries; amount = net).
2. Staff click **Release** (`/admin/payouts`) → `createDisbursement` (external
   id `payout-{payoutId}`, the consignor's bank details) → `pending → released`,
   storing the Xendit disbursement id.
3. Xendit POSTs the **Disbursement** webhook to
   `/api/webhooks/xendit-disbursement` with `x-callback-token`. We verify it,
   then:
   - `COMPLETED` → `markPayoutPaid` → `released → paid` and a `seller/payout`
     ledger entry is written (money actually out).
   - `FAILED` → `markPayoutFailed` → `released → failed`.
4. A **failed** payout shows a **Re-arm** button → `rearmPayout`
   (`failed → pending`, clears the disbursement id) so staff can release again.

## Idempotency / safety
- `external_id = payout-{payoutId}` + `X-IDEMPOTENCY-KEY` → a duplicate/retry
  release hits the same Xendit disbursement (no double-pay).
- `Payout.xenditDisbursementId` is `@unique`; the webhook claims by it with a
  guarded `released → paid`/`failed` transition, so a duplicate callback is a
  safe no-op (returns 200, no second ledger entry).
- A release is only ever triggered by an explicit, `requireStaff`-gated action —
  never automatically.

## Webhook setup (Xendit dashboard)
Set the **Disbursement** callback URL to
`https://<your-app>/api/webhooks/xendit-disbursement` and the callback token to
`XENDIT_CALLBACK_TOKEN` (same value as the invoice webhook).

## Local testing
Built + logic-tested; **live disbursement needs the real key/balance/webhook
above.** Expose localhost with a tunnel (e.g. `ngrok http 3000`) and simulate a
completed disbursement:

    curl -X POST http://localhost:3000/api/webhooks/xendit-disbursement \
      -H "x-callback-token: $XENDIT_CALLBACK_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"id":"<xendit-disbursement-id>","status":"COMPLETED"}'

A wrong/absent token returns 401; `COMPLETED` flips the payout to `paid` and
writes the `seller/payout` ledger entry; `FAILED` flips it to `failed`; an
unknown id is acknowledged (200) and ignored.
