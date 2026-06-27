# Phase 3A — Consignment Intake (operator-entered) — Design

**Status:** pending spec review.
**Part of:** Phase 3 (seller-side). Phase 3 decomposes into **A) Consignment intake** (this) → **B) Seller settlement & payouts** → **C) Consignor KYC/AML** → **D) Editorial / department pages**. This is sub-project **A**, the foundation the rest build on.
**Workflow:** committed directly to `main` (pre-production), keeping the subagent-driven TDD + review discipline. See [[workflow-main-branch]], [[phase2-progress]], [[public-experience-progress]], [[project-overview]].

## Decisions (from the user)

- **Operator-entered intake** — staff record the consignor and terms; **no public "Sell with us" submission form** (may be added in a later pass).
- **Single house-default commission %** — one configurable seller-commission rate applied to all lots in a sale (not per-lot, not per-consignor).

## Problem

The data model already has the seller-side skeleton — `UserRole.consignor`, `Lot.consignorId` (nullable, with a `ConsignorLots` relation), the party-aware `LedgerEntry` (`buyer|seller|house`) and `LedgerKind` (`…|payout|refund`). But none of it is reachable: the user admin only toggles staff↔buyer (never `consignor`), the lot form has no consignor field, and there is no seller-commission rate anywhere. So today no lot can record who consigned it or on what terms — which blocks all of seller settlement.

## Goal

Let staff **record who consigned each lot and the sale's seller-commission rate**, so sub-project B can compute and pay consignor proceeds. Strictly intake/recording — no settlement math, no payouts here.

## Architecture & scope

Small, additive, mostly admin + DB. Three moving parts:

1. **Seller-commission rate (sale-level).** A new `Sale.sellerCommissionPct` (integer percent), consistent with the existing `buyersPremiumPct`/`taxPct` sale-level percentages, defaulting to a house constant. This is the "single house default applied to all lots in the sale." B reads it to compute the consignor's net.
2. **Consignor onboarding.** Staff can set a user's role to `consignor` (the user admin's binary staff/buyer toggle becomes a 3-way role selector).
3. **Consignor on lots.** The admin lot form gets a consignor picker (the `consignor`-role users) wired through the existing `createLot`/`updateLot` `consignorId` support, validated server-side; the admin lot list shows each lot's consignor.

### Data model

- `@auction/core`: `export const DEFAULT_SELLER_COMMISSION_PCT = 10;` (the house default; reused by the sale form and documents intent). A small validator `isValidCommissionPct(n)` (0–100 integer) for the action boundary.
- `@auction/db`:
  - `Sale.sellerCommissionPct Int @default(10)` (migration; existing sales get 10). `SaleRecord.sellerCommissionPct: number`; `NewSale`/`UpdateSale` accept it (optional). Mapper + create/update passthrough.
  - `NewLot.consignorId?: string | null` and `UpdateLot.consignorId?: string | null` (passthrough; `createLot` already sets `consignorId` — ensure `updateLot` does too). `LotRecord.consignorId: string | null` surfaced.
  - `listConsignors(db): Promise<UserRecord[]>` — users with `role === "consignor"`, for the picker.

### Admin (all UI via the `frontend-design` skill)

- **User admin role control:** replace the staff/buyer `RoleToggle` with a **role selector** (`buyer` / `consignor` / `staff`) → a `setUserRole(userId, role)` action (`requireStaff`, validates the role). Existing staff/buyer behavior preserved; `consignor` now selectable.
- **Sale form:** a **Seller commission (%)** input next to buyer's premium / tax — `defaultValue = sale?.sellerCommissionPct ?? DEFAULT_SELLER_COMMISSION_PCT`; the sale action parses + validates it (`isValidCommissionPct`, else the default).
- **Lot form:** a **Consignor** `<select>` — "— None —" + `listConsignors` users (label by email/name) — `defaultValue = lot?.consignorId ?? ""`; `createLotAction`/`updateLotAction` pass `consignorId` (empty → null), validating the id belongs to a consignor (else null).
- **Lot list:** show each lot's consignor (email) in the admin lots table.

## Access & security

- All new actions re-gate with `requireStaff` (the established admin pattern).
- The consignor picker and role selector validate inputs server-side: an unknown/empty consignor id → `null`; an invalid role → rejected; commission outside 0–100 → the default. No public surface changes; nothing consignor-related is exposed to buyers or anonymous users in this sub-project.
- Money/percent discipline unchanged (integer percents, integer rupiah).

## Testing

- **TDD (unit):** `DEFAULT_SELLER_COMMISSION_PCT` value; `isValidCommissionPct` (0/100 inclusive, >100 / negative / non-integer rejected).
- **TDD (DB):** `Sale.sellerCommissionPct` default 10 + create/update round-trip; `createLot`/`updateLot` `consignorId` set/clear; `listConsignors` returns only `consignor`-role users.
- **Build + manual:** the role selector, sale-form commission input, lot-form consignor picker, and lot-list consignor column (admin-only, `frontend-design`-built; verified by build + review).
- Suites stay green: core (39→), db (68→), web (32→), live-runner (7).

## Global Constraints

- **Node.js >= 20**, **pnpm only**; commit directly to `main`.
- **All UI via the `frontend-design` skill**; tokens-only (no hex); no new UI deps. (Admin surfaces still deserve the same care.)
- **Reuse, don't fork:** extend the existing user/sale/lot admin in place; reuse `createLot`/`updateLot` `consignorId`; mirror the `buyersPremiumPct`/`taxPct` patterns for `sellerCommissionPct`.
- **Every admin action re-gates with `requireStaff`.**
- Integer percents; integer rupiah; **Next.js 15** patterns.
- **TDD** for core + db; admin UI by build + review.

## Decomposition (for writing-plans)

One plan, ~6 tasks:
1. `@auction/core` — `DEFAULT_SELLER_COMMISSION_PCT` + `isValidCommissionPct` (+ tests).
2. `@auction/db` — `Sale.sellerCommissionPct` (schema/types/mapper/create-update) (+ tests).
3. `@auction/db` — `consignorId` on `NewLot`/`UpdateLot` (+ `LotRecord`) + `listConsignors` (+ tests).
4. `apps/web` — user-admin role selector (buyer/consignor/staff) + `setUserRole` action. (frontend-design)
5. `apps/web` — sale-form Seller-commission input + action parse/validate. (frontend-design)
6. `apps/web` — lot-form consignor picker + action wiring + lot-list consignor column. (frontend-design)

## After this sub-project

**B) Seller settlement & payouts:** `computeSellerSettlement(hammer, sellerCommissionPct)` in `@auction/core` (consignor net + house commission), write `seller`/`house` `LedgerEntry`s on settlement, a settlement statement, and Xendit **Disbursement** payouts triggered after the buyer pays (`markInvoicePaid` hook). Then **C) Consignor KYC/AML** and **D) Editorial / department pages**.
