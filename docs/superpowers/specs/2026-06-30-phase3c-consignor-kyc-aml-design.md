# Phase 3C — Consignor KYC / AML — Design

**Status:** pending spec review.
**Part of:** Phase 3 (seller-side). The last planned Phase 3 piece — 3A (intake), 3B (settlement & payouts), 3D (department pages) are done. Built directly on `main` (pre-production). See [[phase3-progress]], [[dx-no-overengineering]], [[workflow-main-branch]].

## Decisions (from the user)

- **Gate at payout only.** A consignor must be **KYC-approved + AML-cleared** before a **payout can be released** — money never moves to an unverified/sanctioned party. Consigning/listing stays unblocked.
- **Built-in name-screen + manual clear/flag.** A pure name-screen against a built-in **sample** watchlist surfaces possible matches; staff adjudicate (cleared/flagged). A production-grade provider (OFAC/UN/PEP) is a documented later swap — not built now.
- **Consignor self-service KYC.** The consignor enters **their own** identity + payout bank details and submits for review (it's their data — like Christie's). **Staff keep only the decisions** — run the sanctions screen, approve/reject KYC, clear/flag AML — which can't be delegated to the user. (This differs from 3A's operator-entered *item* intake: that was submitting lots to sell; this is a consignor verifying *themselves*.)

## Problem

Buyers have per-sale KYC (`Registration.kycStatus`, staff-reviewed at `/staff/registrations`). **Consignors — the people the house pays — have none.** 3B's payout Release only requires bank details on file (today staff-typed); it will disburse to a consignor whose identity was never verified and who was never screened against sanctions. That's the compliance hole this closes — and the consignor should provide their own details.

## Goal

Let a consignor **submit their own identity + payout details**, let staff **review and screen** them, and **block payout release** until KYC-approved + AML-cleared — reusing the buyer-KYC review pattern and the 3B payout gate, kept lean.

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
- `User` gains (consignor-scoped): `consignorLegalName String?`, `consignorIdType String?`, `consignorIdNumber String?`, `consignorKycStatus KycStatus @default(pending)`, `consignorAmlStatus AmlStatus @default(pending)`, `consignorAmlNote String?`. Payout bank fields (`payoutBankCode`/`payoutAccountNumber`/`payoutAccountHolder`, from 3B) are reused. Buyer `Registration.kycStatus` is untouched.
- `UserRecord` carries the new fields; mapper updated.
- Repos:
  - `submitConsignorKyc(db, userId, { legalName, idType, idNumber, bankCode, accountNumber, accountHolder })` — **the consignor's self-service write**: sets identity + payout details and `consignorKycStatus = "pending"` (resubmittable after a rejection). Returns the `UserRecord`.
  - `setConsignorKycStatus(db, userId, status)` — staff decision (`approved`/`rejected`).
  - `setConsignorAml(db, userId, { amlStatus, amlNote })` — staff decision (`cleared`/`flagged`).
  - `listConsignorsForReview(db)` — consignor-role users + their submitted identity + KYC/AML status, for the staff queue.
- `listPayouts` (3B) gains `consignorKycStatus`/`consignorAmlStatus` in its select so `PayoutListItem` can show compliance readiness.

### `apps/web` — consignor self-service + staff review + the payout gate

- **Consignor self-service** (`/account/verification`, `requireUser`; consignor-role only — others see a short "not a consignor account" note): a logged-in consignor enters **legal name, ID type, ID number, and payout bank details**, and submits → `submitConsignorKycAction` (`requireUser` + own-record only — a user can only submit **their own** KYC; sets status `pending`). The page shows their current **status** (KYC pending/approved/rejected, AML cleared/flagged) and lets them resubmit if rejected. A **Verification** link appears in the account nav for consignor-role users. (`frontend-design`)
- **Staff review** (`/staff/consignor-kyc`, `requireStaff`): the queue from `listConsignorsForReview` — each consignor's submitted identity, a **"Run sanctions screen"** showing `screenName(legalName)` matches (or "no matches"), and controls to **approve/reject KYC** (`setConsignorKycStatusAction`) and **clear/flag AML** (`setConsignorAmlAction`, optional note). Staff decide; they don't type the identity. Mirrors `/staff/registrations`. (`frontend-design`)
- **Payout gate** (`/admin/payouts` + the release action, 3B): `releasePayoutAction` replaces its bare bank-details check with `consignorPayoutGate(...)` — a non-compliant consignor returns the gate's `reason` and **no disbursement is created**. `/admin/payouts` shows a compliance indicator per row (KYC / AML / bank) and disables **Release** (with the reason) until the gate passes. (`frontend-design`)

## Access & security

- **Self-service is own-record-only:** `submitConsignorKycAction` is `requireUser` and writes **only the caller's own** `userId` (never an arbitrary id); non-consignor users get nothing to submit.
- **Decisions are staff-only:** `setConsignorKycStatusAction`/`setConsignorAmlAction` + the review page + the payout gate all `requireStaff`. A consignor can submit data but never approve/clear themselves.
- The payout gate is enforced **server-side in `releasePayoutAction`** (the authoritative check before `createDisbursement`); page indicators/disabled buttons are UX only.
- Identity/PII (ID number, legal name) is shown only to the owning consignor + staff, never logged, never public. The sanctions screen runs locally (pure function) — no PII leaves the server. The watchlist is a clearly-marked **sample** (real feed = production swap, documented in operations).

## Testing

- **TDD (core):** `screenName` — exact, case-insensitive, token-reorder/extra-token, no-match, empty; `consignorPayoutGate` — ok when approved+cleared+bank; each failure returns the right reason in priority order.
- **TDD (db):** `submitConsignorKyc` round-trips identity+bank and sets `pending`; `setConsignorKycStatus`/`setConsignorAml` transitions; `listConsignorsForReview` returns only consignor-role users + statuses; `listPayouts` carries the KYC/AML status.
- **Build + manual:** the consignor self-service submit → staff review (screen + approve + clear) → a now-releasable payout; a non-compliant consignor's Release stays blocked with the reason. Admin/account UI via `frontend-design`, verified by build + review.
- Suites stay green: core (47→), db (85→), web (35→), live-runner (7).

## Global Constraints

- **Node.js >= 20**, **pnpm only**; commit directly to `main`.
- **Lean / not over-engineered:** consignor self-service for data entry; staff for decisions; reuse the buyer-KYC review pattern, the 3B payout gate + bank fields, `requireStaff`/`requireUser`; manual AML (sample watchlist) with a documented real-provider seam — no third-party integration now.
- **All admin/account UI via `frontend-design`**; tokens-only; no new UI deps.
- **Self-service own-record-only; decisions staff-only; gate server-side** in the release action; PII owner+staff-only, never logged/public.
- **Reuse, don't fork:** `KycStatus` enum, `getUser`, `listPayouts`, `releasePayoutAction`, the `/staff/registrations` review shape, the 3B payout bank fields.
- **TDD** for core + db; UI by build + review.

## Decomposition (for writing-plans)

One plan, ~5 tasks:
1. `@auction/core` — `AmlStatus` + `screenName` + sample `SANCTIONS_WATCHLIST` + `consignorPayoutGate` (+ tests).
2. `@auction/db` — `AmlStatus` enum + consignor KYC/AML fields on `User` (migration) + types/mapper + `submitConsignorKyc`/`setConsignorKycStatus`/`setConsignorAml`/`listConsignorsForReview` + `listPayouts` status passthrough (+ tests).
3. `apps/web` — consignor self-service `/account/verification` (own-record submit of identity + bank details, status display, account-nav link). (frontend-design)
4. `apps/web` — staff `/staff/consignor-kyc` review (run screen + approve/reject KYC + clear/flag AML). (frontend-design)
5. `apps/web` — gate `releasePayoutAction` on `consignorPayoutGate` + compliance indicators / disabled Release on `/admin/payouts`. (frontend-design)

## After this sub-project

Phase 3 (seller-side) is feature-complete: become a consignor → **verify yourself (KYC/AML)** → consign → sell → settle → **paid only when compliant**. Operations note: swap the sample watchlist for a real sanctions/PEP feed before production (alongside the existing real-keys items). Remaining user-facing Christie's-completeness follow-ons: site search, save/watchlist, public "Sell with us".
