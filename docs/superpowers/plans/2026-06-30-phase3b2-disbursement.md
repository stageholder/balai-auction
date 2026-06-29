# Phase 3B-2 — Disbursement + Release + Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff release a pending consignor payout via Xendit Disbursement, track it to paid/failed through a webhook, and re-arm a failed payout — turning the read-only B-1 statement into the live payout flow.

**Architecture:** A Xendit `createDisbursement` client (mirroring the existing Invoice client — `fetch`, no SDK; build + logic-tested, needs real disbursement keys/balance to run live); a `rearmPayout` repo (failed→pending) closing B-1's terminal-`failed` gap; staff **Release**/**Re-arm** actions on `/admin/payouts` (guarded, requires bank details on file, stable `payout-{id}` external id for idempotency); and a disbursement webhook (timing-safe token) → `markPayoutPaid`/`markPayoutFailed`. Built on the B-1 repos.

**Tech Stack:** Next.js 15 (server actions + route handler), Xendit Disbursement REST, `@auction/db` (Vitest), `frontend-design` for the admin buttons.

## Global Constraints

- **Node.js >= 20**, **pnpm only**. **Commit directly to `main`** (pre-production).
- **All UI via `frontend-design`**; tokens-only; no new UI deps (Xendit via `fetch`, like `createXenditInvoice`).
- **Staff-approved only:** a disbursement is created solely by an explicit `requireStaff` Release action; the webhook only advances status.
- **Idempotent + guarded money transitions:** `releasePayout` (pending→released), `markPayoutPaid` (released→paid), `markPayoutFailed` (released→failed), `rearmPayout` (failed→pending). Stable external id `payout-{payoutId}` + Xendit idempotency key so retries map to one disbursement; `Payout.xenditDisbursementId` is `@unique` (from B-1).
- **Bank details required to release:** a payout whose consignor lacks `payoutBankCode`/`payoutAccountNumber`/`payoutAccountHolder` cannot be released.
- **Webhook token is timing-safe** (reuse `verifyCallbackToken` from the invoice webhook).
- **Integer rupiah / `BigInt`** at the boundary; money math reuses B-1.
- **TDD** for the disbursement client (logic, mocked fetch) + `rearmPayout`; the actions/webhook/route by build + logic-test + review; live disbursement documented (needs real keys).
- Suites stay green: core (45), db (83→), web (32→), live-runner (7).

---

### Task 1: Xendit `createDisbursement` client

**Files:**
- Modify: `apps/web/src/lib/xendit.ts`
- Modify/Create: `apps/web/src/lib/xendit.test.ts` (create if absent)

**Interfaces:**
- Consumes: `XENDIT_SECRET_KEY` (env), the existing Basic-auth/`fetch` pattern in this file.
- Produces:
  - `createDisbursement(params: { externalId: string; amount: number; bankCode: string; accountHolderName: string; accountNumber: string; description: string }): Promise<{ id: string; status: string }>`
  - `isCompletedDisbursementStatus(status: string): boolean` (=== `"COMPLETED"`)
  - `isFailedDisbursementStatus(status: string): boolean` (=== `"FAILED"`)

- [ ] **Step 1: Read the existing client**

Read `apps/web/src/lib/xendit.ts` — how `createXenditInvoice` builds the Basic auth header (`base64(secretKey + ":")`), the base URL, error handling, and `verifyCallbackToken`/`isPaidXenditStatus`. Mirror those exactly.

- [ ] **Step 2: Write the failing test**

In `apps/web/src/lib/xendit.test.ts` (mock `fetch` via `vi.spyOn(globalThis, "fetch")`, mirroring how other fetch clients are tested in the repo):
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createDisbursement,
  isCompletedDisbursementStatus,
  isFailedDisbursementStatus,
} from "./xendit";

afterEach(() => vi.restoreAllMocks());

describe("createDisbursement", () => {
  it("POSTs a disbursement with idempotency + bank details", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "disb_1", status: "PENDING" }), { status: 200 })
    );
    const out = await createDisbursement({
      externalId: "payout-abc",
      amount: 900_000,
      bankCode: "BCA",
      accountHolderName: "Jane Doe",
      accountNumber: "1234567890",
      description: "Consignor payout",
    });
    expect(out).toEqual({ id: "disb_1", status: "PENDING" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/disbursements$/);
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(headers["X-IDEMPOTENCY-KEY"]).toBe("payout-abc");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      external_id: "payout-abc",
      amount: 900_000,
      bank_code: "BCA",
      account_holder_name: "Jane Doe",
      account_number: "1234567890",
    });
  });

  it("throws on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 400 }));
    await expect(
      createDisbursement({
        externalId: "payout-x", amount: 1, bankCode: "BCA",
        accountHolderName: "X", accountNumber: "1", description: "d",
      })
    ).rejects.toThrow();
  });
});

describe("disbursement status helpers", () => {
  it("classifies COMPLETED and FAILED", () => {
    expect(isCompletedDisbursementStatus("COMPLETED")).toBe(true);
    expect(isCompletedDisbursementStatus("PENDING")).toBe(false);
    expect(isFailedDisbursementStatus("FAILED")).toBe(true);
    expect(isFailedDisbursementStatus("COMPLETED")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @auction/web test src/lib/xendit.test.ts`
Expected: FAIL — `createDisbursement` not exported.

- [ ] **Step 4: Implement**

In `apps/web/src/lib/xendit.ts`, add (reuse the existing secret-key/base-url constants + Basic-auth helper this file already defines):
```ts
export async function createDisbursement(params: {
  externalId: string;
  amount: number;
  bankCode: string;
  accountHolderName: string;
  accountNumber: string;
  description: string;
}): Promise<{ id: string; status: string }> {
  const res = await fetch(`${XENDIT_BASE_URL}/disbursements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(), // the existing helper used by createXenditInvoice
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

export function isCompletedDisbursementStatus(status: string): boolean {
  return status === "COMPLETED";
}
export function isFailedDisbursementStatus(status: string): boolean {
  return status === "FAILED";
}
```
(Use the real constant/helper names from the file — e.g. `XENDIT_BASE_URL`/`XENDIT_API_BASE`, and however `createXenditInvoice` constructs `Authorization`. Adapt to match; do not duplicate a second auth scheme.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @auction/web test src/lib/xendit.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/xendit.ts apps/web/src/lib/xendit.test.ts
git commit -m "feat(web): Xendit createDisbursement client + status helpers"
```

---

### Task 2: `@auction/db` — `rearmPayout` (failed → pending)

**Files:**
- Modify: `packages/db/src/repositories/payouts.ts`
- Modify: `packages/db/src/repositories/payouts.test.ts`

**Interfaces:**
- Produces: `rearmPayout(db, payoutId): Promise<PayoutRecord | null>` — guarded `failed→pending`, clearing `xenditDisbursementId` + `releasedAt` so the payout can be released afresh (and the `@unique` disbursement id is freed).

- [ ] **Step 1: Write the failing test**

Append to `packages/db/src/repositories/payouts.test.ts` (seed a payout, release it, mark it failed — reusing the file's helpers):
```ts
describe("rearmPayout", () => {
  it("returns a failed payout to pending and clears the disbursement id", async () => {
    // ... seed a pending payout (as the other tests do), then:
    await releasePayout(db, payout.id, "disb_rearm");
    await markPayoutFailed(db, "disb_rearm");

    const rearmed = await rearmPayout(db, payout.id);
    expect(rearmed?.status).toBe("pending");
    expect(rearmed?.xenditDisbursementId).toBeNull();
    expect(rearmed?.releasedAt).toBeNull();
  });

  it("returns null for a payout that is not failed", async () => {
    // a still-pending payout
    expect(await rearmPayout(db, pendingPayout.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/payouts.test.ts`
Expected: FAIL — `rearmPayout` not exported.

- [ ] **Step 3: Implement**

Append to `packages/db/src/repositories/payouts.ts`:
```ts
export async function rearmPayout(
  db: PrismaClient,
  payoutId: string
): Promise<PayoutRecord | null> {
  const claim = await db.payout.updateMany({
    where: { id: payoutId, status: "failed" },
    data: { status: "pending", xenditDisbursementId: null, releasedAt: null },
  });
  if (claim.count === 0) return null;
  const row = await db.payout.findUnique({ where: { id: payoutId } });
  return row ? payoutRowToRecord(row) : null;
}
```

- [ ] **Step 4: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): rearmPayout (failed -> pending) for bounced disbursements"
```

---

### Task 3: Release + Re-arm actions + `/admin/payouts` buttons (frontend-design)

**Files:**
- Create: `apps/web/src/app/admin/payouts/actions.ts`
- Modify: `apps/web/src/app/admin/payouts/page.tsx` (wire the action buttons)
- Possibly create: `apps/web/src/app/admin/payouts/payout-actions.tsx` (a small client component for the buttons, if `frontend-design` calls for pending/disabled states)

**Interfaces:**
- Consumes: `getPayout`, `releasePayout`, `rearmPayout`, the consignor's bank details (`@/lib/db`); `createDisbursement` (Task 1); `requireStaff`.
- Produces: staff can **Release** a pending payout (with bank details) and **Re-arm** a failed one.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Read the current page + B-1 repos**

Read `apps/web/src/app/admin/payouts/page.tsx` (the read-only table + `PayoutListItem` fields incl. `hasBankDetails`, `status`, `net`), and confirm how to fetch a consignor's bank details (`getUser`/`findUnique` — check `users.ts`/`@/lib/db`).

- [ ] **Step 2: Release + Re-arm server actions**

`apps/web/src/app/admin/payouts/actions.ts`:
- `releasePayoutAction(payoutId: string)`: `requireStaff()` first; `const payout = await getPayout(prisma, payoutId)`; if `!payout || payout.status !== "pending"` → return a typed error / `notFound`-style no-op; load the consignor's bank details; if any of `bankCode/accountNumber/accountHolder` is missing → return an error ("Add payout bank details first"); `const disb = await createDisbursement({ externalId: \`payout-${payoutId}\`, amount: payout.amount, bankCode, accountHolderName: accountHolder, accountNumber, description: \`Consignor payout ${payoutId}\` })`; `await releasePayout(prisma, payoutId, disb.id)`; `revalidatePath("/admin/payouts")`. Wrap the `createDisbursement` call so a thrown Xendit error surfaces to the UI (return an error state, do not crash).
- `rearmPayoutAction(payoutId: string)`: `requireStaff()`; `await rearmPayout(prisma, payoutId)`; `revalidatePath("/admin/payouts")`.

- [ ] **Step 3: Wire the buttons (status-aware)**

On `/admin/payouts`, per row by `status`:
- `pending` + `hasBankDetails` → **Release** button (`releasePayoutAction`).
- `pending` + no bank details → disabled, with the existing "Add in Users" hint.
- `released` → a quiet "Releasing…" label (no action; the webhook advances it).
- `paid` → "Paid" (done).
- `failed` → **Re-arm** button (`rearmPayoutAction`) + the failure visible.
Use server-action forms or a small client component (`payout-actions.tsx`) for pending/disabled/loading states — tokens-only, no new deps. Surface a release error inline.

**Design intent:** the settlement ledger becomes operable without losing its calm — Release as a clear primary action only where valid, Re-arm where failed, status legible. Invoke `frontend-design`, then implement.

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; the 32 web tests still pass. (Live release needs real Xendit disbursement keys — documented in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/payouts
git commit -m "feat(web): release + re-arm payout actions on /admin/payouts"
```

---

### Task 4: Disbursement webhook → `markPayoutPaid`/`markPayoutFailed`

**Files:**
- Create: `apps/web/src/app/api/webhooks/xendit-disbursement/route.ts`

**Interfaces:**
- Consumes: `verifyCallbackToken` (existing), `isCompletedDisbursementStatus`/`isFailedDisbursementStatus` (Task 1), `markPayoutPaid`/`markPayoutFailed` (B-1); `prisma`.
- Produces: a webhook that advances a released payout to `paid`/`failed` by disbursement id.

- [ ] **Step 1: Read the invoice webhook**

Read `apps/web/src/app/api/webhooks/xendit/route.ts` — the `verifyCallbackToken(header)` check (timing-safe), the body parse, the 200/4xx responses. Mirror it.

- [ ] **Step 2: Implement the route**

`apps/web/src/app/api/webhooks/xendit-disbursement/route.ts`:
- `POST`: verify the `x-callback-token` header via `verifyCallbackToken` → 401 if invalid.
- Parse the body as a disbursement `{ id: string; status: string }`.
- If `isCompletedDisbursementStatus(status)` → `await markPayoutPaid(prisma, id)`.
- Else if `isFailedDisbursementStatus(status)` → `await markPayoutFailed(prisma, id)`.
- Return `200` (ack) regardless of whether a row matched (idempotent; an unmatched id is a no-op — `markPayoutPaid`/`markPayoutFailed` return false). Best-effort, never throw into the response.
- `export const runtime = "nodejs"` if the invoice webhook sets it; mirror its config.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds (the route compiles); tests pass. (End-to-end needs the webhook registered in Xendit + real keys — Task 5.)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/api/webhooks/xendit-disbursement"
git commit -m "feat(web): Xendit disbursement webhook (mark payout paid/failed)"
```

---

### Task 5: Operations doc + prod checklist

**Files:**
- Create: `docs/operations/xendit-disbursement.md`
- Modify: the existing payments/operations doc or prod checklist (wherever the Xendit Invoice setup is documented) to reference disbursements.

**Interfaces:**
- Produces: documentation for enabling live disbursements (no code).

- [ ] **Step 1: Write the operations doc**

`docs/operations/xendit-disbursement.md` — concise:
- **Env:** `XENDIT_SECRET_KEY` (shared with the Invoice client) must have **Money-out / Disbursement** permission; the Xendit account needs a funded balance (or Cash/test balance in test mode). The callback token reuses `XENDIT_WEBHOOK_TOKEN` (verify which token Xendit sends for disbursement callbacks; configure accordingly).
- **Webhook:** register the **Disbursement** callback URL → `/api/webhooks/xendit-disbursement` in the Xendit dashboard.
- **Payout lifecycle:** `pending` (created on buyer payment, B-1) → staff **Release** (`createDisbursement`, `pending→released`) → webhook `COMPLETED` → `paid` (writes the `seller payout` ledger entry) / `FAILED` → `failed` → staff **Re-arm** (`failed→pending`) to retry. Idempotency via `external_id = payout-{id}` + `X-IDEMPOTENCY-KEY`.
- **Pre-release requirement:** the consignor must have payout bank details on file (set in `/admin/users`).
- Note: built + logic-tested; **live disbursement requires the above real keys/balance/webhook** (mirrors the Invoice integration's operational note).

- [ ] **Step 2: Cross-reference**

Add a one-line pointer from the existing Xendit/payments operations doc (or the prod checklist) to `xendit-disbursement.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/operations
git commit -m "docs: Xendit disbursement operations + payout lifecycle"
```

---

## Self-Review

**Spec coverage (against the design doc, B-2 portion):**
- Xendit `createDisbursement` client (fetch, idempotency, status helpers) → Task 1.
- `failed` re-arm (B-1 carry-forward) → Task 2 (`rearmPayout`).
- Staff **Release** (requires bank details, stable external id, guarded) + **Re-arm** on `/admin/payouts` → Task 3.
- Disbursement webhook (timing-safe token) → `markPayoutPaid`/`markPayoutFailed` → Task 4.
- Operations/keys documentation → Task 5.
- Staff-approved only; idempotent guarded transitions; `Payout.xenditDisbursementId @unique` (B-1) underpins webhook idempotency; integer rupiah — Global Constraints + per-task contracts.

**Placeholder scan:** No TBD/TODO. Task 1/2 carry complete code; Tasks 3/4 carry complete contracts + read-the-existing-file instructions + the `frontend-design` mandate (adapting to the real `xendit.ts`/webhook signatures — flagged, not placeholders). Task 5 is documentation.

**Type consistency:** `createDisbursement` (Task 1) consumed by Task 3's release action; `isCompleted/FailedDisbursementStatus` (Task 1) by Task 4's webhook. `rearmPayout` (Task 2) by Task 3's re-arm action. `releasePayout`/`markPayoutPaid`/`markPayoutFailed` + consignor bank details (B-1) consumed by Tasks 3/4. Stable `payout-{id}` external id + `@unique xenditDisbursementId` (B-1) give webhook idempotency. Money integer rupiah.

---

## Phase 3B complete after this plan

With B-1 + B-2, a consigned lot settles on buyer payment and the consignor is paid via a staff-approved Xendit disbursement, tracked to completion. Next: **3C** Consignor KYC/AML, **3D** Editorial / department pages.
