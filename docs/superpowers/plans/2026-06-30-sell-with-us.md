# Public "Sell with us" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/sell` form where anyone submits an item → a `ConsignmentRequest` staff triage in a review queue. Lean — a request table, a public form, a staff queue.

**Architecture:** `ConsignmentRequest` model + repos in `@auction/db`; a public `/sell` form + server-validated action + header Sell link; a staff `/staff/consignment-requests` queue. No image upload, no automation (accepted requests → lots via the existing 3A operator flow).

**Tech Stack:** `@auction/db` (Prisma/Postgres, Vitest), Next.js 15 (server actions), `frontend-design`.

## Global Constraints

- **Node.js >= 20**, **pnpm only**. **Commit directly to `main`** (pre-production).
- **All UI via `frontend-design`**; tokens-only; no new UI deps.
- **`/sell` public** (no auth) but **server-validated + length-capped**; submitter contact PII (name/email/phone) **staff-only, never logged/public**; staff actions `requireStaff` + enum-validated; `category` validated to a known department slug or `null`.
- **Reuse** `DEPARTMENTS`/`departmentLabel`/`isDepartmentSlug`, `formatRupiah`, the `/staff/registrations` review shape, `requireStaff`.
- **TDD** for the repos; UI by build + review. Suites green: db (96→), web (35→).

---

### Task 1: `@auction/db` — `ConsignmentRequest` model + repos

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Generated: `packages/db/prisma/migrations/**`
- Modify: `packages/db/src/types.ts` (`ConsignmentRequestStatus`, `ConsignmentRequestRecord`, `NewConsignmentRequest`)
- Modify: `packages/db/src/mappers.ts` (`consignmentRequestRowToRecord`)
- Create: `packages/db/src/repositories/consignment-requests.ts`
- Modify: `packages/db/src/index.ts` (barrel)
- Create: `packages/db/src/repositories/consignment-requests.test.ts`

**Interfaces:**
- Produces:
  - `type ConsignmentRequestStatus = "pending" | "reviewing" | "accepted" | "declined"`
  - `interface ConsignmentRequestRecord { id; name; email; phone: string | null; category: string | null; itemTitle; itemDescription; sellerEstimate: number | null; status: ConsignmentRequestStatus; createdAt: Date }`
  - `interface NewConsignmentRequest { name; email; phone?: string | null; category?: string | null; itemTitle; itemDescription; sellerEstimate?: number | null }`
  - `createConsignmentRequest(db, input): Promise<ConsignmentRequestRecord>`; `listConsignmentRequests(db): Promise<ConsignmentRequestRecord[]>`; `setConsignmentRequestStatus(db, id, status): Promise<ConsignmentRequestRecord>`.

- [ ] **Step 1: Write the failing tests**

First **read** `packages/db/src/repositories/sales.ts` (a `create` repo for the data shape), `mappers.ts` (`toMoney`/`toDbMoney`), `types.ts`, and the test-db harness import in `lots.test.ts`.

`packages/db/src/repositories/consignment-requests.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../test/testDb"; // match the real harness
import { createConsignmentRequest, listConsignmentRequests, setConsignmentRequestStatus } from "./consignment-requests";

const db = testDb();
beforeEach(async () => { await resetDb(db); });

describe("consignment requests", () => {
  it("creates a request with defaults (pending, null optionals)", async () => {
    const r = await createConsignmentRequest(db, {
      name: "Jane Seller", email: "jane@example.com",
      itemTitle: "A bronze figure", itemDescription: "circa 1900, good condition",
    });
    expect(r.status).toBe("pending");
    expect(r.phone).toBeNull();
    expect(r.category).toBeNull();
    expect(r.sellerEstimate).toBeNull();
    expect(r.name).toBe("Jane Seller");
  });

  it("round-trips optional fields + transitions status", async () => {
    const r = await createConsignmentRequest(db, {
      name: "Bo", email: "bo@example.com", phone: "0812",
      category: "watches", itemTitle: "A Daytona", itemDescription: "ref 116500",
      sellerEstimate: 50_000_000,
    });
    expect(r.category).toBe("watches");
    expect(r.sellerEstimate).toBe(50_000_000);

    const upd = await setConsignmentRequestStatus(db, r.id, "accepted");
    expect(upd.status).toBe("accepted");
  });

  it("lists newest first", async () => {
    const a = await createConsignmentRequest(db, { name: "A", email: "a@x.com", itemTitle: "A", itemDescription: "a" });
    const b = await createConsignmentRequest(db, { name: "B", email: "b@x.com", itemTitle: "B", itemDescription: "b" });
    expect((await listConsignmentRequests(db)).map((x) => x.id)).toEqual([b.id, a.id]);
  });
});
```
(Adapt harness import + names.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @auction/db test src/repositories/consignment-requests.test.ts`
Expected: FAIL — cannot resolve `./consignment-requests`.

- [ ] **Step 3: Schema + migrate**

In `schema.prisma` add the `ConsignmentRequestStatus` enum + `ConsignmentRequest` model (per the spec). Migrate via the manual workaround (interactive `migrate dev` is blocked in non-TTY shells):
```bash
cd packages/db
TS=$(date +%Y%m%d%H%M%S); mkdir -p prisma/migrations/${TS}_consignment_requests
# write migration.sql: CREATE TYPE "ConsignmentRequestStatus" AS ENUM (...);
#   CREATE TABLE "ConsignmentRequest" (...); CREATE INDEX on status.
pnpm exec prisma migrate deploy
DATABASE_URL=postgresql://auction:auction@localhost:5434/auction_test pnpm exec prisma migrate deploy
pnpm exec prisma generate
```
Confirm the SQL adds only the enum + table + index.

- [ ] **Step 4: Types + mapper**

`types.ts`: add `ConsignmentRequestStatus`, `ConsignmentRequestRecord`, `NewConsignmentRequest` (per the spec). `mappers.ts`: add `consignmentRequestRowToRecord` (map `sellerEstimate` BigInt|null → number|null via `toMoney` when present).

- [ ] **Step 5: Repos**

`packages/db/src/repositories/consignment-requests.ts`:
```ts
import type { PrismaClient } from "@prisma/client";
import { consignmentRequestRowToRecord, toDbMoney } from "../mappers";
import type { ConsignmentRequestRecord, NewConsignmentRequest, ConsignmentRequestStatus } from "../types";

export async function createConsignmentRequest(
  db: PrismaClient, input: NewConsignmentRequest
): Promise<ConsignmentRequestRecord> {
  const row = await db.consignmentRequest.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      category: input.category ?? null,
      itemTitle: input.itemTitle,
      itemDescription: input.itemDescription,
      sellerEstimate:
        input.sellerEstimate != null ? toDbMoney(input.sellerEstimate) : null,
    },
  });
  return consignmentRequestRowToRecord(row);
}

export async function listConsignmentRequests(
  db: PrismaClient
): Promise<ConsignmentRequestRecord[]> {
  const rows = await db.consignmentRequest.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(consignmentRequestRowToRecord);
}

export async function setConsignmentRequestStatus(
  db: PrismaClient, id: string, status: ConsignmentRequestStatus
): Promise<ConsignmentRequestRecord> {
  const row = await db.consignmentRequest.update({ where: { id }, data: { status } });
  return consignmentRequestRowToRecord(row);
}
```

- [ ] **Step 6: Export + run**

Barrel-export `./repositories/consignment-requests`. Run `pnpm --filter @auction/db test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): ConsignmentRequest model + repos"
```

---

### Task 2: Public `/sell` form + header link (frontend-design)

**Files:**
- Create: `apps/web/src/app/sell/page.tsx`
- Create: `apps/web/src/app/sell/actions.ts`
- Create (if a client form is needed for feedback): `apps/web/src/app/sell/sell-form.tsx`
- Modify: `apps/web/src/components/site-header.tsx` (Sell link)

**Interfaces:**
- Consumes: `createConsignmentRequest` (`@/lib/db`); `DEPARTMENTS`/`isDepartmentSlug` (`@auction/core`).
- Produces: the public submission flow + the header Sell link.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Build the form + action**

`apps/web/src/app/sell/page.tsx` — an inviting "Sell with us" page (a short editorial intro on consigning) + the form: **name, email** (required), phone (optional), **department** (`DEPARTMENTS` select + a "— Select —"/None), **item title, item description** (textarea, required), optional **asking estimate** (number). Render via a small client form for inline success/error (`useActionState`) or a server-action form — keep it lean.

`apps/web/src/app/sell/actions.ts` (`"use server"`) — `submitConsignmentRequestAction`:
- Read + `.trim()` all fields. **Validate server-side:** `name`, `email`, `itemTitle`, `itemDescription` non-empty; a basic email shape (e.g. contains `@` and a dot, or a simple regex); **length caps** (e.g. name ≤ 120, email ≤ 200, itemTitle ≤ 200, itemDescription ≤ 4000, phone ≤ 40). On failure → a typed error result.
- `category`: `isDepartmentSlug(raw) ? raw : null`. `sellerEstimate`: parse → non-negative integer or `null`.
- `try { await createConsignmentRequest(prisma, {...}) } catch { return error }`; on success return `{ ok: true }`. (No `requireUser` — public. Do not log the contact PII.)

- [ ] **Step 2: Header Sell link**

In `site-header.tsx`, add a **Sell** link → `/sell` in the primary nav (alongside Auctions / Results / Departments), using the existing `NAV_LINK` idiom. Tokens-only; keep the rest intact.

**Design intent:** an inviting, trustworthy "Sell with us" page — a confident intro + a clean form; a warm confirmation on submit. Invoke `frontend-design`, then implement. Tokens-only.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds (`/sell` compiles); tests pass. Manual: a valid submission shows the confirmation; a missing required field / bad email shows an inline error; the header Sell link reaches `/sell`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/sell apps/web/src/components/site-header.tsx
git commit -m "feat(web): public /sell consignment-inquiry form + header link"
```

---

### Task 3: Staff `/staff/consignment-requests` queue (frontend-design)

**Files:**
- Create: `apps/web/src/app/staff/consignment-requests/page.tsx`
- Create: `apps/web/src/app/staff/consignment-requests/actions.ts`
- Modify: the staff/admin nav (`admin/layout.tsx` and/or `admin/page.tsx`) — add the link

**Interfaces:**
- Consumes: `requireStaff`; `listConsignmentRequests`, `setConsignmentRequestStatus` (`@/lib/db`); `departmentLabel` (`@auction/core`); `formatRupiah`.
- Produces: the staff triage queue.

**REQUIRED:** Build with the **`frontend-design` skill`**.

- [ ] **Step 1: Build the queue + action**

`apps/web/src/app/staff/consignment-requests/page.tsx` — Server Component, `requireStaff()` first, `force-dynamic`:
- `const requests = await listConsignmentRequests(prisma);`
- Per request (newest first): contact (name, email, phone), `departmentLabel(category)`, item title + description, asking estimate (`formatRupiah` when set), submission date, current status; controls to set **Reviewing / Accepted / Declined**. The contact details are staff-only (this page is `requireStaff`).
- Empty → "No consignment requests yet."

`actions.ts` — `setConsignmentRequestStatusAction(id, status)`: `requireStaff()` first; validate `status ∈ {pending, reviewing, accepted, declined}` (reject otherwise); `setConsignmentRequestStatus`; `revalidatePath`. Wrap in try/catch → typed error.

- [ ] **Step 2: Nav link**

Add a **Consignment requests** (or "Sell inquiries") link to the staff/admin nav (`admin/layout.tsx` sidebar + `admin/page.tsx` index), next to Registrations / Consignor KYC.

**Design intent:** an editorial triage queue mirroring the other staff queues — contact + item + a clear status control. `frontend-design`, tokens-only.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: a submitted request appears in the queue; status transitions persist; the nav link reaches it.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/staff/consignment-requests" apps/web/src/app/admin/layout.tsx apps/web/src/app/admin/page.tsx
git commit -m "feat(web): staff consignment-requests triage queue"
```

---

## Self-Review

**Spec coverage:** `ConsignmentRequest` + repos → Task 1; public `/sell` form + server-validated action + header link → Task 2; staff queue + status action + nav → Task 3. Public-but-validated, contact PII staff-only, staff actions `requireStaff` + enum-validated, `category` validated, no image upload, `frontend-design`, tokens-only — Global Constraints + per-task contracts.

**Placeholder scan:** No TBD/TODO. Task 1 carries complete repo code + tests (read-sibling + adapt-harness + manual-migration notes — flagged). UI tasks carry complete contracts + the `frontend-design` mandate + the validation rules.

**Type consistency:** `ConsignmentRequestRecord`/`NewConsignmentRequest`/`ConsignmentRequestStatus` (Task 1) consumed by Tasks 2 (create) + 3 (list + status). `createConsignmentRequest` (Task 1) by Task 2; `listConsignmentRequests`/`setConsignmentRequestStatus` by Task 3. `sellerEstimate` integer rupiah (`toDbMoney`/`toMoney`). `isDepartmentSlug`/`departmentLabel` reused. The header Sell link → `/sell` (Task 2).

---

## Next

The layout/Christie's consistency pass (sub-project 4/4).
