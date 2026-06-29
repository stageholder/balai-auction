# Phase 3C — Consignor KYC / AML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A consignor self-verifies (submits identity + payout details), staff review + sanctions-screen + decide, and a payout cannot be released until the consignor is KYC-approved + AML-cleared.

**Architecture:** Pure compliance logic in `@auction/core` (`screenName`, `consignorPayoutGate` — the single gate source of truth); consignor KYC/AML fields on `User` + repos in `@auction/db`; a consignor self-service `/account/verification` (own-record-only), a staff `/staff/consignor-kyc` review, and the 3B payout Release gated server-side. Reuses the buyer-KYC review shape + the 3B payout fields. Lean — sample sanctions list, no third-party integration.

**Tech Stack:** `@auction/core` (TS, Vitest), `@auction/db` (Prisma/Postgres, Vitest), Next.js 15 (server actions), `frontend-design` for UI.

## Global Constraints

- **Node.js >= 20**, **pnpm only**. **Commit directly to `main`** (pre-production).
- **Security (best practice):** self-service is **own-record-only** (`submitConsignorKycAction` derives `userId` from the session, never from client input); **decisions are staff-only** (`requireStaff`, validated enum values); the **payout gate is enforced server-side** in `releasePayoutAction` via `consignorPayoutGate` (page indicators are UX only). PII (legal name / ID number) is owner+staff-only, never logged, never public.
- **DX (single source of truth):** the gate lives **once** in `@auction/core` (`consignorPayoutGate`) and is reused by both `listPayouts` (display) and `releasePayoutAction` (enforcement) — never re-implemented.
- **All admin/account UI via the `frontend-design` skill**; tokens-only; no new UI deps.
- **Lean:** reuse `KycStatus`, `getUser`, `listPayouts`, `releasePayoutAction`, the `/staff/registrations` shape, the 3B bank fields. Sample watchlist; real OFAC/UN/PEP feed is a documented production swap.
- **Next.js 15** patterns; integer rupiah unchanged. **TDD** for core + db; UI by build + review.
- Suites stay green: core (47→), db (85→), web (35→), live-runner (7).

---

### Task 1: `@auction/core` — sanctions screen + payout gate

**Files:**
- Create: `packages/core/src/compliance.ts`
- Create: `packages/core/src/compliance.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `type AmlStatus`; `interface SanctionsEntry`; `const SANCTIONS_WATCHLIST`; `screenName(name, list?)`; `consignorPayoutGate(input)`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/compliance.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { screenName, consignorPayoutGate, SANCTIONS_WATCHLIST } from "./compliance";

describe("screenName", () => {
  it("flags an exact (case/spacing-insensitive) watchlist name", () => {
    expect(screenName("ivan  SAMPLE sanctioned").length).toBe(1);
  });
  it("flags when the screened name has extra/reordered tokens (entry tokens ⊆ name)", () => {
    expect(screenName("Sanctioned Ivan Q Sample").length).toBe(1);
  });
  it("does not flag a clean name or a partial name", () => {
    expect(screenName("Jane Ordinary Doe")).toEqual([]);
    expect(screenName("Ivan Sample")).toEqual([]); // missing "sanctioned"
  });
  it("returns [] for an empty name", () => {
    expect(screenName("   ")).toEqual([]);
  });
});

describe("consignorPayoutGate", () => {
  const ok = { kycStatus: "approved", amlStatus: "cleared", bankCode: "BCA", accountNumber: "1", accountHolder: "X" };
  it("passes when approved + cleared + bank details present", () => {
    expect(consignorPayoutGate(ok)).toEqual({ ok: true });
  });
  it("fails on missing bank details first", () => {
    expect(consignorPayoutGate({ ...ok, accountNumber: null })).toEqual({ ok: false, reason: expect.stringMatching(/bank/i) });
  });
  it("fails when KYC not approved", () => {
    expect(consignorPayoutGate({ ...ok, kycStatus: "pending" })).toEqual({ ok: false, reason: expect.stringMatching(/kyc/i) });
  });
  it("fails when AML not cleared", () => {
    expect(consignorPayoutGate({ ...ok, amlStatus: "flagged" })).toEqual({ ok: false, reason: expect.stringMatching(/aml/i) });
  });
});
```
(`SANCTIONS_WATCHLIST` must contain an entry whose normalized tokens are exactly `ivan sample sanctioned` for these tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./compliance`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/compliance.ts`:
```ts
export type AmlStatus = "pending" | "cleared" | "flagged";

export interface SanctionsEntry {
  name: string;
  note: string;
}

/** SAMPLE watchlist for development/demo. Replace with a real OFAC/UN/PEP feed
 *  (and fuzzy/partial matching) in production — see docs/operations. */
export const SANCTIONS_WATCHLIST: SanctionsEntry[] = [
  { name: "Ivan Sample Sanctioned", note: "Sample sanctioned individual — demo only" },
  { name: "Test Pep Person", note: "Sample politically-exposed person — demo only" },
  { name: "Blocked Example Trader", note: "Sample blocked entity — demo only" },
];

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Returns watchlist entries whose every (normalized) token is present in the
 *  screened name — catches reordering + extra middle names while avoiding
 *  single-token false positives. (Production: fuzzy/phonetic matching.) */
export function screenName(
  name: string,
  list: SanctionsEntry[] = SANCTIONS_WATCHLIST
): SanctionsEntry[] {
  const nameTokens = new Set(tokens(name));
  if (nameTokens.size === 0) return [];
  return list.filter((entry) => {
    const et = tokens(entry.name);
    return et.length > 0 && et.every((t) => nameTokens.has(t));
  });
}

/** The single source of truth for whether a consignor payout may be released.
 *  Reused by listPayouts (display) and releasePayoutAction (enforcement). */
export function consignorPayoutGate(input: {
  kycStatus: string;
  amlStatus: string;
  bankCode: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.bankCode || !input.accountNumber || !input.accountHolder) {
    return { ok: false, reason: "Payout bank details missing" };
  }
  if (input.kycStatus !== "approved") {
    return { ok: false, reason: "Consignor KYC not approved" };
  }
  if (input.amlStatus !== "cleared") {
    return { ok: false, reason: "Consignor AML not cleared" };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Re-export and run**

Append to `packages/core/src/index.ts`:
```ts
export * from "./compliance";
```
Run: `pnpm --filter @auction/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): sanctions screenName + consignorPayoutGate"
```

---

### Task 2: `@auction/db` — consignor KYC/AML fields, repos, payout gate in `listPayouts`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Generated: `packages/db/prisma/migrations/**`
- Modify: `packages/db/src/types.ts` (`UserRecord`, `PayoutListItem`)
- Modify: `packages/db/src/mappers.ts` (`userRowToRecord`)
- Modify: `packages/db/src/repositories/users.ts` (`submitConsignorKyc`, `setConsignorKycStatus`, `setConsignorAml`, `listConsignorsForReview`)
- Modify: `packages/db/src/repositories/payouts.ts` (`listPayouts` → gate)
- Modify: `packages/db/src/repositories/users.test.ts`, `payouts.test.ts`

**Interfaces:**
- Consumes: `KycStatus` (existing); `AmlStatus`, `consignorPayoutGate` (`@auction/core`, Task 1).
- Produces: `User` consignor KYC/AML fields + the four repos; `PayoutListItem` gains `consignorKycStatus`/`consignorAmlStatus`/`releaseReady`/`releaseBlockedReason`.

- [ ] **Step 1: Write the failing tests**

First **read** `users.ts` (the `createUser`/`getUser`/`userRowToRecord` shape, `setConsignorPayoutAccount` from 3B) + `payouts.ts` (`listPayouts`).

Append to `users.test.ts`:
```ts
import { submitConsignorKyc, setConsignorKycStatus, setConsignorAml, listConsignorsForReview } from "./users";

describe("consignor KYC/AML", () => {
  it("self-submit sets identity + bank details and pending KYC", async () => {
    const u = await createUser(db, { email: "c@example.com", role: "consignor" });
    const r = await submitConsignorKyc(db, u.id, {
      legalName: "Jane Consignor", idType: "passport", idNumber: "X123",
      bankCode: "BCA", accountNumber: "111", accountHolder: "Jane Consignor",
    });
    expect(r.consignorLegalName).toBe("Jane Consignor");
    expect(r.consignorKycStatus).toBe("pending");
    expect(r.payoutBankCode).toBe("BCA");
  });
  it("staff transitions KYC and AML", async () => {
    const u = await createUser(db, { email: "c2@example.com", role: "consignor" });
    expect((await setConsignorKycStatus(db, u.id, "approved")).consignorKycStatus).toBe("approved");
    const amled = await setConsignorAml(db, u.id, { amlStatus: "cleared", amlNote: "ok" });
    expect(amled.consignorAmlStatus).toBe("cleared");
  });
  it("listConsignorsForReview returns only consignor-role users", async () => {
    await createUser(db, { email: "buyer@example.com" });
    const c = await createUser(db, { email: "c3@example.com", role: "consignor" });
    expect((await listConsignorsForReview(db)).map((x) => x.id)).toContain(c.id);
    expect((await listConsignorsForReview(db)).every((x) => x.role === "consignor")).toBe(true);
  });
});
```

Append to `payouts.test.ts` (a payout exists from the existing seeding; assert the gate fields):
```ts
it("listPayouts exposes the consignor compliance gate", async () => {
  await consignedPaidSetup();
  const [item] = await listPayouts(db);
  expect(item.consignorKycStatus).toBe("pending");   // not yet approved
  expect(item.releaseReady).toBe(false);
  expect(item.releaseBlockedReason).toMatch(/bank|kyc|aml/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @auction/db test`
Expected: FAIL — fields/repos/gate not present.

- [ ] **Step 3: Schema + migrate**

In `schema.prisma`: add `enum AmlStatus { pending cleared flagged }`; add to `model User`:
```prisma
  consignorLegalName  String?
  consignorIdType     String?
  consignorIdNumber   String?
  consignorKycStatus  KycStatus  @default(pending)
  consignorAmlStatus  AmlStatus  @default(pending)
  consignorAmlNote    String?
```
Migrate (interactive `migrate dev` may be blocked in non-TTY shells — if so, create the migration dir manually with the generated SQL and `prisma migrate deploy` to both the dev DB and `auction_test`, then `prisma generate`):
```bash
cd packages/db
pnpm exec prisma migrate dev --name consignor_kyc_aml
```
Confirm the migration only adds the `AmlStatus` enum + the six nullable/defaulted `User` columns.

- [ ] **Step 4: Types + mapper**

In `types.ts`: add to `UserRecord` — `consignorLegalName: string | null; consignorIdType: string | null; consignorIdNumber: string | null; consignorKycStatus: KycStatus; consignorAmlStatus: AmlStatus; consignorAmlNote: string | null;` (import/define `AmlStatus` — re-export from `@auction/core` or mirror). Add to `PayoutListItem` — `consignorKycStatus: KycStatus; consignorAmlStatus: AmlStatus; releaseReady: boolean; releaseBlockedReason: string | null;`.
In `mappers.ts`: extend `userRowToRecord`'s param shape + return with the six fields.

- [ ] **Step 5: User repos**

In `users.ts`:
```ts
export async function submitConsignorKyc(db: PrismaClient, userId: string, input: {
  legalName: string; idType: string; idNumber: string;
  bankCode: string; accountNumber: string; accountHolder: string;
}): Promise<UserRecord> {
  const row = await db.user.update({
    where: { id: userId },
    data: {
      consignorLegalName: input.legalName, consignorIdType: input.idType, consignorIdNumber: input.idNumber,
      payoutBankCode: input.bankCode, payoutAccountNumber: input.accountNumber, payoutAccountHolder: input.accountHolder,
      consignorKycStatus: "pending",
    },
  });
  return userRowToRecord(row);
}

export async function setConsignorKycStatus(db: PrismaClient, userId: string, status: "approved" | "rejected" | "pending"): Promise<UserRecord> {
  const row = await db.user.update({ where: { id: userId }, data: { consignorKycStatus: status } });
  return userRowToRecord(row);
}

export async function setConsignorAml(db: PrismaClient, userId: string, input: { amlStatus: "pending" | "cleared" | "flagged"; amlNote?: string | null }): Promise<UserRecord> {
  const row = await db.user.update({ where: { id: userId }, data: { consignorAmlStatus: input.amlStatus, consignorAmlNote: input.amlNote ?? null } });
  return userRowToRecord(row);
}

export async function listConsignorsForReview(db: PrismaClient): Promise<UserRecord[]> {
  const rows = await db.user.findMany({ where: { role: "consignor" }, orderBy: { email: "asc" } });
  return rows.map(userRowToRecord);
}
```

- [ ] **Step 6: Gate in `listPayouts`**

In `payouts.ts`, extend the `consignor` select in `listPayouts` with `consignorKycStatus` + `consignorAmlStatus`, and in the map compute the gate (import `consignorPayoutGate` from `@auction/core`):
```ts
const gate = consignorPayoutGate({
  kycStatus: p.consignor.consignorKycStatus,
  amlStatus: p.consignor.consignorAmlStatus,
  bankCode: payoutBankCode, accountNumber: payoutAccountNumber, accountHolder: payoutAccountHolder,
});
// ...item:
consignorKycStatus: p.consignor.consignorKycStatus,
consignorAmlStatus: p.consignor.consignorAmlStatus,
releaseReady: gate.ok,
releaseBlockedReason: gate.ok ? null : gate.reason,
```

- [ ] **Step 7: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS — new user + payout gate tests + all prior db tests.

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): consignor KYC/AML fields + repos + payout gate in listPayouts"
```

---

### Task 3: Consignor self-service `/account/verification` (frontend-design)

**Files:**
- Create: `apps/web/src/app/account/verification/page.tsx`
- Create: `apps/web/src/app/account/verification/actions.ts`
- Modify: `apps/web/src/components/account-nav.tsx` (Verification link for consignors)

**Interfaces:**
- Consumes: `requireUser`/`getCurrentUser` (`@/lib/auth`); `getUser`, `submitConsignorKyc` (`@/lib/db`).
- Produces: the consignor self-service KYC/payout submission + status view.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Read the current account surface**

Read `@/lib/auth` (`requireUser`/`getCurrentUser` — how to get the session user + id + role), `apps/web/src/app/invoices/page.tsx` (the `requireUser` page pattern), and `account-nav.tsx` (how it knows the user/role to add a link).

- [ ] **Step 2: Build the page + action**

`apps/web/src/app/account/verification/page.tsx` — Server Component, `requireUser()`:
- Load the current user (`getUser(prisma, user.id)`). If `role !== "consignor"` → a calm "Verification is for consignor accounts." note (no form).
- For a consignor: show current **status** prominently (KYC pending/approved/rejected, AML cleared/flagged, bank on-file) and a form (legal name, **ID type** select [passport / national_id / driver_license], ID number, bank code, account number, account holder) prefilled with current values → `submitConsignorKycAction`. If rejected, invite resubmission.

`apps/web/src/app/account/verification/actions.ts`:
```ts
"use server";
export async function submitConsignorKycAction(formData: FormData): Promise<...> {
  const user = await requireUser();                 // session user
  if (user.role !== "consignor") return error/no-op;
  // read + trim fields; require all present (server-side validation)
  await submitConsignorKyc(prisma, user.id, {...}); // OWN id only — never from formData
  revalidatePath("/account/verification");
}
```
**Security:** the `userId` is the **session user's** id, never read from the form. Validate all fields non-empty server-side.

- [ ] **Step 3: Account nav link**

In `account-nav.tsx`, for a `consignor`-role signed-in user, add a **Verification** link → `/account/verification` (alongside the existing Invoices link). Keep the rest intact.

**Design intent:** a clean account verification panel — status front and centre, a tidy form, reassuring copy. `frontend-design`, tokens-only.

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: a consignor submits identity + bank → status shows `pending`; a buyer sees the "for consignor accounts" note.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/account/verification" apps/web/src/components/account-nav.tsx
git commit -m "feat(web): consignor self-service KYC/payout verification page"
```

---

### Task 4: Staff `/staff/consignor-kyc` review (frontend-design)

**Files:**
- Create: `apps/web/src/app/staff/consignor-kyc/page.tsx`
- Create: `apps/web/src/app/staff/consignor-kyc/actions.ts`
- Modify: the staff/admin nav (wherever `/staff/registrations` is linked) to add a Consignor KYC link

**Interfaces:**
- Consumes: `requireStaff`; `listConsignorsForReview`, `setConsignorKycStatus`, `setConsignorAml` (`@/lib/db`); `screenName` (`@auction/core`).
- Produces: the staff review queue + decisions.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Read the buyer-KYC review for the pattern**

Read `apps/web/src/app/staff/registrations/page.tsx` + its `actions.ts` (the `requireStaff` queue + approve/reject action shape) and mirror it.

- [ ] **Step 2: Build the review page + actions**

`apps/web/src/app/staff/consignor-kyc/page.tsx` — Server Component, `requireStaff()`:
- `const consignors = await listConsignorsForReview(prisma);`
- Per consignor: show email + submitted identity (legal name, ID type/number) + bank-on-file; compute `const matches = screenName(consignor.consignorLegalName ?? "")` and show **"⚠ N possible sanctions match"** (with the entry notes) or **"No matches"**; current KYC + AML status; controls: **Approve / Reject KYC** (`setConsignorKycStatusAction`), **Clear / Flag AML** (+ optional note) (`setConsignorAmlAction`).
- Consignors who haven't submitted (no legal name) show "Awaiting submission".

`actions.ts` — `setConsignorKycStatusAction(userId, status)` + `setConsignorAmlAction(userId, amlStatus, note)`: **`requireStaff()` first**, validate `status ∈ {approved,rejected,pending}` / `amlStatus ∈ {pending,cleared,flagged}` (reject otherwise), call the repo, `revalidatePath`.

- [ ] **Step 3: Nav link**

Add a **Consignor KYC** link next to **Registrations** in the staff/admin nav (e.g. `admin/layout.tsx` and/or wherever `/staff/registrations` is linked).

**Design intent:** an editorial review queue — identity, a clear sanctions-match callout (accent when matched), status, and decisive Approve/Reject + Clear/Flag controls. `frontend-design`, tokens-only.

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: a submitted consignor appears; the sanctions screen shows matches for a watchlisted name; Approve KYC + Clear AML flip the statuses.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/staff/consignor-kyc" apps/web/src/app/admin/layout.tsx
git commit -m "feat(web): staff consignor KYC/AML review queue"
```

---

### Task 5: Gate payout Release on compliance (frontend-design)

**Files:**
- Modify: `apps/web/src/app/admin/payouts/actions.ts` (`releasePayoutAction`)
- Modify: `apps/web/src/app/admin/payouts/page.tsx` + `payout-actions.tsx` (indicators + disabled Release)

**Interfaces:**
- Consumes: `consignorPayoutGate` (`@auction/core`); `getUser` (`@/lib/db`); `PayoutListItem.releaseReady`/`releaseBlockedReason`/`consignorKycStatus`/`consignorAmlStatus` (Task 2).
- Produces: a payout can't be released unless the consignor is compliant; the admin shows why.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Enforce the gate server-side in `releasePayoutAction`**

In `apps/web/src/app/admin/payouts/actions.ts`, replace the bare bank-details check with the full gate (the consignor is loaded via `getUser`):
```ts
const consignor = await getUser(prisma, payout.consignorId);
const gate = consignorPayoutGate({
  kycStatus: consignor?.consignorKycStatus ?? "pending",
  amlStatus: consignor?.consignorAmlStatus ?? "pending",
  bankCode: consignor?.payoutBankCode ?? null,
  accountNumber: consignor?.payoutAccountNumber ?? null,
  accountHolder: consignor?.payoutAccountHolder ?? null,
});
if (!gate.ok) return { ok: false, error: gate.reason };
```
(Keep `requireStaff` first, the pending-status guard, the try/catch around `createDisbursement`, and the stable `payout-{id}-{attempt}` externalId — all unchanged.)

- [ ] **Step 2: Compliance indicators + disabled Release on `/admin/payouts`**

In `page.tsx`/`payout-actions.tsx`, per row show a compact compliance indicator (**KYC ✓/✗ · AML ✓/✗ · Bank ✓/✗** derived from `consignorKycStatus`/`consignorAmlStatus`/`hasBankDetails`), and **disable Release** (with `releaseBlockedReason` as the hint) when `releaseReady === false` — mirroring the existing bank-details-missing disable. Keep Re-arm as-is. Tokens-only.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; the 35 web tests pass. Manual: a payout for a non-compliant consignor shows the blocked reason + disabled Release; after the consignor is KYC-approved + AML-cleared + bank on file, Release enables and works.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/payouts
git commit -m "feat(web): gate payout release on consignor KYC/AML compliance"
```

---

## Self-Review

**Spec coverage:**
- `screenName` + `consignorPayoutGate` (single gate source) → Task 1. Consignor KYC/AML fields + repos + gate-in-`listPayouts` → Task 2. Consignor self-service submit (own-record-only) → Task 3. Staff review + screen + decisions → Task 4. Payout Release gated server-side + indicators → Task 5.
- Gate at payout only; self-service own-record; decisions staff-only; sample watchlist (real feed deferred) — Global Constraints + per-task contracts.

**Placeholder scan:** No TBD/TODO. Core/db carry complete code + tests; UI tasks carry complete contracts + the `frontend-design` mandate + read-the-existing-file instructions (adapt to real signatures — flagged, not placeholders).

**Type/security consistency:** `AmlStatus`/`consignorPayoutGate`/`screenName` (Task 1) consumed by Task 2 (`listPayouts` gate, `UserRecord`), Task 4 (`screenName`), Task 5 (gate). `submitConsignorKyc` (Task 2) writes only the **session** user's id (Task 3 action). Staff actions (Tasks 4/5) `requireStaff` + validate enums. The gate is computed in `listPayouts` (display, Task 2) and enforced in `releasePayoutAction` (Task 5) from the same `consignorPayoutGate` — one source of truth. 3B's bank fields + `releasePayoutAction` structure reused, not forked.

---

## After this plan

Phase 3 (seller-side) is feature-complete: become a consignor → self-verify → consign → sell → settle → paid only when KYC-approved + AML-cleared. Operations follow-up: swap the sample watchlist for a real sanctions/PEP feed (+ fuzzy matching) before production. Remaining user-facing Christie's-completeness follow-ons: site search, save/watchlist, public "Sell with us".
