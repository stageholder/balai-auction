# Phase 2 — Plan 1: Schema & Sequencing Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the live-auction foundation — the `Sale.mode`/`liveLotSeconds` + `queued` lot status schema, the mode-aware soft-close, the pure `advanceLiveSale` sequencer, and the DB helpers the runner needs — all fully unit/DB-tested, with timed sales unchanged.

**Architecture:** Pure additions. `@auction/core` gains `SaleMode`, the soft-close window helper, and the pure `advanceLiveSale` decision function (no I/O). `@auction/db` gains the schema fields/enum value, the record/mapper passthrough, and two repo helpers (`openQueuedLot`, `listRunningLiveSales`). `apps/web`'s `placeBid` becomes mode-aware for soft-close. No live-runner, UI, or admin yet (later Phase 2 plans).

**Tech Stack:** `@auction/core` (TS, Vitest), `@auction/db` (Prisma/Postgres, Vitest), `apps/web` (Next.js).

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **Timed sales are unchanged.** `Sale.mode` defaults to `"timed"`; the existing close-lots cron and timed bidding behave exactly as in Phase 1. The new code paths only affect `live`-mode sales.
- **Money is integer rupiah / BigInt at the DB boundary** (unchanged).
- **`@auction/core` stays pure** — zero runtime deps, no I/O, no `@auction/db` import. `advanceLiveSale` is a pure function over plain data.
- **`@auction/db` depends on `@auction/core`** (existing) and imports `SaleMode` from it.
- **Live anti-snipe window is the constant `LIVE_SOFT_CLOSE_MS = 12000`**; timed stays `TIMED_SOFT_CLOSE_MS = 120000` (2 min). Per-lot live timer is `Sale.liveLotSeconds` (default 45).
- **TDD** for the core helpers, `advanceLiveSale`, and the DB repos. `placeBid`'s mode-aware edit is verified by build (it's wiring over already-tested pieces).
- Suites must stay green: `@auction/core` (28→ grows), `@auction/db` (54→ grows), `@auction/web` (25).

---

### Task 1: `@auction/core` — SaleMode + mode-aware soft-close window

**Files:**
- Create: `packages/core/src/timing.ts`
- Create: `packages/core/src/timing.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SaleMode = "timed" | "live"`
  - `const TIMED_SOFT_CLOSE_MS = 120000`, `const LIVE_SOFT_CLOSE_MS = 12000`
  - `softCloseWindowMs(mode: SaleMode): number`

- [ ] **Step 1: Write the failing test**

`packages/core/src/timing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  softCloseWindowMs,
  TIMED_SOFT_CLOSE_MS,
  LIVE_SOFT_CLOSE_MS,
} from "./timing";

describe("softCloseWindowMs", () => {
  it("uses the 2-minute window for timed sales", () => {
    expect(softCloseWindowMs("timed")).toBe(TIMED_SOFT_CLOSE_MS);
    expect(TIMED_SOFT_CLOSE_MS).toBe(120000);
  });
  it("uses the short window for live sales", () => {
    expect(softCloseWindowMs("live")).toBe(LIVE_SOFT_CLOSE_MS);
    expect(LIVE_SOFT_CLOSE_MS).toBe(12000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./timing`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/timing.ts`:
```ts
export type SaleMode = "timed" | "live";

/** Soft-close (anti-snipe) windows by sale mode. */
export const TIMED_SOFT_CLOSE_MS = 120_000; // 2 minutes
export const LIVE_SOFT_CLOSE_MS = 12_000; // 12 seconds

export function softCloseWindowMs(mode: SaleMode): number {
  return mode === "live" ? LIVE_SOFT_CLOSE_MS : TIMED_SOFT_CLOSE_MS;
}
```

- [ ] **Step 4: Re-export and run**

Append to `packages/core/src/index.ts`:
```ts
export * from "./timing";
```
Run: `pnpm --filter @auction/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): add SaleMode and mode-aware soft-close window"
```

---

### Task 2: `@auction/core` — `advanceLiveSale` sequencer

**Files:**
- Create: `packages/core/src/live.ts`
- Create: `packages/core/src/live.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `interface LiveLot { id: string; lotNumber: number; status: string; closesAt: Date }`
  - `type LiveAdvanceAction = { kind: "open"; lotId: string } | { kind: "close"; lotId: string } | { kind: "finish" } | { kind: "wait" }`
  - `advanceLiveSale(saleStatus: string, startsAt: Date, lots: LiveLot[], now: Date): LiveAdvanceAction`

- [ ] **Step 1: Write the failing test**

`packages/core/src/live.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { advanceLiveSale, type LiveLot } from "./live";

const START = new Date("2026-07-01T10:00:00.000Z");
const NOW = new Date("2026-07-01T10:05:00.000Z"); // after start

function lot(
  id: string,
  lotNumber: number,
  status: string,
  closesAt: Date
): LiveLot {
  return { id, lotNumber, status, closesAt };
}

describe("advanceLiveSale", () => {
  it("waits when the sale is not live", () => {
    expect(advanceLiveSale("scheduled", START, [], NOW)).toEqual({ kind: "wait" });
  });

  it("waits when the start time has not arrived", () => {
    const future = new Date("2026-07-01T11:00:00.000Z");
    expect(advanceLiveSale("live", future, [], NOW)).toEqual({ kind: "wait" });
  });

  it("opens the lowest-numbered queued lot when none is active", () => {
    const lots = [
      lot("b", 2, "queued", NOW),
      lot("a", 1, "queued", NOW),
    ];
    expect(advanceLiveSale("live", START, lots, NOW)).toEqual({
      kind: "open",
      lotId: "a",
    });
  });

  it("waits while the active lot's timer has not expired", () => {
    const future = new Date("2026-07-01T10:06:00.000Z");
    const lots = [lot("a", 1, "live", future), lot("b", 2, "queued", NOW)];
    expect(advanceLiveSale("live", START, lots, NOW)).toEqual({ kind: "wait" });
  });

  it("closes the active lot when its timer has expired", () => {
    const past = new Date("2026-07-01T10:04:00.000Z");
    const lots = [lot("a", 1, "live", past), lot("b", 2, "queued", NOW)];
    expect(advanceLiveSale("live", START, lots, NOW)).toEqual({
      kind: "close",
      lotId: "a",
    });
  });

  it("finishes when no active and no queued lots remain", () => {
    const lots = [lot("a", 1, "sold", NOW), lot("b", 2, "unsold", NOW)];
    expect(advanceLiveSale("live", START, lots, NOW)).toEqual({ kind: "finish" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./live`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/live.ts`:
```ts
export interface LiveLot {
  id: string;
  lotNumber: number;
  status: string;
  closesAt: Date;
}

export type LiveAdvanceAction =
  | { kind: "open"; lotId: string }
  | { kind: "close"; lotId: string }
  | { kind: "finish" }
  | { kind: "wait" };

/** Decide the next action for a live sale, purely from its current state.
 *  Only meaningful for a started, live-status sale; otherwise waits. */
export function advanceLiveSale(
  saleStatus: string,
  startsAt: Date,
  lots: LiveLot[],
  now: Date
): LiveAdvanceAction {
  if (saleStatus !== "live" || now.getTime() < startsAt.getTime()) {
    return { kind: "wait" };
  }

  const active = lots.find((l) => l.status === "live");
  if (active) {
    return now.getTime() >= active.closesAt.getTime()
      ? { kind: "close", lotId: active.id }
      : { kind: "wait" };
  }

  const queued = lots
    .filter((l) => l.status === "queued")
    .sort((a, b) => a.lotNumber - b.lotNumber);
  return queued.length > 0
    ? { kind: "open", lotId: queued[0]!.id }
    : { kind: "finish" };
}
```

- [ ] **Step 4: Re-export and run**

Append to `packages/core/src/index.ts`:
```ts
export * from "./live";
```
Run: `pnpm --filter @auction/core test`
Expected: PASS — all six `advanceLiveSale` cases plus the timing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): add advanceLiveSale pure sequencer"
```

---

### Task 3: `@auction/db` — schema + records for live sales

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Generated: `packages/db/prisma/migrations/**` (via `prisma migrate dev`)
- Modify: `packages/db/src/types.ts` (`SaleRecord`, `NewSale`, `UpdateSale`, `LotStatus`)
- Modify: `packages/db/src/mappers.ts` (`saleRowToRecord`)
- Modify: `packages/db/src/repositories/sales.ts` (`createSale`/`updateSale` passthrough)
- Modify: `packages/db/src/repositories/sales.test.ts`, `lots.test.ts` (assert defaults / queued)

**Interfaces:**
- Consumes: `SaleMode` from `@auction/core` (Task 1).
- Produces:
  - `Sale.mode: SaleMode` (default `"timed"`), `Sale.liveLotSeconds: number` (default 45) on `SaleRecord`.
  - `LotStatus` union gains `"queued"`.
  - `NewSale`/`UpdateSale` accept optional `mode`/`liveLotSeconds`.

- [ ] **Step 1: Write the failing test**

Append to `packages/db/src/repositories/sales.test.ts`:
```ts
describe("live sale fields", () => {
  it("defaults a new sale to timed mode with liveLotSeconds 45", async () => {
    const sale = await createSale(db, sampleSale("Timed Sale"));
    expect(sale.mode).toBe("timed");
    expect(sale.liveLotSeconds).toBe(45);
  });

  it("creates a live-mode sale with a custom lot timer", async () => {
    const sale = await createSale(db, {
      ...sampleSale("Live Sale"),
      mode: "live",
      liveLotSeconds: 30,
    });
    expect(sale.mode).toBe("live");
    expect(sale.liveLotSeconds).toBe(30);
  });

  it("updates a sale's mode and timer", async () => {
    const sale = await createSale(db, sampleSale("To Convert"));
    const updated = await updateSale(db, sale.id, {
      mode: "live",
      liveLotSeconds: 60,
    });
    expect(updated.mode).toBe("live");
    expect(updated.liveLotSeconds).toBe(60);
  });
});
```

Append to `packages/db/src/repositories/lots.test.ts`:
```ts
describe("queued lot status", () => {
  it("accepts the queued status via updateLotStatus", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const updated = await updateLotStatus(db, lot.id, "queued");
    expect(updated.status).toBe("queued");
  });
});
```
(`updateLotStatus` already exists from Plan 2; this confirms the enum accepts `"queued"`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test`
Expected: FAIL — `mode`/`liveLotSeconds` missing; `"queued"` rejected by the enum.

- [ ] **Step 3: Edit the schema and migrate**

In `packages/db/prisma/schema.prisma`:
- Add the enum:
```prisma
enum SaleMode {
  timed
  live
}
```
- Add `queued` to `enum LotStatus` (as the first value):
```prisma
enum LotStatus {
  queued
  live
  sold
  unsold
  paid
  fulfilled
}
```
- Add two fields to `model Sale` (after `taxPct`):
```prisma
  mode             SaleMode       @default(timed)
  liveLotSeconds   Int            @default(45)
```
Then migrate (Docker Postgres up, `packages/db/.env` set):
```bash
cd packages/db
pnpm exec prisma migrate dev --name live_sale_fields
```
Expected: a migration adding the `SaleMode` enum, the `queued` enum value, and the two `Sale` columns; client regenerated. Commit the migration with this task.

- [ ] **Step 4: Extend types**

In `packages/db/src/types.ts`:
- Add the import (top): `import type { IncrementTable, SaleMode } from "@auction/core";` (merge with the existing `@auction/core` type import; the existing `import("@auction/core").IncrementTable` inline references in `UpdateSale` can stay or use the imported name).
- Add `"queued"` to the `LotStatus` union:
```ts
export type LotStatus = "queued" | "live" | "sold" | "unsold" | "paid" | "fulfilled";
```
- Add to `SaleRecord`:
```ts
  mode: SaleMode;
  liveLotSeconds: number;
```
- Add to `NewSale`:
```ts
  mode?: SaleMode;
  liveLotSeconds?: number;
```
- Add to `UpdateSale`:
```ts
  mode?: SaleMode;
  liveLotSeconds?: number;
```

- [ ] **Step 5: Map the new fields**

In `packages/db/src/mappers.ts`, extend `saleRowToRecord`'s parameter shape and return to carry the new fields:
```ts
export function saleRowToRecord(row: {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  buyersPremiumPct: number;
  taxPct: number;
  mode: SaleRecord["mode"];
  liveLotSeconds: number;
  incrementTable: unknown;
  status: SaleRecord["status"];
  createdAt: Date;
}): SaleRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    buyersPremiumPct: row.buyersPremiumPct,
    taxPct: row.taxPct,
    mode: row.mode,
    liveLotSeconds: row.liveLotSeconds,
    incrementTable: toIncrementTable(row.incrementTable),
    status: row.status,
    createdAt: row.createdAt,
  };
}
```

- [ ] **Step 6: Pass the fields through create/update**

In `packages/db/src/repositories/sales.ts`:
- In `createSale`'s `data`, add (after `taxPct`):
```ts
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.liveLotSeconds !== undefined ? { liveLotSeconds: input.liveLotSeconds } : {}),
```
- In `updateSale`'s `data`, add:
```ts
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.liveLotSeconds !== undefined ? { liveLotSeconds: input.liveLotSeconds } : {}),
```

- [ ] **Step 7: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS — new live-field + queued tests plus all prior db tests (existing sale tests still pass; defaults applied).

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): add Sale.mode/liveLotSeconds and queued lot status"
```

---

### Task 4: `@auction/db` — runner repo helpers

**Files:**
- Modify: `packages/db/src/repositories/lots.ts` (`openQueuedLot`)
- Modify: `packages/db/src/repositories/sales.ts` (`listRunningLiveSales`)
- Modify: `packages/db/src/repositories/lots.test.ts`, `sales.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `lotRowToRecord`/`saleRowToRecord`, `LotRecord`/`SaleRecord`.
- Produces:
  - `openQueuedLot(db: PrismaClient, id: string, closesAt: Date): Promise<LotRecord | null>` — guarded promote `queued → live`; returns the lot, or `null` if it wasn't queued (race lost).
  - `listRunningLiveSales(db: PrismaClient): Promise<SaleRecord[]>` — sales with `mode:"live"` AND `status:"live"`, ascending `startsAt`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/db/src/repositories/lots.test.ts`:
```ts
import { openQueuedLot } from "./lots";

describe("openQueuedLot", () => {
  it("promotes a queued lot to live with a new closesAt", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    await updateLotStatus(db, lot.id, "queued");

    const closesAt = new Date("2026-07-10T00:00:45.000Z");
    const opened = await openQueuedLot(db, lot.id, closesAt);
    expect(opened?.status).toBe("live");
    expect(opened?.closesAt.getTime()).toBe(closesAt.getTime());
  });

  it("returns null when the lot is not queued (already opened/closed)", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    // lot is "live" by default, not "queued"
    expect(await openQueuedLot(db, lot.id, new Date())).toBeNull();
  });
});
```

Append to `packages/db/src/repositories/sales.test.ts`:
```ts
import { listRunningLiveSales } from "./sales";

describe("listRunningLiveSales", () => {
  it("returns only live-mode sales with live status", async () => {
    await createSale(db, sampleSale("Timed Live")); // timed, draft
    const liveDraft = await createSale(db, {
      ...sampleSale("Live Draft"),
      mode: "live",
    });
    const running = await createSale(db, {
      ...sampleSale("Live Running"),
      mode: "live",
    });
    await updateSaleStatus(db, running.id, "live");
    // liveDraft stays draft; should be excluded
    void liveDraft;

    const list = await listRunningLiveSales(db);
    expect(list.map((s) => s.id)).toEqual([running.id]);
  });
});
```
(`updateSaleStatus` exists from Plan 7.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @auction/db test`
Expected: FAIL — `openQueuedLot`/`listRunningLiveSales` not exported.

- [ ] **Step 3: Implement `openQueuedLot`**

Append to `packages/db/src/repositories/lots.ts`:
```ts
export async function openQueuedLot(
  db: PrismaClient,
  id: string,
  closesAt: Date
): Promise<LotRecord | null> {
  const claim = await db.lot.updateMany({
    where: { id, status: "queued" },
    data: { status: "live", closesAt },
  });
  if (claim.count === 0) return null;
  const row = await db.lot.findUnique({ where: { id } });
  return row ? lotRowToRecord(row) : null;
}
```

- [ ] **Step 4: Implement `listRunningLiveSales`**

Append to `packages/db/src/repositories/sales.ts`:
```ts
export async function listRunningLiveSales(
  db: PrismaClient
): Promise<SaleRecord[]> {
  const rows = await db.sale.findMany({
    where: { mode: "live", status: "live" },
    orderBy: { startsAt: "asc" },
  });
  return rows.map(saleRowToRecord);
}
```

- [ ] **Step 5: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): add openQueuedLot and listRunningLiveSales for the runner"
```

---

### Task 5: `apps/web` — mode-aware soft-close in `placeBid`

**Files:**
- Modify: `apps/web/src/app/lots/[id]/actions.ts` (`placeBid`)

**Interfaces:**
- Consumes: `softCloseWindowMs` (`@auction/core`, Task 1); `sale.mode` (Task 3).
- Produces: `placeBid` now extends the close by the sale-mode-appropriate window.

- [ ] **Step 1: Make the soft-close window mode-aware**

In `apps/web/src/app/lots/[id]/actions.ts`:
- Update the imports: add `softCloseWindowMs` from `@auction/core` (merge with the existing `@auction/core` import), and remove the `SOFT_CLOSE_WINDOW_MS` import from `@/lib/realtime`:
```ts
import { resolveBids, nextBidFloor, applySoftClose, softCloseWindowMs } from "@auction/core";
import { broadcastLotPrice } from "@/lib/realtime";
```
- In `placeBid`, where it calls `applySoftClose(...)`, replace the constant window with the mode-aware one (the `sale` record is already loaded earlier in the function):
```ts
  const extended = applySoftClose(
    lot.closesAt.getTime(),
    now.getTime(),
    softCloseWindowMs(sale.mode)
  );
```

- [ ] **Step 2: Remove the now-unused realtime constant**

In `apps/web/src/lib/realtime.ts`, delete the `SOFT_CLOSE_MS` constant and the `export const SOFT_CLOSE_WINDOW_MS = SOFT_CLOSE_MS;` line (they are no longer referenced — `placeBid` now uses `softCloseWindowMs` from core). Leave `broadcastLotPrice` and `LotPricePayload` intact.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds (no remaining reference to `SOFT_CLOSE_WINDOW_MS`); the 25 web tests still pass. (Timed sales get the 2-min window as before; live sales get 12s.)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/lots/[id]/actions.ts" apps/web/src/lib/realtime.ts
git commit -m "feat(web): mode-aware soft-close window in placeBid"
```

---

## Self-Review

**Spec coverage (against the Phase 2 design doc §2, §3, §4, §9.1):**
- §2 data model — `Sale.mode` (default timed), `Sale.liveLotSeconds` (default 45), `queued` `LotStatus` → Task 3. `LIVE_SOFT_CLOSE_MS` constant → Task 1.
- §4 mode-aware soft-close → Task 1 (`softCloseWindowMs`) + Task 5 (`placeBid` uses it).
- §3 the pure `advanceLiveSale` decision function → Task 2 (all states tested). DB helpers the runner needs (`openQueuedLot` guarded, `listRunningLiveSales`) → Task 4.
- Timed sales unchanged: `mode` defaults `timed`, `softCloseWindowMs("timed")` = the prior 2-min window, the close-lots cron is untouched.
- Out of scope here (later Phase 2 plans): the live-runner service (Plan 2), `/live` UI (Plan 3), admin live controls (Plan 4). Noted, not gaps.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step has complete code; the only generated artifact is the Prisma migration (deterministic from the schema edit).

**Type consistency:** `SaleMode` defined once in core (Task 1) and consumed by db types (Task 3) and `placeBid` (Task 5). `advanceLiveSale`/`LiveLot`/`LiveAdvanceAction` defined once (Task 2). `openQueuedLot`/`listRunningLiveSales` signatures (Task 4) match what Plan 2 (the runner) will consume. `LotStatus` gains `"queued"` consistently in the Prisma enum (Task 3 schema) and the TS union (Task 3 types). `placeBid` uses `softCloseWindowMs(sale.mode)` — `sale.mode` exists on `SaleRecord` after Task 3.

---

## Next Plans (Phase 2 continuation)

2. **Live-runner service** — `services/live-runner` (loop over `listRunningLiveSales` → `advanceLiveSale` → `openQueuedLot`/`closeLot`/`updateSaleStatus` + sale-channel broadcast) + docker-compose wiring.
3. **Live bidder UI** — `/live/[saleId]` + sale-channel auto-advance, built on `LotLive`.
4. **Admin live controls** — sale `mode`/`liveLotSeconds` in the admin form + `queued` lot creation for live sales.
