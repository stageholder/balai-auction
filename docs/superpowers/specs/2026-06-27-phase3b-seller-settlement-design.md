# Phase 3B — Seller Settlement & Payouts — Design

**Status:** pending spec review.
**Part of:** Phase 3 (seller-side). Follows **3A (consignment intake)**; precedes **3C (consignor KYC/AML)** and **3D (editorial)**. Built directly on `main` (pre-production). See [[phase3-progress]], [[workflow-main-branch]].

## Decisions (from the user)

- **Staff-approved release** — settlement is computed automatically when the buyer pays, but a staff member reviews the statement and clicks **Release payout** to send the disbursement. No automatic money movement.
- **Seller commission only** — consignor net = `hammer − seller commission`. No per-lot expenses this phase (forward-compatible).

## Problem

3A records *who* consigned each lot (`Lot.consignorId`) and the *rate* (`Sale.sellerCommissionPct`), but the system computes and pays the consignor nothing. The ledger today writes **buyer-only** entries on close (`computeInvoice`); the `seller`/`house` `LedgerParty` values and the `payout` `LedgerKind` are defined but unused. There is no settlement statement, no payout tracking, no disbursement, and no consignor payout destination (bank account). So a sold consigned lot leaves the consignor unpaid and unrecorded on the seller side.

## Goal

When a buyer pays for a **consigned** lot, automatically compute the split and record the seller/house ledger entries + a **pending Payout**; let staff review a **settlement statement** and **release** the payout via **Xendit Disbursement** to the consignor's bank account; track the payout to completion. Consignor net = `hammer − seller commission`; house keeps the seller commission (plus the buyer's premium already recorded on the buyer invoice).

## Architecture

### `@auction/core` — the pure settlement math

```ts
export interface SellerSettlement {
  hammer: Money;
  sellerCommission: Money;   // round(hammer * sellerCommissionPct / 100)
  consignorNet: Money;       // hammer - sellerCommission
  entries: LedgerEntry[];    // settlement-time allocation (see below)
}

export function computeSellerSettlement(params: {
  hammer: Money;
  sellerCommissionPct: number;
}): SellerSettlement;
```
- `sellerCommission = round(hammer * sellerCommissionPct / 100)`; `consignorNet = hammer − sellerCommission`.
- **Settlement-time `entries`** (the allocation, written when the buyer pays):
  - `{ party: "seller", kind: "hammer", amount: hammer }`
  - `{ party: "house",  kind: "commission", amount: sellerCommission }`
- The **payout** entry (`{ party: "seller", kind: "payout", amount: consignorNet }`) is written later, when the disbursement completes — money actually leaving.
- Pure, integer rupiah, fully unit-tested (incl. 0% and 100% commission edges).

A new `LedgerKind` value **`commission`** is added (additive enum migration; the migration only *adds* the value, app code *uses* it at runtime — never both in one migration, per the known PG constraint).

### `@auction/db` — persistence + the settlement trigger

- **`commission` LedgerKind** (schema enum + TS union).
- **Consignor payout account** (so a payout has a destination): `User.payoutBankCode`, `User.payoutAccountNumber`, `User.payoutAccountHolder` (all nullable strings; set by staff during consignor onboarding). A consignor with incomplete payout details cannot have a payout *released* (computed/recorded is fine).
- **`Payout` model** — one per sold consigned lot:
  ```prisma
  model Payout {
    id                   String       @id @default(uuid())
    lotId                String       @unique
    lot                  Lot          @relation(fields: [lotId], references: [id])
    consignorId          String
    consignor            User         @relation("ConsignorPayouts", fields: [consignorId], references: [id])
    amount               BigInt       // consignorNet (rupiah)
    status               PayoutStatus @default(pending)
    xenditDisbursementId String?
    createdAt            DateTime     @default(now())
    releasedAt           DateTime?
    paidAt               DateTime?
  }
  enum PayoutStatus { pending released paid failed }
  ```
- **Settlement trigger inside `markInvoicePaid`** (the existing transactional buyer-pay transition): when an invoice transitions `pending → paid`, if the lot has a `consignorId`, also (in the same transaction): compute `computeSellerSettlement(hammer = invoice.hammer, sellerCommissionPct = sale.sellerCommissionPct)`, write the seller/house `LedgerEntry`s (linked to `lotId`+`invoiceId`), and `create` the `Payout` (`pending`, `amount = consignorNet`, `consignorId`). Idempotent: the `Payout.lotId @unique` + the existing `pending→paid` claim guard prevent double-settlement. Lots with no consignor (house-owned) get no payout.
- **Repos:** `getPayout`/`listPayouts` (with lot+consignor+sale info for the admin), `listPendingPayouts`, `releasePayout(db, payoutId, xenditDisbursementId)` (guarded `pending→released`), `markPayoutPaid(db, xenditDisbursementId)` (guarded `released→paid`, writes the `seller payout` ledger entry), `markPayoutFailed`. Consignor payout-account getters/setters.

### `apps/web` — disbursement + admin

- **Xendit Disbursement client** (`@/lib/xendit` additions): `createDisbursement({ externalId, amount, bankCode, accountNumber, accountHolderName, description })` → `{ id, status }`, and a disbursement webhook-token/path. Abstracted exactly like the existing `createXenditInvoice` — **build-verified + logic-tested; needs real Xendit disbursement keys + balance to run live** (documented in `docs/operations`, mirroring the Invoice integration).
- **Admin settlements/payouts** (`/admin/payouts`, `requireStaff`, `frontend-design`): a list of payouts with the settlement statement per lot (hammer, seller commission, consignor net, consignor + bank status, payout status). **Release payout** action (staff): guards `pending`, requires the consignor's payout bank details, calls `createDisbursement`, then `releasePayout` with the returned id. Blocks release with a clear message if bank details are missing.
- **Consignor payout details** entry: staff set `payoutBankCode`/`payoutAccountNumber`/`payoutAccountHolder` on a consignor (extend the user admin or a consignor edit view).
- **Disbursement webhook** (`/api/webhooks/xendit-disbursement` or the existing webhook extended): on a completed disbursement → `markPayoutPaid`; on failure → `markPayoutFailed`. Timing-safe token check, mirroring the invoice webhook.

## Access & security

- All admin actions + the release action re-gate with `requireStaff`. The disbursement webhook verifies its callback token (timing-safe), like the invoice webhook.
- **No automatic money movement:** settlement only *records* + creates a `pending` payout; a disbursement is created only by an explicit staff **Release** action.
- **3A precondition honored:** settlement reads the consignor from the stored **`lot.consignorId` FK** (not from role/`listConsignors`), so a post-assignment role change can't drop a settlement.
- Idempotency: `Payout.lotId @unique` + guarded status transitions (`pending→released→paid`) prevent double-pay; the disbursement uses a stable `externalId` (e.g. `payout-{payoutId}`).
- Money is integer rupiah / `BigInt` at the boundary throughout.

## Testing

- **TDD (core):** `computeSellerSettlement` — commission rounding, `consignorNet`, the two settlement entries; 0%/100% edges.
- **TDD (db):** `markInvoicePaid` now writes seller(`hammer`)+house(`commission`) entries and a `pending` Payout for a consigned lot (and **none** for a non-consigned lot); double-mark is idempotent (no duplicate payout/entries). `releasePayout`/`markPayoutPaid`/`markPayoutFailed` guarded transitions; `markPayoutPaid` writes the `seller payout` entry. Consignor payout-account round-trip.
- **Build + manual:** the Xendit disbursement client (logic-tested w/ mocked fetch, like the broadcaster), the `/admin/payouts` page + release flow, the disbursement webhook (admin-only / server; `frontend-design` for the admin UI; live disbursement needs real keys — documented).
- Suites stay green: core (42→), db (72→), web (32→), live-runner (7).

## Global Constraints

- **Node.js >= 20**, **pnpm only**; commit directly to `main`.
- **All UI via `frontend-design`**; tokens-only; no new UI deps (Xendit is called via `fetch`, like the existing invoice client — no SDK).
- **No automatic disbursement** — staff-approved release only.
- **Seller commission only** — no expenses this phase.
- **Idempotent, guarded money transitions**; integer rupiah/`BigInt`; reuse the `markInvoicePaid` transaction + the Xendit/webhook patterns.
- Settlement sources the consignor from `lot.consignorId`.
- **TDD** for core + db; disbursement client + admin UI by build + logic-test + review.

## Decomposition (for writing-plans)

Likely **two plans** (money math + tracking first, then the live disbursement mechanism), or one larger plan:

**Plan B-1 — Settlement core + ledger + Payout (no live disbursement):**
1. core `computeSellerSettlement` + `commission` LedgerKind (+ tests).
2. db `commission` enum + `Payout` model + `PayoutStatus` + consignor payout-account fields (migration, types).
3. db settlement inside `markInvoicePaid` (seller/house entries + pending Payout, idempotent) (+ tests).
4. db payout repos (`listPayouts`/`listPendingPayouts`/`releasePayout`/`markPayoutPaid`/`markPayoutFailed` + account setters) (+ tests).
5. web `/admin/payouts` settlement-statement + payouts list (read-only view) + consignor payout-details entry. (frontend-design)

**Plan B-2 — Disbursement + release + webhook:**
6. web Xendit `createDisbursement` client (+ logic test).
7. web Release-payout action (staff; requires bank details; createDisbursement → releasePayout) + button on /admin/payouts. (frontend-design)
8. web disbursement webhook → `markPayoutPaid`/`markPayoutFailed` (timing-safe token) + the `seller payout` ledger entry on completion.

writing-plans will finalize the split. After 3B: **3C consignor KYC/AML**, **3D editorial/department pages**.
