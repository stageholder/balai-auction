# Phase 3B-1 — Settlement Core + Ledger + Payout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a buyer pays for a consigned lot, compute the seller/house split, record the ledger entries + a pending Payout, and show staff a settlement statement — no live disbursement yet (that's B-2).

**Architecture:** A pure `computeSellerSettlement` in `@auction/core` (+ a new `commission` ledger kind); a `Payout` model + consignor payout-account fields in `@auction/db`; settlement woven into the existing transactional `markInvoicePaid`; payout repos; and a read-only `/admin/payouts` statement view. Sources the consignor from the stored `lot.consignorId` FK.

**Tech Stack:** `@auction/core` (TS, Vitest), `@auction/db` (Prisma/Postgres, Vitest), Next.js 15 admin, `frontend-design` for UI.

## Global Constraints

- **Node.js >= 20**, **pnpm only**. **Commit directly to `main`** (pre-production).
- **All UI tasks via `frontend-design`**; tokens-only; no new UI deps.
- **Integer rupiah / `BigInt` at the DB boundary.** Settlement math is integer-only.
- **Settlement reads the consignor from `lot.consignorId`** (the stored FK), never role/`listConsignors` — so a post-assignment role change can't drop a settlement.
- **Idempotent settlement:** rides the existing `markInvoicePaid` `pending→paid` claim; `Payout.lotId @unique` backstops double-creation. A non-consigned lot gets **no** payout.
- **No disbursement / no release here** — B-1 only records + displays; the statement view is read-only.
- **Every admin action re-gates `requireStaff`.**
- **TDD** for core + db; admin UI by build + review.
- Suites stay green: core (42→), db (72→), web (32→), live-runner (7).

---

### Task 1: `@auction/core` — `computeSellerSettlement` + `commission` kind

**Files:**
- Modify: `packages/core/src/types.ts` (`LedgerKind`)
- Create: `packages/core/src/seller-settlement.ts`
- Create: `packages/core/src/seller-settlement.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Money`, `LedgerEntry`, `LedgerKind` (`@auction/core`).
- Produces: `LedgerKind` gains `"commission"`; `interface SellerSettlement { hammer: Money; sellerCommission: Money; consignorNet: Money; entries: LedgerEntry[] }`; `computeSellerSettlement(params: { hammer: Money; sellerCommissionPct: number }): SellerSettlement`.

- [ ] **Step 1: Add `commission` to `LedgerKind`**

In `packages/core/src/types.ts`, add `"commission"` to the `LedgerKind` union (after `"premium"` or at the end):
```ts
export type LedgerKind =
  | "hammer"
  | "premium"
  | "commission"
  | "tax"
  | "deposit"
  | "payout"
  | "refund";
```

- [ ] **Step 2: Write the failing test**

`packages/core/src/seller-settlement.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeSellerSettlement } from "./seller-settlement";

describe("computeSellerSettlement", () => {
  it("splits hammer into consignor net + house commission", () => {
    const s = computeSellerSettlement({ hammer: 1_000_000, sellerCommissionPct: 10 });
    expect(s.sellerCommission).toBe(100_000);
    expect(s.consignorNet).toBe(900_000);
    expect(s.entries).toEqual([
      { party: "seller", kind: "hammer", amount: 1_000_000 },
      { party: "house", kind: "commission", amount: 100_000 },
    ]);
  });

  it("rounds the commission to the nearest rupiah", () => {
    const s = computeSellerSettlement({ hammer: 1_000_005, sellerCommissionPct: 10 });
    expect(s.sellerCommission).toBe(100_001); // round(100000.5)
    expect(s.consignorNet).toBe(900_004);
  });

  it("handles 0% and 100% edges", () => {
    const zero = computeSellerSettlement({ hammer: 500_000, sellerCommissionPct: 0 });
    expect(zero.sellerCommission).toBe(0);
    expect(zero.consignorNet).toBe(500_000);

    const full = computeSellerSettlement({ hammer: 500_000, sellerCommissionPct: 100 });
    expect(full.sellerCommission).toBe(500_000);
    expect(full.consignorNet).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./seller-settlement`.

- [ ] **Step 4: Write the implementation**

`packages/core/src/seller-settlement.ts`:
```ts
import type { LedgerEntry, Money } from "./types";

export interface SellerSettlement {
  hammer: Money;
  sellerCommission: Money;
  consignorNet: Money;
  /** Settlement-time allocation. The `seller payout` entry is written later,
   *  when the disbursement completes (Phase 3B-2). */
  entries: LedgerEntry[];
}

export function computeSellerSettlement(params: {
  hammer: Money;
  sellerCommissionPct: number;
}): SellerSettlement {
  const { hammer, sellerCommissionPct } = params;
  const sellerCommission = Math.round((hammer * sellerCommissionPct) / 100);
  const consignorNet = hammer - sellerCommission;
  const entries: LedgerEntry[] = [
    { party: "seller", kind: "hammer", amount: hammer },
    { party: "house", kind: "commission", amount: sellerCommission },
  ];
  return { hammer, sellerCommission, consignorNet, entries };
}
```

- [ ] **Step 5: Re-export and run**

Append to `packages/core/src/index.ts`:
```ts
export * from "./seller-settlement";
```
Run: `pnpm --filter @auction/core test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): computeSellerSettlement + commission ledger kind"
```

---

### Task 2: `@auction/db` — `commission` enum, `Payout` model, consignor payout account

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Generated: `packages/db/prisma/migrations/**`
- Modify: `packages/db/src/types.ts` (`PayoutStatus`, `PayoutRecord`, `UserRecord` payout fields)
- Modify: `packages/db/src/mappers.ts` (`payoutRowToRecord`, `userRowToRecord`)

**Interfaces:**
- Produces:
  - Prisma `LedgerKind` gains `commission`; `enum PayoutStatus { pending released paid failed }`; `model Payout`; `User.payoutBankCode/payoutAccountNumber/payoutAccountHolder` (nullable).
  - `type PayoutStatus = "pending" | "released" | "paid" | "failed"`; `interface PayoutRecord { id; lotId; consignorId; amount: number; status: PayoutStatus; xenditDisbursementId: string | null; createdAt: Date; releasedAt: Date | null; paidAt: Date | null }`; `UserRecord` gains `payoutBankCode/payoutAccountNumber/payoutAccountHolder: string | null`.

- [ ] **Step 1: Edit the schema**

In `packages/db/prisma/schema.prisma`:
- Add `commission` to `enum LedgerKind` (place after `premium`):
```prisma
enum LedgerKind {
  hammer
  premium
  commission
  tax
  deposit
  payout
  refund
}
```
- Add:
```prisma
enum PayoutStatus {
  pending
  released
  paid
  failed
}

model Payout {
  id                   String       @id @default(uuid())
  lotId                String       @unique
  lot                  Lot          @relation(fields: [lotId], references: [id])
  consignorId          String
  consignor            User         @relation("ConsignorPayouts", fields: [consignorId], references: [id])
  amount               BigInt
  status               PayoutStatus @default(pending)
  xenditDisbursementId String?
  createdAt            DateTime     @default(now())
  releasedAt           DateTime?
  paidAt               DateTime?

  @@index([consignorId])
  @@index([status])
}
```
- Add the back-relations + payout-account fields to `model User`:
```prisma
  payouts              Payout[]       @relation("ConsignorPayouts")
  payoutBankCode       String?
  payoutAccountNumber  String?
  payoutAccountHolder  String?
```
- Add the back-relation to `model Lot`:
```prisma
  payout               Payout?
```

- [ ] **Step 2: Migrate**

```bash
cd packages/db
pnpm exec prisma migrate dev --name seller_payouts
```
Expected: a migration that **adds** the `commission` enum value, creates `PayoutStatus` + the `Payout` table, and adds the three nullable `User` columns. (The migration only *adds* the `commission` enum value; it does not also use it — runtime app code uses it. Confirm the generated SQL doesn't insert a `commission` ledger row.)

- [ ] **Step 3: Types**

In `packages/db/src/types.ts`:
```ts
export type PayoutStatus = "pending" | "released" | "paid" | "failed";

export interface PayoutRecord {
  id: string;
  lotId: string;
  consignorId: string;
  amount: number; // rupiah
  status: PayoutStatus;
  xenditDisbursementId: string | null;
  createdAt: Date;
  releasedAt: Date | null;
  paidAt: Date | null;
}
```
Add to `UserRecord`: `payoutBankCode: string | null; payoutAccountNumber: string | null; payoutAccountHolder: string | null;`

- [ ] **Step 4: Mappers**

In `packages/db/src/mappers.ts`:
- Add `payoutRowToRecord` (convert `amount` BigInt → number via the existing `toMoney`/`Number(...)` helper used by other money mappers):
```ts
export function payoutRowToRecord(row: {
  id: string; lotId: string; consignorId: string; amount: bigint;
  status: PayoutRecord["status"]; xenditDisbursementId: string | null;
  createdAt: Date; releasedAt: Date | null; paidAt: Date | null;
}): PayoutRecord {
  return {
    id: row.id, lotId: row.lotId, consignorId: row.consignorId,
    amount: toMoney(row.amount),
    status: row.status, xenditDisbursementId: row.xenditDisbursementId,
    createdAt: row.createdAt, releasedAt: row.releasedAt, paidAt: row.paidAt,
  };
}
```
(Use the exact BigInt→Money helper this file already uses; import `PayoutRecord`.)
- Extend `userRowToRecord`'s param shape + return with the three payout-account fields.

- [ ] **Step 5: Build the db package + run the suite**

Run: `pnpm --filter @auction/db build` (or `typecheck`) then `pnpm --filter @auction/db test`
Expected: compiles; all prior db tests still pass (no behavior changed yet — this task is schema/types/mappers only; the settlement logic + repos land in Tasks 3-4).

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): commission kind, Payout model, consignor payout account"
```

---

### Task 3: `@auction/db` — settle the seller side inside `markInvoicePaid`

**Files:**
- Modify: `packages/db/src/repositories/invoices.ts` (`markInvoicePaid`)
- Modify: `packages/db/src/repositories/invoices.test.ts` (or `close.test.ts` — wherever `markInvoicePaid` is tested)

**Interfaces:**
- Consumes: `computeSellerSettlement` (`@auction/core`, Task 1); `toDbMoney`; the `Payout` model (Task 2); the `lot`/`sale`/`invoice` rows.
- Produces: `markInvoicePaid` now, for a **consigned** lot, writes the seller/house ledger entries + a `pending` Payout in the same transaction; non-consigned lots are unaffected; idempotent.

- [ ] **Step 1: Read the current `markInvoicePaid`**

Read `packages/db/src/repositories/invoices.ts` — the existing `markInvoicePaid` transaction (the `pending→paid` claim, the lot→paid update, what it loads). Note how ledger entries are written elsewhere (`closeLot` uses `tx.ledgerEntry.createMany` + `toDbMoney`).

- [ ] **Step 2: Write the failing test**

Append to the file that tests `markInvoicePaid` (mirror its existing seeding — a sold lot with a buyer invoice; reuse the helpers there, and the consignor/sale-commission setup from `close.test.ts`/`results.test.ts`):
```ts
describe("markInvoicePaid seller settlement", () => {
  it("writes seller+house ledger entries and a pending payout for a consigned lot", async () => {
    // seed: sale (sellerCommissionPct 10) + a consignor user + a sold lot
    //       consigned to them with a buyer invoice (hammer 1_000_000), via the
    //       same close/seed path the existing markInvoicePaid test uses.
    // ... (adapt to the file's existing helpers) ...
    const ok = await markInvoicePaid(db, invoice.id);
    expect(ok).toBe(true);

    const payout = await db.payout.findUnique({ where: { lotId: lot.id } });
    expect(payout?.status).toBe("pending");
    expect(Number(payout?.amount)).toBe(900_000); // hammer - 10%

    const entries = await getLedgerEntriesForInvoice(db, invoice.id);
    expect(entries.some((e) => e.party === "seller" && e.kind === "hammer" && e.amount === 1_000_000)).toBe(true);
    expect(entries.some((e) => e.party === "house" && e.kind === "commission" && e.amount === 100_000)).toBe(true);
  });

  it("creates NO payout for a non-consigned lot", async () => {
    // seed a sold lot with NO consignorId + buyer invoice
    await markInvoicePaid(db, invoice.id);
    expect(await db.payout.findUnique({ where: { lotId: lot.id } })).toBeNull();
  });

  it("is idempotent — a second markInvoicePaid does not double-settle", async () => {
    await markInvoicePaid(db, invoice.id);
    const second = await markInvoicePaid(db, invoice.id);
    expect(second).toBe(false);
    expect(await db.payout.count({ where: { lotId: lot.id } })).toBe(1);
  });
});
```
(Adapt the seeding to the real helpers in the test file — `createSale` with `sellerCommissionPct`, `createUser` `role:"consignor"`, `createLot` with `consignorId`, the existing winning-bid + `closeLot` path that creates the buyer invoice. Keep the three assertions fixed.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @auction/db test`
Expected: FAIL — no payout / no seller-house entries written.

- [ ] **Step 4: Extend `markInvoicePaid`**

Inside the existing transaction, **after** the `pending→paid` claim succeeds (count === 1) and the lot is marked paid: load the lot (`consignorId`, `saleId`, the invoice `hammer`) and the sale (`sellerCommissionPct`). If `lot.consignorId` is set:
```ts
import { computeSellerSettlement } from "@auction/core";
// ... inside the transaction, after claiming pending→paid and updating the lot:
if (lot.consignorId) {
  const settlement = computeSellerSettlement({
    hammer: toMoney(invoice.hammer),
    sellerCommissionPct: sale.sellerCommissionPct,
  });
  await tx.ledgerEntry.createMany({
    data: settlement.entries.map((e) => ({
      invoiceId: invoice.id,
      lotId: lot.id,
      party: e.party,
      kind: e.kind,
      amount: toDbMoney(e.amount),
    })),
  });
  await tx.payout.create({
    data: {
      lotId: lot.id,
      consignorId: lot.consignorId,
      amount: toDbMoney(settlement.consignorNet),
      status: "pending",
    },
  });
}
```
(Use the `invoice`/`lot`/`sale` rows already in scope or loaded within the tx; `toMoney`/`toDbMoney` are the existing money mappers. The `pending→paid` claim already guarantees this block runs at most once per invoice.)

- [ ] **Step 5: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS — the three new cases + all prior db tests (non-consigned lots unchanged; existing `markInvoicePaid` behavior preserved).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): settle seller side (ledger + pending payout) on buyer payment"
```

---

### Task 4: `@auction/db` — payout repos + consignor payout account

**Files:**
- Create: `packages/db/src/repositories/payouts.ts`
- Modify: `packages/db/src/repositories/users.ts` (payout-account setter)
- Modify: `packages/db/src/index.ts` (exports, if it barrels repos)
- Create: `packages/db/src/repositories/payouts.test.ts`; modify `users.test.ts`

**Interfaces:**
- Produces:
  - `interface PayoutListItem { id; status: PayoutStatus; lotId; lotNumber; lotTitle; consignorId; consignorEmail; hasBankDetails: boolean; hammer: number; commission: number; net: number; xenditDisbursementId: string | null; createdAt: Date }`
  - `listPayouts(db): Promise<PayoutListItem[]>` (newest first), `getPayout(db, id): Promise<PayoutRecord | null>`,
    `releasePayout(db, id, xenditDisbursementId): Promise<PayoutRecord | null>` (guarded `pending→released`),
    `markPayoutPaid(db, xenditDisbursementId): Promise<boolean>` (guarded `released→paid` + writes the `seller payout` ledger entry),
    `markPayoutFailed(db, xenditDisbursementId): Promise<boolean>` (guarded `released→failed`).
  - `setConsignorPayoutAccount(db, userId, { bankCode, accountNumber, accountHolder }): Promise<UserRecord>` (in `users.ts`).

- [ ] **Step 1: Write the failing tests**

`packages/db/src/repositories/payouts.test.ts` — seed (as in Task 3) a paid buyer invoice on a consigned lot so a `pending` Payout exists, then:
- `listPayouts` returns an item with `net` = consignorNet, `commission` = hammer − net, `hammer`, `consignorEmail`, `hasBankDetails` false (no bank set), status `pending`.
- `releasePayout(db, id, "disb_1")` → status `released`, `xenditDisbursementId` "disb_1", `releasedAt` set; a second `releasePayout` on the same id returns `null` (already released).
- `markPayoutPaid(db, "disb_1")` → `true`, status `paid`, `paidAt` set, and a `{ party:"seller", kind:"payout", amount: net }` ledger entry now exists for the lot; a second call returns `false`.
- `markPayoutFailed(db, "disb_2")` on a released payout with that disb id → `true`, status `failed`.

In `users.test.ts`: `setConsignorPayoutAccount` sets the three fields and they round-trip via the user record.

(Use the real seeding helpers; keep assertions fixed.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @auction/db test`
Expected: FAIL — repos not exported.

- [ ] **Step 3: Implement the payout repos**

`packages/db/src/repositories/payouts.ts` — use `payoutRowToRecord` (Task 2), `toMoney`/`toDbMoney`, guarded `updateMany` claims (mirror `markInvoicePaid`/`openQueuedLot` patterns):
- `listPayouts`: `db.payout.findMany({ orderBy: { createdAt: "desc" }, include: { lot: { include: { invoice: { select: { hammer: true } } } }, consignor: { select: { email: true, payoutBankCode: true, payoutAccountNumber: true, payoutAccountHolder: true } } } })`, mapped to `PayoutListItem` — `net = toMoney(p.amount)`, `hammer = toMoney(p.lot.invoice.hammer)`, `commission = hammer − net`, `hasBankDetails = !!(bankCode && accountNumber && accountHolder)`, `lotNumber`/`lotTitle` from `p.lot`.
- `getPayout`: findUnique → `payoutRowToRecord`.
- `releasePayout`: `updateMany({ where: { id, status: "pending" }, data: { status: "released", xenditDisbursementId, releasedAt: now } })`; if count 0 → null; else fetch + map. (Accept `now` via `new Date()` inside, or a passed `now` — match the codebase's repo convention.)
- `markPayoutPaid`: in a `$transaction` — `updateMany({ where: { xenditDisbursementId, status: "released" }, data: { status: "paid", paidAt } })`; if count 0 → false; else fetch the payout, write `{ party:"seller", kind:"payout", amount: toDbMoney(net), lotId }` ledger entry, return true.
- `markPayoutFailed`: guarded `released→failed` by `xenditDisbursementId`; boolean.

`packages/db/src/repositories/users.ts` — `setConsignorPayoutAccount(db, userId, fields)`: `db.user.update({ where: { id: userId }, data: { payoutBankCode, payoutAccountNumber, payoutAccountHolder } })` → `userRowToRecord`.

Export the new repos from the package barrel if one exists.

- [ ] **Step 4: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): payout repos + consignor payout account"
```

---

### Task 5: `/admin/payouts` settlement-statement view + consignor bank details (frontend-design)

**Files:**
- Create: `apps/web/src/app/admin/payouts/page.tsx`
- Modify: the admin home (`apps/web/src/app/admin/page.tsx`) — add a Payouts link
- Modify: the user/consignor admin (`apps/web/src/app/admin/users/...`) — add payout-account entry for consignors + the action

**Interfaces:**
- Consumes: `listPayouts` (Task 4); `setConsignorPayoutAccount` (Task 4); `formatRupiah`; `requireStaff`.
- Produces: a read-only payouts/settlement page; staff can set a consignor's bank details. (Release is B-2.)

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Payouts statement page**

`apps/web/src/app/admin/payouts/page.tsx` — Server Component, `requireStaff()` first, `dynamic = "force-dynamic"`:
- `const payouts = await listPayouts(prisma);`
- Render a settlement table: **Lot** (number + title, link `/admin/sales/.../lots/...` if easy, else plain) · **Consignor** (email) · **Hammer** · **Commission** · **Net** (all `formatRupiah`) · **Bank details** ("On file" / "Missing") · **Status** (pending/released/paid/failed). Newest first.
- A short summary line (count pending, total net pending). Empty → calm "No payouts yet."
- **Read-only** — no release button here (B-2 adds it). Where bank details are missing, a quiet "Add in Users" hint.

**Design intent:** an editorial settlement ledger — tabular figures, quiet hairlines, status legible. Invoke `frontend-design`, then implement. Tokens-only.

- [ ] **Step 2: Admin nav + consignor bank details**

- Add a **Payouts** link to `apps/web/src/app/admin/page.tsx` (the admin home).
- In the user admin (where the role selector lives), for `consignor`-role users add a small **payout bank details** form (Bank code, Account number, Account holder) → a `setConsignorPayoutAccountAction(userId, fields)` server action (`requireStaff`, `revalidatePath`). Keep it minimal and tokens-only; show current values as defaults.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds (`/admin/payouts` compiles); tests pass. Manual (staff): pay a buyer invoice for a consigned lot → it appears on `/admin/payouts` as `pending` with the correct hammer/commission/net; set the consignor's bank details → "On file".

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin
git commit -m "feat(web): admin payouts settlement view + consignor bank details"
```

---

## Self-Review

**Spec coverage (against the design doc, B-1 portion):**
- `computeSellerSettlement` + `commission` kind → Task 1. `Payout`/`PayoutStatus` + consignor payout account → Task 2. Settlement on buyer-pay (seller/house entries + pending Payout, idempotent, FK-sourced, non-consigned → none) → Task 3. Payout repos + bank-account setter → Task 4. Read-only `/admin/payouts` statement + bank-details entry → Task 5.
- B-2 (Xendit disbursement client, Release action, disbursement webhook) — out of scope here; `releasePayout`/`markPayoutPaid`/`markPayoutFailed` repos are built now (Task 4) and consumed by B-2.
- Idempotent, integer-rupiah, FK-sourced consignor, staff-gated — Global Constraints + per-task contracts.

**Placeholder scan:** No TBD/TODO. Core/db math + types + repos carry complete code; the settlement-in-`markInvoicePaid` and repo/test tasks instruct reading the real files first and adapting seeding to existing helpers (flagged, not placeholders). UI task carries a complete contract + design intent + `frontend-design` mandate.

**Type consistency:** `computeSellerSettlement`/`SellerSettlement` (Task 1) consumed by Task 3. `commission` `LedgerKind` (Task 1 core union + Task 2 prisma enum) used by Task 3's entries. `PayoutRecord`/`PayoutStatus`/`payoutRowToRecord` (Task 2) consumed by Task 4; `PayoutListItem` (Task 4) by Task 5. `UserRecord` payout fields (Task 2) by Task 4 setter + Task 5 form. Consignor sourced from `lot.consignorId` (Task 3). Money integer rupiah; `toMoney`/`toDbMoney` at the boundary.

---

## Next (Phase 3B-2)

Xendit `createDisbursement` client (logic-tested) → staff **Release payout** action (requires bank details; `createDisbursement` → `releasePayout`) + button on `/admin/payouts` → disbursement webhook (`markPayoutPaid`/`markPayoutFailed`, timing-safe token). Then **3C** consignor KYC/AML, **3D** editorial.
