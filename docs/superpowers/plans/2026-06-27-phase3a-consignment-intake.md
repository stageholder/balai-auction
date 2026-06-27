# Phase 3A — Consignment Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff record who consigned each lot and the sale's single house-default seller-commission rate — the foundation for seller settlement (Phase 3B).

**Architecture:** Additive, admin + DB. A `Sale.sellerCommissionPct` (sale-level integer percent, defaulting to a `@auction/core` house constant) mirroring the existing `buyersPremiumPct`/`taxPct`; surfacing the already-existing `Lot.consignorId` via a lot-form picker; and turning the user-admin staff/buyer toggle into a buyer/consignor/staff role selector. No settlement math, no payouts.

**Tech Stack:** `@auction/core` (TS, Vitest), `@auction/db` (Prisma/Postgres, Vitest), Next.js 15 admin, `frontend-design` for UI.

## Global Constraints

- **Node.js >= 20**, **pnpm only**. **Commit directly to `main`** (pre-production) — no feature branch.
- **All UI tasks (4, 5, 6) via the `frontend-design` skill**; tokens-only (no hex); no new UI deps.
- **Every admin action re-gates with `requireStaff`.**
- **Integer percents, integer rupiah.** `sellerCommissionPct` mirrors `buyersPremiumPct`/`taxPct`.
- **Reuse, don't fork:** extend the existing user/sale/lot admin in place; reuse `createLot`/`updateLot` `consignorId`.
- **Server-side validation:** unknown/empty consignor id → `null`; invalid role → rejected; commission outside 0–100 → the default.
- **Next.js 15** patterns (async params, Server Components default).
- **TDD** for `@auction/core` + `@auction/db`; admin UI verified by build + review.
- Suites stay green: core (39→), db (68→), web (32→), live-runner (7).

---

### Task 1: `@auction/core` — seller-commission default + validator

**Files:**
- Create: `packages/core/src/commission.ts`
- Create: `packages/core/src/commission.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `const DEFAULT_SELLER_COMMISSION_PCT = 10`; `isValidCommissionPct(n: number): boolean` (integer in [0, 100]).

- [ ] **Step 1: Write the failing test**

`packages/core/src/commission.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_SELLER_COMMISSION_PCT, isValidCommissionPct } from "./commission";

describe("seller commission", () => {
  it("has a sensible house default", () => {
    expect(DEFAULT_SELLER_COMMISSION_PCT).toBe(10);
  });

  it("accepts integer percents in [0, 100]", () => {
    expect(isValidCommissionPct(0)).toBe(true);
    expect(isValidCommissionPct(10)).toBe(true);
    expect(isValidCommissionPct(100)).toBe(true);
  });

  it("rejects out-of-range and non-integer values", () => {
    expect(isValidCommissionPct(-1)).toBe(false);
    expect(isValidCommissionPct(101)).toBe(false);
    expect(isValidCommissionPct(10.5)).toBe(false);
    expect(isValidCommissionPct(Number.NaN)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./commission`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/commission.ts`:
```ts
/** Single house-default seller commission (percent of hammer). */
export const DEFAULT_SELLER_COMMISSION_PCT = 10;

export function isValidCommissionPct(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 100;
}
```

- [ ] **Step 4: Re-export and run**

Append to `packages/core/src/index.ts`:
```ts
export * from "./commission";
```
Run: `pnpm --filter @auction/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): seller-commission default + isValidCommissionPct"
```

---

### Task 2: `@auction/db` — `Sale.sellerCommissionPct`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Generated: `packages/db/prisma/migrations/**`
- Modify: `packages/db/src/types.ts` (`SaleRecord`, `NewSale`, `UpdateSale`)
- Modify: `packages/db/src/mappers.ts` (`saleRowToRecord`)
- Modify: `packages/db/src/repositories/sales.ts` (`createSale`/`updateSale`)
- Modify: `packages/db/src/repositories/sales.test.ts`

**Interfaces:**
- Produces: `SaleRecord.sellerCommissionPct: number`; `NewSale`/`UpdateSale.sellerCommissionPct?: number`.

- [ ] **Step 1: Write the failing test**

Append to `packages/db/src/repositories/sales.test.ts`:
```ts
describe("seller commission", () => {
  it("defaults sellerCommissionPct to 10", async () => {
    const sale = await createSale(db, sampleSale("Default Commission"));
    expect(sale.sellerCommissionPct).toBe(10);
  });

  it("creates and updates a custom seller commission", async () => {
    const sale = await createSale(db, {
      ...sampleSale("Custom Commission"),
      sellerCommissionPct: 15,
    });
    expect(sale.sellerCommissionPct).toBe(15);

    const updated = await updateSale(db, sale.id, { sellerCommissionPct: 12 });
    expect(updated.sellerCommissionPct).toBe(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test`
Expected: FAIL — `sellerCommissionPct` missing.

- [ ] **Step 3: Edit the schema and migrate**

In `packages/db/prisma/schema.prisma`, add to `model Sale` (after `taxPct`):
```prisma
  sellerCommissionPct Int            @default(10)
```
Migrate (Docker Postgres up):
```bash
cd packages/db
pnpm exec prisma migrate dev --name sale_seller_commission
```
Expected: a migration adding the `sellerCommissionPct` column with default 10.

- [ ] **Step 4: Extend types**

In `packages/db/src/types.ts`: `SaleRecord` add `sellerCommissionPct: number;`; `NewSale` add `sellerCommissionPct?: number;`; `UpdateSale` add `sellerCommissionPct?: number;`.

- [ ] **Step 5: Map and pass through**

In `packages/db/src/mappers.ts`, extend `saleRowToRecord`'s param shape with `sellerCommissionPct: number;` and return `sellerCommissionPct: row.sellerCommissionPct`.

In `packages/db/src/repositories/sales.ts`, add to both `createSale` and `updateSale` `data`:
```ts
      ...(input.sellerCommissionPct !== undefined ? { sellerCommissionPct: input.sellerCommissionPct } : {}),
```

- [ ] **Step 6: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS — new commission tests + all prior db tests (existing sales default to 10).

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): add Sale.sellerCommissionPct (default 10)"
```

---

### Task 3: `@auction/db` — lot consignor passthrough + `listConsignors`

**Files:**
- Modify: `packages/db/src/types.ts` (`NewLot`, `UpdateLot`, `LotRecord`)
- Modify: `packages/db/src/mappers.ts` (`lotRowToRecord`)
- Modify: `packages/db/src/repositories/lots.ts` (`createLot`/`updateLot`)
- Modify: `packages/db/src/repositories/users.ts` (`listConsignors`)
- Modify: `packages/db/src/repositories/lots.test.ts`, `users.test.ts`

**Interfaces:**
- Consumes: `UserRecord`/`userRowToRecord` (existing).
- Produces: `LotRecord.consignorId: string | null`; `NewLot`/`UpdateLot.consignorId?: string | null`; `listConsignors(db): Promise<UserRecord[]>`.

- [ ] **Step 1: Write the failing tests**

First **read** `packages/db/src/repositories/lots.ts` (`createLot`/`updateLot`) and `users.ts` (the `listUsers`/`userRowToRecord` pattern, the `UserRecord` shape, and how `createUser` sets a role) so the additions match existing signatures.

Append to `packages/db/src/repositories/lots.test.ts`:
```ts
describe("lot consignor", () => {
  it("creates a lot with a consignor and clears it on update", async () => {
    const sale = await makeSale();
    const consignor = await createUser(db, { email: "consignor@example.com", role: "consignor" });
    const lot = await createLot(db, {
      ...sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z")),
      consignorId: consignor.id,
    });
    expect(lot.consignorId).toBe(consignor.id);

    const cleared = await updateLot(db, lot.id, { consignorId: null });
    expect(cleared.consignorId).toBeNull();
  });
});
```
(If `createUser` does not accept `role`, set the role via the existing role-setting repo helper instead — match what `users.ts` provides. Import `createUser`/that helper as the file already does.)

Append to `packages/db/src/repositories/users.test.ts`:
```ts
import { listConsignors } from "./users";

describe("listConsignors", () => {
  it("returns only consignor-role users", async () => {
    await createUser(db, { email: "buyer@example.com" }); // default role buyer
    const c1 = await createUser(db, { email: "c1@example.com", role: "consignor" });
    const c2 = await createUser(db, { email: "c2@example.com", role: "consignor" });
    const ids = (await listConsignors(db)).map((u) => u.id).sort();
    expect(ids).toEqual([c1.id, c2.id].sort());
  });
});
```
(Adapt the consignor-creation to the real `createUser`/role API as above.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @auction/db test`
Expected: FAIL — `consignorId` not on `LotRecord`/`UpdateLot`; `listConsignors` not exported.

- [ ] **Step 3: Types**

In `packages/db/src/types.ts`:
- `LotRecord`: add `consignorId: string | null;`
- `NewLot`: add `consignorId?: string | null;` (if not already present)
- `UpdateLot`: add `consignorId?: string | null;`

- [ ] **Step 4: Mapper**

In `packages/db/src/mappers.ts`, extend `lotRowToRecord`'s param shape with `consignorId: string | null;` and return `consignorId: row.consignorId`.

- [ ] **Step 5: Repo passthrough**

In `packages/db/src/repositories/lots.ts`:
- `createLot` `data`: ensure `...(input.consignorId !== undefined ? { consignorId: input.consignorId } : {})` (if `createLot` already sets `consignorId` unconditionally, convert to this conditional form so `null` clears and omission is allowed).
- `updateLot` `data`: add the same conditional spread.

- [ ] **Step 6: `listConsignors`**

In `packages/db/src/repositories/users.ts`, append (matching the file's `listUsers`/mapper style):
```ts
export async function listConsignors(db: PrismaClient): Promise<UserRecord[]> {
  const rows = await db.user.findMany({
    where: { role: "consignor" },
    orderBy: { email: "asc" },
  });
  return rows.map(userRowToRecord);
}
```
(Use the actual mapper name from `users.ts` — e.g. `userRowToRecord`/`toUserRecord`.)

- [ ] **Step 7: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): lot consignorId passthrough + listConsignors"
```

---

### Task 4: User-admin role selector (frontend-design)

**Files:**
- Modify: `apps/web/src/app/admin/users/page.tsx`
- Modify/Replace: `apps/web/src/app/admin/users/role-toggle.tsx` (→ a role selector)
- Modify: `apps/web/src/app/admin/users/actions.ts` (or wherever the role action lives)

**Interfaces:**
- Consumes: the `UserRole` values (`buyer`/`consignor`/`staff`); `requireStaff`.
- Produces: staff can set any user's role to `buyer`/`consignor`/`staff`.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Read the current implementation**

Read `apps/web/src/app/admin/users/page.tsx`, `role-toggle.tsx`, and the existing role action to learn the current toggle + action signature and the `UserRole` type source.

- [ ] **Step 2: Replace the toggle with a 3-way role selector**

- Replace the binary `RoleToggle` with a control offering **buyer / consignor / staff** (a `<select>` submitting a server action, or three options — keep it server-action-driven, minimal client JS; a small client component is fine if needed).
- The action — `setUserRole(userId, role)` — calls `requireStaff()`, validates `role` is one of the allowed `UserRole` values (reject otherwise), updates the user, and `revalidatePath`s the users page. (Reuse/rename the existing action; preserve its staff/buyer behavior.)
- Guard against a user removing their own staff access only if the existing code already does so; otherwise match existing behavior (do not add new self-lockout logic unless it already exists).

**Design intent:** a restrained admin control consistent with the existing users table — the role as a clear selectable state, not a cryptic toggle. Invoke `frontend-design`, then implement. Tokens-only.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual (staff): set a user to `consignor`; the role persists and shows in the table.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/users
git commit -m "feat(web): user-admin role selector (buyer/consignor/staff)"
```

---

### Task 5: Sale-form seller-commission input (frontend-design)

**Files:**
- Modify: `apps/web/src/app/admin/sales/sale-form.tsx`
- Modify: `apps/web/src/app/admin/sales/actions.ts`

**Interfaces:**
- Consumes: `DEFAULT_SELLER_COMMISSION_PCT`/`isValidCommissionPct` (`@auction/core`); `SaleRecord.sellerCommissionPct` + `NewSale`/`UpdateSale.sellerCommissionPct` (Task 2).
- Produces: the sale form sets a validated `sellerCommissionPct`.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Add the input**

In `apps/web/src/app/admin/sales/sale-form.tsx`, add a **Seller commission (%)** number input next to the buyer's-premium / tax fields (reuse the `FIELD`/`LABEL` constants):
```tsx
        <div>
          <label htmlFor="sellerCommissionPct" className={LABEL}>
            Seller commission (%)
          </label>
          <input
            id="sellerCommissionPct"
            name="sellerCommissionPct"
            type="number"
            min={0}
            max={100}
            defaultValue={sale?.sellerCommissionPct ?? DEFAULT_SELLER_COMMISSION_PCT}
            className={FIELD}
          />
        </div>
```
(Import `DEFAULT_SELLER_COMMISSION_PCT` from `@auction/core`.)

- [ ] **Step 2: Parse + validate in the action**

In `apps/web/src/app/admin/sales/actions.ts`, import `isValidCommissionPct`, `DEFAULT_SELLER_COMMISSION_PCT` from `@auction/core` and extend `readForm`:
```ts
    sellerCommissionPct: (() => {
      const n = Number(formData.get("sellerCommissionPct"));
      return isValidCommissionPct(n) ? n : DEFAULT_SELLER_COMMISSION_PCT;
    })(),
```
(Flows through both `createSaleAction` and `updateSaleAction`.)

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: set a sale's seller commission to 15 → persists; clearing/invalid → defaults to 10.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/sales
git commit -m "feat(web): sale-form seller commission input"
```

---

### Task 6: Lot-form consignor picker + lot-list column (frontend-design)

**Files:**
- Modify: `apps/web/src/app/admin/sales/[id]/lots/lot-form.tsx`
- Modify: `apps/web/src/app/admin/sales/[id]/lots/actions.ts` (`createLotAction`/`updateLotAction`)
- Modify: the pages that render `lot-form` — `apps/web/src/app/admin/sales/[id]/lots/page.tsx` and `apps/web/src/app/admin/sales/[id]/lots/[lotId]/page.tsx` (pass consignors in)
- Modify: the admin lot list (likely `apps/web/src/app/admin/sales/[id]/lots/page.tsx`) — show consignor

**Interfaces:**
- Consumes: `listConsignors` (Task 3); `createLot`/`updateLot` `consignorId` (Task 3); `requireStaff`; `getSale`.
- Produces: staff assign a consignor to a lot; the lot list shows it.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Read the current lot admin**

Read `lot-form.tsx`, `[id]/lots/actions.ts` (`createLotAction`/`updateLotAction` — note the Phase-2 `status` stamping), `[id]/lots/page.tsx` (the lot list + the create form), and `[id]/lots/[lotId]/page.tsx` (the edit form) to learn how the form receives props and how the actions read fields.

- [ ] **Step 2: Pass consignors into the form**

In both pages that render `lot-form`, fetch `const consignors = await listConsignors(prisma);` and pass it to `LotForm` as a prop (`consignors: { id: string; email: string }[]`).

- [ ] **Step 3: Add the consignor picker**

In `lot-form.tsx`, accept the `consignors` prop and add a **Consignor** `<select name="consignorId">` (reuse `FIELD`/`LABEL`): first option `<option value="">— None —</option>`, then `consignors.map(c => <option value={c.id}>{c.email}</option>)`; `defaultValue={lot?.consignorId ?? ""}`.

- [ ] **Step 4: Wire + validate in the actions**

In `createLotAction` and `updateLotAction` (`[id]/lots/actions.ts`), read and validate `consignorId`:
```ts
  const rawConsignor = String(formData.get("consignorId") ?? "");
  const consignorId =
    rawConsignor && consignors.some((c) => c.id === rawConsignor)
      ? rawConsignor
      : null;
```
Resolve the valid-consignor set by loading `const consignors = await listConsignors(prisma);` in the action (so an injected unknown id can't slip through). Pass `consignorId` into the `createLot`/`updateLot` call (alongside the existing fields; `createLotAction` keeps its Phase-2 `status` logic). `requireStaff()` stays first.

- [ ] **Step 5: Show consignor in the lot list**

In the admin lots list (`[id]/lots/page.tsx`), display each lot's consignor email (look it up from the `consignors` list by `lot.consignorId`, or "—" when null). Keep it a calm extra column/line.

**Design intent:** the consignor picker sits naturally in the lot form; the list shows consignment at a glance. Invoke `frontend-design`, then implement. Tokens-only.

- [ ] **Step 6: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: create/edit a lot, assign a consignor (must be a consignor-role user); the lot list shows it; "— None —" clears it.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/admin/sales/[id]/lots"
git commit -m "feat(web): lot-form consignor picker + lot-list consignor column"
```

---

## Self-Review

**Spec coverage (against the design doc):**
- Seller-commission rate (sale-level, default from house constant) → Task 1 (constant + validator) + Task 2 (`Sale.sellerCommissionPct`) + Task 5 (sale form + action).
- Consignor onboarding (role) → Task 4 (buyer/consignor/staff selector + `setUserRole`).
- Consignor on lots → Task 3 (`consignorId` passthrough + `LotRecord` + `listConsignors`) + Task 6 (picker + action validation + lot-list column).
- All admin actions `requireStaff`; server-side validation of role/consignor/commission — Global Constraints + per-task contracts.
- No settlement math / payouts / KYC / editorial — Phase 3B/C/D, out of scope here.

**Placeholder scan:** No TBD/TODO. Core/db tasks carry complete code; UI tasks carry complete contracts + design intent + the `frontend-design` mandate, and instruct reading the current files first (their exact current contents aren't frozen here, so the implementer adapts to real signatures — explicitly flagged, not a placeholder).

**Type consistency:** `DEFAULT_SELLER_COMMISSION_PCT`/`isValidCommissionPct` (Task 1) consumed by Task 5. `Sale.sellerCommissionPct` (Task 2) read by Task 5's form default. `LotRecord.consignorId`/`NewLot`/`UpdateLot.consignorId` + `listConsignors` (Task 3) consumed by Task 6. `UserRole` (`buyer`/`consignor`/`staff`) drives Tasks 3 (`listConsignors` filter), 4 (selector), 6 (validation). Money/percent integers throughout.

---

## Next (Phase 3 continuation)

**B) Seller settlement & payouts** — `computeSellerSettlement(hammer, sellerCommissionPct)` in `@auction/core`, `seller`/`house` `LedgerEntry`s on settlement, a settlement statement, and Xendit **Disbursement** payouts after the buyer pays. Then **C) Consignor KYC/AML** and **D) Editorial / department pages**.
