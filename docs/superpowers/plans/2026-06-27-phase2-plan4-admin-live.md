# Phase 2 — Plan 4: Admin Live Controls + Queued Lots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live sales configurable and runnable end-to-end — admins set a sale's `mode`/`liveLotSeconds`, lots in a live sale are created `queued`, and a runner DB e2e proves the full open→bid→close→advance→finish loop.

**Architecture:** Small, surgical additions over the existing admin (Plan 7) and DB layer. `NewLot` gains an optional `status` so live lots are seeded `queued` (the runner promotes them). The admin sale form gains a mode selector + live timer; `createLotAction` stamps `queued` when the sale is live-mode. A new runner integration test drives the real `@auction/db` repos through `tickSale` across a multi-lot live sale.

**Tech Stack:** `@auction/db` (Prisma), Next.js admin (Plan 7), `@auction/live-runner` (Vitest DB integration), `@auction/core`.

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **Timed sales unchanged.** `NewLot.status` is optional (defaults to the schema default `live`); the admin sale form defaults `mode` to `timed`. Existing flows behave exactly as before.
- **Live lots are created `queued`** (so `advanceLiveSale` opens them one at a time); `Lot.closesAt` stays non-null (the admin sets a placeholder; the runner overwrites it on open).
- **Every admin server action re-gates with `requireStaff`** (Plan 7 pattern) — unchanged.
- **The runner e2e uses the test DB via `@auction/db`'s `prisma` + repos** (the repos take a `db` arg; the test points `DATABASE_URL` at `auction_test`) and a capturing fake broadcast — no live Supabase needed.
- **Money/BigInt discipline unchanged.**
- **TDD** for `NewLot.status` and the runner e2e. The admin form/action edits are verified by build.
- Suites must stay green: `@auction/db` (62→ grows), `@auction/web` (28), `@auction/live-runner` (6→ grows), `@auction/core` (36).

---

### Task 1: `NewLot.status` passthrough (queued-lot creation)

**Files:**
- Modify: `packages/db/src/types.ts` (`NewLot`)
- Modify: `packages/db/src/repositories/lots.ts` (`createLot`)
- Modify: `packages/db/src/repositories/lots.test.ts`

**Interfaces:**
- Consumes: `LotStatus` (Plan 1).
- Produces: `NewLot` gains `status?: LotStatus`; `createLot` honors it (default = schema `live`).

- [ ] **Step 1: Write the failing test**

Append to `packages/db/src/repositories/lots.test.ts`:
```ts
describe("createLot status", () => {
  it("defaults to live when no status is given", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    expect(lot.status).toBe("live");
  });

  it("creates a queued lot when status is queued", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      ...sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z")),
      status: "queued",
    });
    expect(lot.status).toBe("queued");
  });
});
```
(Uses the existing `makeSale`/`sampleLot` helpers in the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/lots.test.ts`
Expected: FAIL — `status` not accepted on `NewLot` / not applied.

- [ ] **Step 3: Add `status` to `NewLot`**

In `packages/db/src/types.ts`, add to the `NewLot` interface (after `consignorId`):
```ts
  status?: LotStatus;
```

- [ ] **Step 4: Honor it in `createLot`**

In `packages/db/src/repositories/lots.ts`, `createLot`'s `data` object, add (alongside the other fields):
```ts
      ...(input.status ? { status: input.status } : {}),
```

- [ ] **Step 5: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS — both new cases plus all prior db tests (omitting `status` still yields `live`).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): optional status on NewLot for queued live lots"
```

---

### Task 2: Admin sale form — mode + live timer

**Files:**
- Modify: `apps/web/src/app/admin/sales/sale-form.tsx`
- Modify: `apps/web/src/app/admin/sales/actions.ts`

**Interfaces:**
- Consumes: `SaleRecord` (with `mode`/`liveLotSeconds`, Plan 1); `createSale`/`updateSale` accepting `mode`/`liveLotSeconds` (Plan 1).
- Produces: the sale create/edit form sets `mode` (`timed`/`live`) and `liveLotSeconds`.

- [ ] **Step 1: Add the fields to the form**

In `apps/web/src/app/admin/sales/sale-form.tsx`, add a mode selector and a live-timer input (place them after the premium/tax row, before the increment-table textarea). Reuse the existing `FIELD`/`LABEL` class constants:
```tsx
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="mode" className={LABEL}>Mode</label>
          <select
            id="mode"
            name="mode"
            defaultValue={sale?.mode ?? "timed"}
            className={FIELD}
          >
            <option value="timed">Timed</option>
            <option value="live">Live</option>
          </select>
        </div>
        <div>
          <label htmlFor="liveLotSeconds" className={LABEL}>
            Live lot timer (seconds)
          </label>
          <input
            id="liveLotSeconds"
            name="liveLotSeconds"
            type="number"
            min={5}
            defaultValue={sale?.liveLotSeconds ?? 45}
            className={FIELD}
          />
        </div>
      </div>
```

- [ ] **Step 2: Parse + pass the fields in the actions**

In `apps/web/src/app/admin/sales/actions.ts`, extend `readForm` to include the two fields (the union is inferred from the ternary; no extra import needed):
```ts
    mode: formData.get("mode") === "live" ? ("live" as const) : ("timed" as const),
    liveLotSeconds: Number(formData.get("liveLotSeconds") ?? 45),
```
`createSale`/`updateSale` already accept `mode`/`liveLotSeconds` (Plan 1), so `readForm`'s return now flows them through both `createSaleAction` and `updateSaleAction` unchanged.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; the 28 web tests still pass. Manual (staff): create/edit a sale → set Mode = Live, timer = 30 → the sale persists `mode:"live"`, `liveLotSeconds:30`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/sales
git commit -m "feat(web): admin sale form mode + live lot timer"
```

---

### Task 3: Create live-sale lots as `queued`

**Files:**
- Modify: `apps/web/src/app/admin/sales/[id]/lots/actions.ts` (`createLotAction`)

**Interfaces:**
- Consumes: `getSale`, `createLot` (with `status`, Task 1); `requireStaff`.
- Produces: lots created under a `live`-mode sale are `queued`; under a `timed` sale they stay `live` (default).

- [ ] **Step 1: Stamp `queued` for live sales**

In `apps/web/src/app/admin/sales/[id]/lots/actions.ts`, `createLotAction` already has `saleId` and uses `requireStaff` + `readImages`/`readFields`. Load the sale and set the status for live sales. Ensure `getSale` is imported (merge into the existing `@/lib/db` import), then:
```ts
export async function createLotAction(
  saleId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const sale = await getSale(prisma, saleId);
  if (!sale) notFound();
  const images = await readImages(formData, []);
  const fields = readFields(formData);
  await createLot(prisma, {
    saleId,
    ...fields,
    description: fields.description ?? undefined,
    images,
    // Live sales queue their lots; the runner opens them one at a time.
    status: sale.mode === "live" ? "queued" : undefined,
  });
  revalidatePath(`/admin/sales/${saleId}/lots`);
  redirect(`/admin/sales/${saleId}/lots`);
}
```
(`notFound` is already imported in this file from Phase-1 Plan 7's fix. `createLot` ignores an `undefined` status → schema default `live`.)

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: add a lot to a live-mode sale → it is created `queued` (visible as status `queued` in the lots list); add a lot to a timed sale → `live` as before.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/admin/sales/[id]/lots/actions.ts"
git commit -m "feat(web): create live-sale lots as queued"
```

---

### Task 4: Runner DB end-to-end test

**Files:**
- Create: `services/live-runner/.env.test`
- Modify: `services/live-runner/vitest.config.ts`
- Create: `services/live-runner/src/test/global-setup.ts`
- Create: `services/live-runner/src/test/db.ts`
- Create: `services/live-runner/src/e2e.test.ts`

**Interfaces:**
- Consumes: `@auction/db` (`prisma`, `createSale`, `updateSaleStatus`, `createLot`, `createUser`, `createRegistration`, `setRegistrationKyc`, `appendBid`, `getLot`, `getInvoice`, `listLotsForSale`, `openQueuedLot`, `closeLot`); `tickSale` (Plan 2); `LiveLot` (Plan 1).
- Produces: an integration test that drives `tickSale` with real DB deps across a 2-lot live sale.

- [ ] **Step 1: Test env + vitest wiring**

`services/live-runner/.env.test` (local creds; the runner test points the `@auction/db` prisma client at the test DB):
```
DATABASE_URL="postgresql://auction:auction@localhost:5434/auction_test"
```

Replace `services/live-runner/vitest.config.ts`:
```ts
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Point @auction/db's prisma client at the test DB for integration tests.
config({ path: ".env.test" });

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    fileParallelism: false,
  },
});
```

`services/live-runner/src/test/global-setup.ts`:
```ts
import { execSync } from "node:child_process";

/** Ensure the test DB schema is current before the integration test. */
export default function setup(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set (see services/live-runner/.env.test)");
  execSync("pnpm --filter @auction/db exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
```

`services/live-runner/src/test/db.ts`:
```ts
import { prisma } from "@auction/db";

export { prisma };

/** Truncate all tables so the integration test starts clean. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "LedgerEntry","Invoice","Bid","Registration","Lot","Sale","User" RESTART IDENTITY CASCADE'
  );
}
```

- [ ] **Step 2: Write the e2e test**

`services/live-runner/src/e2e.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IncrementTable, LiveLot } from "@auction/core";
import {
  createSale,
  updateSaleStatus,
  createLot,
  createUser,
  createRegistration,
  setRegistrationKyc,
  appendBid,
  getLot,
  getInvoice,
  listLotsForSale,
  openQueuedLot,
  closeLot,
  updateSaleStatus as finishSaleRepo,
} from "@auction/db";
import { tickSale, type TickDeps } from "./tick";
import { prisma, resetDb } from "./test/db";

const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

beforeEach(async () => {
  await resetDb();
});

function realDeps(broadcast = vi.fn().mockResolvedValue(undefined)): TickDeps & {
  broadcast: ReturnType<typeof vi.fn>;
} {
  return {
    listLots: async (saleId): Promise<LiveLot[]> => {
      const lots = await listLotsForSale(prisma, saleId);
      return lots.map((l) => ({
        id: l.id,
        lotNumber: l.lotNumber,
        status: l.status,
        closesAt: l.closesAt,
      }));
    },
    openLot: (lotId, closesAt) => openQueuedLot(prisma, lotId, closesAt),
    closeLot: (lotId, now) => closeLot(prisma, lotId, now),
    finishSale: (saleId) => finishSaleRepo(prisma, saleId, "closed"),
    broadcast,
  };
}

describe("live-runner end-to-end", () => {
  it("sequences a 2-lot live sale: open → bid → close (sold) → open → close (unsold) → finish", async () => {
    const past = new Date("2026-07-01T00:00:00.000Z");
    const sale = await createSale(prisma, {
      title: "Live Sale",
      startsAt: past,
      endsAt: new Date("2026-07-02T00:00:00.000Z"),
      buyersPremiumPct: 20,
      taxPct: 11,
      incrementTable,
      mode: "live",
      liveLotSeconds: 30,
    });
    await updateSaleStatus(prisma, sale.id, "live");

    const placeholderClose = new Date("2026-07-01T01:00:00.000Z");
    const lot1 = await createLot(prisma, {
      saleId: sale.id, lotNumber: 1, title: "Lot 1",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: null, closesAt: placeholderClose, status: "queued",
    });
    const lot2 = await createLot(prisma, {
      saleId: sale.id, lotNumber: 2, title: "Lot 2",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: 5_000_000, closesAt: placeholderClose, status: "queued",
    });

    const bidder = await createUser(prisma, { email: "bidder@example.com" });
    const reg = await createRegistration(prisma, { userId: bidder.id, saleId: sale.id });
    await setRegistrationKyc(prisma, reg.id, "approved");

    const broadcast = vi.fn().mockResolvedValue(undefined);
    const deps = realDeps(broadcast);
    const saleInput = {
      id: sale.id,
      status: "live",
      startsAt: past,
      liveLotSeconds: 30,
    };

    const t0 = new Date("2026-07-01T10:00:00.000Z");

    // 1) opens lot 1
    expect((await tickSale(saleInput, deps, t0)).kind).toBe("open");
    expect((await getLot(prisma, lot1.id))?.status).toBe("live");

    // a bid lands on lot 1 (placed directly via the ledger for the test)
    await appendBid(prisma, {
      lotId: lot1.id, bidderId: bidder.id, maxAmount: 3_000_000, amount: 1_000_000,
    });

    // 2) after the timer, closes lot 1 → sold
    const t1 = new Date(t0.getTime() + 30_000 + 1);
    expect((await tickSale(saleInput, deps, t1)).kind).toBe("close");
    expect((await getLot(prisma, lot1.id))?.status).toBe("sold");
    expect(await getInvoice(prisma, lot1.id)).not.toBeNull();

    // 3) opens lot 2
    expect((await tickSale(saleInput, deps, t1)).kind).toBe("open");
    expect((await getLot(prisma, lot2.id))?.status).toBe("live");

    // 4) after the timer, closes lot 2 → unsold (no bids, reserve unmet)
    const t2 = new Date(t1.getTime() + 30_000 + 1);
    expect((await tickSale(saleInput, deps, t2)).kind).toBe("close");
    expect((await getLot(prisma, lot2.id))?.status).toBe("unsold");
    expect(await getInvoice(prisma, lot2.id)).toBeNull();

    // 5) finishes the sale
    expect((await tickSale(saleInput, deps, t2)).kind).toBe("finish");

    // broadcasts: 2 lot-opened, 2 lot-closed, 1 sale-ended
    const events = broadcast.mock.calls.map((c) => c[1]);
    expect(events.filter((e) => e === "lot-opened")).toHaveLength(2);
    expect(events.filter((e) => e === "lot-closed")).toHaveLength(2);
    expect(events.filter((e) => e === "sale-ended")).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the runner suite**

Ensure Docker Postgres is up (`docker compose ps` healthy). Run:
```bash
pnpm install
pnpm --filter @auction/live-runner test
```
Expected: global setup migrates `auction_test`, then the unit tests (broadcast, tick) plus the new e2e PASS — the e2e drives the full open→bid→close→advance→finish sequence against the real DB.

- [ ] **Step 4: Commit**

```bash
git add services/live-runner
git commit -m "test(live-runner): end-to-end sequencing of a multi-lot live sale"
```

---

## Self-Review

**Spec coverage (against the Phase 2 design doc §6 + carry-forward):**
- §6 admin sale `mode`/`liveLotSeconds` → Task 2 (form + actions). Lots in a live sale created `queued` → Task 1 (`NewLot.status`) + Task 3 (`createLotAction` stamps `queued` for live sales). Everything else in admin reuses Plan 7.
- **Carry-forward (queued seeding)** → Tasks 1 + 3; `Lot.closesAt` stays non-null (admin placeholder, runner overwrites) → no schema change.
- **Carry-forward (runner e2e)** → Task 4: a full DB integration of `tickSale` + real repos across a 2-lot live sale (sold + unsold + finish + broadcast counts).
- Timed sales unchanged: `NewLot.status` optional, form defaults `timed`, `createLotAction` only stamps `queued` for `mode:"live"`.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step has complete code. The admin form/action edits are verified by build; `NewLot.status` and the runner e2e are tested.

**Type consistency:** `NewLot.status?: LotStatus` (Task 1) is the same `LotStatus` (Plan 1) used by `createLotAction`'s `"queued"` (Task 3). The sale form's `mode`/`liveLotSeconds` map to `NewSale`/`UpdateSale` (Plan 1). The e2e's `realDeps` matches `TickDeps` (Plan 2) exactly and maps `LotRecord → LiveLot` (Plan 1) as `index.ts` does; repo calls (`openQueuedLot`, `closeLot`, `updateSaleStatus`, `appendBid`, `getInvoice`) match Plans 1/2/5/6. `liveLotSeconds:30` ⇒ close at `t0 + 30_000`.

---

## Phase 2 complete

With this plan, Phase 2 (live real-time auctions, Model B) is feature-complete and runnable end-to-end: an admin creates a `live`-mode sale with `queued` lots → sets it live → the `live-runner` sequences the lots on short timers (settling via `closeLot`, broadcasting on `sale:{id}`) → bidders watch `/live/[saleId]` and bid via the reused `placeBid`. Payments, notifications, and admin results all work for live sales unchanged (same ledger + `closeLot` path). Next: **Phase 3** (consignment intake, seller settlement/payouts, deeper KYC/AML, editorial content) — the `consignor` role + seller/house ledger seams already exist.
