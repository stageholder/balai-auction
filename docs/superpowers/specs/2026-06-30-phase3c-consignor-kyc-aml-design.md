# Phase 3C — Consignor KYC / AML — Design

**Status:** pending spec review.
**Part of:** Phase 3 (seller-side). The last planned Phase 3 piece — 3A (intake), 3B (settlement & payouts), 3D (department pages) are done. Built directly on `main` (pre-production). See [[phase3-progress]], [[dx-no-overengineering]], [[workflow-main-branch]].

## Decisions (from the user)

- **Gate at payout only.** A consignor must be **KYC-approved + AML-cleared** before a **payout can be released** — money never moves to an unverified/sanctioned party. Consigning/listing stays unblocked.
- **Built-in name-screen + manual clear/flag.** A pure name-screen against a built-in **sample** watchlist surfaces possible matches; staff adjudicate (cleared/flagged). A production-grade provider (OFAC/UN/PEP) is a documented later swap — not built now (no over-engineering).

## Problem

Buyers have per-sale KYC (`Registration.kycStatus`, staff-reviewed at `/staff/registrations`). **Consignors — the people the house pays — have none.** 3B's payout Release only requires bank details on file; it will disburse to a consignor whose identity was never verified and who was never screened against sanctions. That's the compliance hole this closes.

## Goal

Give staff a way to **verify a consignor's identity and screen them for sanctions**, and **block payout release** until both pass — reusing the buyer-KYC review pattern and the 3B payout gate, kept lean.

## Architecture

### `@auction/core` — pure compliance logic

- `type AmlStatus = "pending" | "cleared" | "flagged"`.
- **Sanctions name-screen** (pure):
  ```ts
  export interface SanctionsEntry { name: string; note: string }
  /** SAMPLE list — replace with a real OFAC/UN/PEP feed in production. */
  export const SANCTIONS_WATCHLIST: SanctionsEntry[];
  /** Returns watchlist entries whose every normalized token is present in the
   *  screened name (case-insensitive, whitespace-normalized) — catches
   *  reordering + extra middle names. */
  export function screenName(name: string, list?: SanctionsEntry[]): SanctionsEntry[];
  ```
- **Payout compliance gate** (pure; the single source of truth, reused by the release action + the admin display):
  ```ts
  export function consignorPayoutGate(input: {
    kycStatus: string;          // must be "approved"
    amlStatus: string;          // must be "cleared"
    bankCode: string | null;
    accountNumber: string | null;
    accountHolder: string | null;
  }): { ok: true } | { ok: false; reason: string };
  ```
  Order: bank details → KYC approved → AML cleared; first failure returns its reason. (Subsumes 3B's bank-details check.)

### `@auction/db` — consignor KYC/AML on the user

- Prisma `enum AmlStatus { pending cleared flagged }`.
- `User` gains (all nullable / defaulted, consignor-scoped): `consignorLegalName String?`, `consignorIdType String?`, `consignorIdNumber String?`, `consignorKycStatus KycStatus @default(pending)`, `consignorAmlStatus AmlStatus @default(pending)`, `consignorAmlNote String?`. (Buyer `Registration.kycStatus` is untouched — consignor KYC is user-level and separate.)
- `UserRecord` carries the new fields; mapper updated.
- Repos: `setConsignorKyc(db, userId, { legalName, idType, idNumber, kycStatus })`; `setConsignorAml(db, userId, { amlStatus, amlNote })`; `listConsignorsForReview(db)` (consignors + their KYC/AML status for the queue). All return/refresh the `UserRecord`.
- `listPayouts` (3B) gains `consignorKycStatus`/`consignorAmlStatus` in its select so `PayoutListItem` can show compliance readiness.

### `apps/web` — staff review + the payout gate (all admin UI via `frontend-design`)

- **Consignor KYC review** (`/staff/consignor-kyc`, `requireStaff`): list consignors with their KYC + AML status. Per consignor:
  - an **identity form** (legal name, ID type, ID number) → `setConsignorKycAction` (captures identity; staff set KYC `approved`/`rejected`);
  - a **"Run sanctions screen"** that calls `screenName(legalName)` and shows any matches (or "no matches");
  - **AML** controls → `setConsignorAmlAction` (`cleared`/`flagged` + optional note).
  All actions `requireStaff`, validate inputs, `revalidatePath`. Mirrors `/staff/registrations`.
- **Payout gate** (`/admin/payouts` + the release action, 3B): `releasePayoutAction` replaces its bare bank-details check with `consignorPayoutGate(...)` (loads the consignor) — a non-compliant consignor returns the gate's `reason` and **no disbursement is created**. `/admin/payouts` shows a compliance indicator per row (KYC / AML / bank), and the **Release** button is disabled (with the reason) until the gate passes.

## Access & security

- All KYC/AML actions + pages re-gate `requireStaff` (admin layer + per-action). No consignor-facing surface (operator-entered, consistent with 3A).
- The payout gate is enforced **server-side in `releasePayoutAction`** (the authoritative check before `createDisbursement`); the page-level disable + indicators are UX only.
- Identity/PII (ID number, legal name) is shown only on staff-gated pages, never logged, never public. The sanctions screen runs locally (pure function) — no PII leaves the server.
- The watchlist is a clearly-marked **sample**; production must swap a real feed (documented in operations).

## Testing

- **TDD (core):** `screenName` — exact match, case-insensitive, token-reorder/extra-token match, no-match, empty; `consignorPayoutGate` — ok when approved+cleared+bank; each failure returns the right reason in priority order.
- **TDD (db):** `setConsignorKyc`/`setConsignorAml` round-trip + status transitions; `listConsignorsForReview` returns only consignor-role users with their statuses; `listPayouts` carries the consignor KYC/AML status.
- **Build + manual:** the `/staff/consignor-kyc` review flow + the gated Release (block when not compliant, allow when approved+cleared+bank) — admin-only, `frontend-design`, verified by build + review.
- Suites stay green: core (47→), db (85→), web (35→), live-runner (7).

## Global Constraints

- **Node.js >= 20**, **pnpm only**; commit directly to `main`.
- **Lean / not over-engineered:** reuse the buyer-KYC review pattern, the 3B payout gate, `requireStaff`; manual AML (sample watchlist) with a documented real-provider seam — no third-party integration now.
- **All admin UI via `frontend-design`**; tokens-only; no new UI deps.
- **Every action `requireStaff`**; gate enforced server-side in the release action; PII staff-only, never logged/public.
- **Reuse, don't fork:** `KycStatus` enum, `getUser`, `listPayouts`, `releasePayoutAction`, the `/staff/registrations` review shape.
- **TDD** for core + db; admin UI by build + review.

## Decomposition (for writing-plans)

One plan, ~4 tasks:
1. `@auction/core` — `AmlStatus` + `screenName` + sample `SANCTIONS_WATCHLIST` + `consignorPayoutGate` (+ tests).
2. `@auction/db` — `AmlStatus` enum + consignor KYC/AML fields on `User` (migration) + types/mapper + `setConsignorKyc`/`setConsignorAml`/`listConsignorsForReview` + `listPayouts` status passthrough (+ tests).
3. `apps/web` — `/staff/consignor-kyc` review page (identity capture + run screen + approve/reject KYC + clear/flag AML). (frontend-design)
4. `apps/web` — gate `releasePayoutAction` on `consignorPayoutGate` + compliance indicators / disabled Release on `/admin/payouts`. (frontend-design)

## After this sub-project

Phase 3 (seller-side) is feature-complete: consign → verify (KYC/AML) → sell → settle → pay (compliance-gated). Operations note: swap the sample watchlist for a real sanctions/PEP feed before production (alongside the existing real-keys items: Xendit invoice + disbursement, Supabase, Resend). User-facing Christie's-completeness follow-ons remain available (site search, save/watchlist, public "Sell with us").
