# Phase 1 — Plan 5: Bidding Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lots biddable end-to-end — place a proxy (max) bid (gated on an approved registration), show the live current price + countdown via Supabase Realtime Broadcast, and close due lots concurrency-safely into settled invoices.

**Architecture:** The `@auction/core` engine (resolveBids/settleLot/applySoftClose/computeInvoice) and `@auction/db` repositories built in Plans 1–2 are wired into: (1) a race-safe **close engine** in `@auction/db` (`closeLot`/`closeDueLots`) that claims a lot atomically and writes settlement + invoice + ledger in one transaction; (2) a Next.js **`placeBid`** server action that validates against the engine, appends to the append-only Bid ledger, applies soft-close, and **broadcasts** a price update; (3) a **live lot UI** that subscribes to a per-lot Supabase Broadcast channel and ticks a countdown; (4) a secret-protected **cron route** that runs the close engine (Vercel Cron in prod; documented worker/curl for Docker). Domain data stays in the standalone Postgres; Supabase provides only Auth + the Broadcast transport.

**Tech Stack:** `@auction/core`, `@auction/db` (Prisma/Postgres), Next.js 15 server actions + route handlers, Supabase Realtime Broadcast (REST `/realtime/v1/api/broadcast` to send, browser channel to receive), Vitest.

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **Bidding is gated:** a bid is accepted only if the user is authenticated AND has an `approved` `Registration` for the lot's sale AND the lot is `live` AND `now < lot.closesAt`. The acting user id always comes from the session (`requireUser`), never client input.
- **Bid validity:** a bid's `maxAmount` must be `>= nextBidFloor(startingPrice, events, incrementTable)` (the engine's minimum acceptable next bid). Money stays integer rupiah; all amounts flow through the existing `@auction/core`/`@auction/db` money discipline (BigInt at the DB boundary).
- **The Bid table is append-only.** Placing a bid only inserts. The authoritative winner/price is (re)computed by the engine; the close engine is the single authority for final settlement.
- **Soft-close window = 2 minutes** (`applySoftClose`). A bid inside the final window extends `lot.closesAt`.
- **Close is concurrency-safe & atomic:** `closeLot` claims the lot via a conditional `updateMany(where status:"live")` and writes the status flip + invoice + ledger in ONE `$transaction`; a losing concurrent runner makes no changes. Closing is idempotent (a non-live lot is skipped, no duplicate invoice).
- **Realtime:** live price updates use **Supabase Broadcast** on a public channel named `lot:{lotId}`, event `price`. The server sends via the REST broadcast endpoint with the service-role `apikey` (server-only); clients subscribe with the browser Supabase client.
- **Cron auth:** the close-lots route requires `Authorization: Bearer ${CRON_SECRET}`.
- **TDD** for the engine additions (`nextBidFloor`) and the DB close engine. The realtime/UI/cron edges are verified by build + manual run.
- Suites must stay green: `@auction/core` (25→ grows), `@auction/db` (38→ grows), `@auction/web` (14).

---

### Task 1: `nextBidFloor` engine helper (`@auction/core`)

**Files:**
- Modify: `packages/core/src/auction.ts` (add `nextBidFloor`)
- Modify: `packages/core/src/auction.test.ts` (add tests)

**Interfaces:**
- Consumes: `resolveBids` (same file), `minNextBid` (`./increments`), `BidEvent`/`IncrementTable`/`Money` (`./types`).
- Produces: `nextBidFloor(startingPrice: Money, events: BidEvent[], table: IncrementTable): Money` — the minimum acceptable `maxAmount` for the next bid.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/auction.test.ts`:
```ts
import { nextBidFloor } from "./auction";

describe("nextBidFloor", () => {
  it("is the starting price when there are no bids", () => {
    expect(nextBidFloor(1_000_000, [], table)).toBe(1_000_000);
  });

  it("is current price + one increment for a lone bidder (price sits at start)", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
    ];
    // lone bidder: resolved price = 1,000,000; increment there = 50,000
    expect(nextBidFloor(1_000_000, events, table)).toBe(1_050_000);
  });

  it("is current price + one increment when contested", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    // resolved price = 3,100,000; increment there (<5,000,000) = 100,000
    expect(nextBidFloor(1_000_000, events, table)).toBe(3_200_000);
  });
});
```
(The file already defines `table` = `[{upTo:1_000_000,step:50_000},{upTo:5_000_000,step:100_000},{upTo:null,step:250_000}]`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — `nextBidFloor` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `packages/core/src/auction.ts`:
```ts
import { minNextBid } from "./increments";

/** The minimum acceptable `maxAmount` for the next bid on a lot. */
export function nextBidFloor(
  startingPrice: Money,
  events: BidEvent[],
  table: IncrementTable
): Money {
  const { winnerId, currentPrice } = resolveBids(startingPrice, events, table);
  return winnerId === null ? startingPrice : minNextBid(currentPrice, table);
}
```
(Note: `auction.ts` already imports `minIncrement` from `./increments`; add `minNextBid` to that import or add the line above — ensure a single import from `./increments`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @auction/core test`
Expected: PASS — all core tests including the 3 new `nextBidFloor` cases.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): add nextBidFloor (minimum acceptable next bid)"
```

---

### Task 2: Close engine + lot-close extension (`@auction/db`)

**Files:**
- Modify: `packages/db/src/repositories/lots.ts` (add `updateLotClosesAt`)
- Create: `packages/db/src/repositories/close.ts` (`closeLot`, `closeDueLots`, `CloseResult`)
- Create: `packages/db/src/repositories/close.test.ts`
- Modify: `packages/db/src/repositories/lots.test.ts` (test `updateLotClosesAt`)
- Modify: `packages/db/src/index.ts` (export close)

**Interfaces:**
- Consumes: `settleLot`, `computeInvoice` (`@auction/core`); `getLot`, `getSale`, `getBidEventsForLot`, `getLotsDueToClose`, `lotRowToRecord`, `toDbMoney` (Plan 2).
- Produces:
  - `updateLotClosesAt(db: PrismaClient, id: string, closesAt: Date): Promise<LotRecord>`
  - `interface CloseResult { lotId: string; outcome: "sold" | "unsold" | "skipped"; winnerId: string | null; hammerPrice: number }`
  - `closeLot(db: PrismaClient, lotId: string, now: Date): Promise<CloseResult>`
  - `closeDueLots(db: PrismaClient, now: Date): Promise<CloseResult[]>`

- [ ] **Step 1: Write the failing test for `updateLotClosesAt`**

Append to `packages/db/src/repositories/lots.test.ts`:
```ts
import { updateLotClosesAt } from "./lots";

describe("updateLotClosesAt", () => {
  it("extends a lot's close time", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const newClose = new Date("2026-07-08T00:02:00.000Z");
    const updated = await updateLotClosesAt(db, lot.id, newClose);
    expect(updated.closesAt.getTime()).toBe(newClose.getTime());
  });
});
```
(The file already defines `makeSale()` and `sampleLot(saleId, lotNumber, closesAt)`.)

- [ ] **Step 2: Implement `updateLotClosesAt` and run**

Append to `packages/db/src/repositories/lots.ts`:
```ts
export async function updateLotClosesAt(
  db: PrismaClient,
  id: string,
  closesAt: Date
): Promise<LotRecord> {
  const row = await db.lot.update({ where: { id }, data: { closesAt } });
  return lotRowToRecord(row);
}
```
Run: `pnpm --filter @auction/db test src/repositories/lots.test.ts`
Expected: PASS (the new test plus existing lot tests).

- [ ] **Step 3: Write the failing test for the close engine**

`packages/db/src/repositories/close.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale } from "./sales";
import { createLot, getLot } from "./lots";
import { createUser } from "./users";
import { appendBid } from "./bids";
import { getInvoice, getLedgerEntriesForInvoice } from "./invoices";
import { closeLot, closeDueLots } from "./close";

const db = testDb();
const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];
const PAST = new Date("2026-07-01T00:00:00.000Z");
const FUTURE = new Date("2026-12-01T00:00:00.000Z");
const NOW = new Date("2026-07-10T00:00:00.000Z");

async function makeSale() {
  return createSale(db, {
    title: "Sale",
    startsAt: PAST,
    endsAt: NOW,
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });
}

beforeEach(async () => {
  await resetDb(db);
});

describe("closeLot", () => {
  it("settles a contested lot: sold, invoice + ledger written, status sold", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      saleId: sale.id,
      lotNumber: 1,
      title: "Lot 1",
      estimateLow: 1_000_000,
      estimateHigh: 2_000_000,
      startingPrice: 1_000_000,
      reserve: null,
      closesAt: PAST,
    });
    const a = await createUser(db, { email: "a@example.com" });
    const b = await createUser(db, { email: "b@example.com" });
    await appendBid(db, { lotId: lot.id, bidderId: a.id, maxAmount: 5_000_000, amount: 1_000_000 });
    await appendBid(db, { lotId: lot.id, bidderId: b.id, maxAmount: 3_000_000, amount: 1_100_000 });

    const result = await closeLot(db, lot.id, NOW);
    expect(result.outcome).toBe("sold");
    expect(result.winnerId).toBe(a.id);
    expect(result.hammerPrice).toBe(3_100_000);

    expect((await getLot(db, lot.id))?.status).toBe("sold");
    const invoice = await getInvoice(db, lot.id);
    expect(invoice?.total).toBe(3_788_200); // 3.1M + 20% + 11% PPN on premium
    expect(await getLedgerEntriesForInvoice(db, invoice!.id)).toHaveLength(3);
  });

  it("marks a lot unsold when the reserve is not met (no invoice)", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      saleId: sale.id,
      lotNumber: 1,
      title: "Lot 1",
      estimateLow: 1_000_000,
      estimateHigh: 2_000_000,
      startingPrice: 1_000_000,
      reserve: 5_000_000,
      closesAt: PAST,
    });
    const a = await createUser(db, { email: "a@example.com" });
    await appendBid(db, { lotId: lot.id, bidderId: a.id, maxAmount: 2_000_000, amount: 1_000_000 });

    const result = await closeLot(db, lot.id, NOW);
    expect(result.outcome).toBe("unsold");
    expect((await getLot(db, lot.id))?.status).toBe("unsold");
    expect(await getInvoice(db, lot.id)).toBeNull();
  });

  it("skips a lot that is not yet due", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      saleId: sale.id,
      lotNumber: 1,
      title: "Lot 1",
      estimateLow: 1_000_000,
      estimateHigh: 2_000_000,
      startingPrice: 1_000_000,
      reserve: null,
      closesAt: FUTURE,
    });
    const result = await closeLot(db, lot.id, NOW);
    expect(result.outcome).toBe("skipped");
    expect((await getLot(db, lot.id))?.status).toBe("live");
  });

  it("is idempotent: closing an already-closed lot skips with no duplicate invoice", async () => {
    const sale = await makeSale();
    const lot = await createLot(db, {
      saleId: sale.id,
      lotNumber: 1,
      title: "Lot 1",
      estimateLow: 1_000_000,
      estimateHigh: 2_000_000,
      startingPrice: 1_000_000,
      reserve: null,
      closesAt: PAST,
    });
    const a = await createUser(db, { email: "a@example.com" });
    await appendBid(db, { lotId: lot.id, bidderId: a.id, maxAmount: 2_000_000, amount: 1_000_000 });

    const first = await closeLot(db, lot.id, NOW);
    expect(first.outcome).toBe("sold");
    const second = await closeLot(db, lot.id, NOW);
    expect(second.outcome).toBe("skipped");
    expect(await db.invoice.count({ where: { lotId: lot.id } })).toBe(1);
  });
});

describe("closeDueLots", () => {
  it("closes all due live lots and leaves future ones live", async () => {
    const sale = await makeSale();
    const due = await createLot(db, {
      saleId: sale.id, lotNumber: 1, title: "Due",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: null, closesAt: PAST,
    });
    const later = await createLot(db, {
      saleId: sale.id, lotNumber: 2, title: "Later",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: null, closesAt: FUTURE,
    });
    const a = await createUser(db, { email: "a@example.com" });
    await appendBid(db, { lotId: due.id, bidderId: a.id, maxAmount: 2_000_000, amount: 1_000_000 });

    const results = await closeDueLots(db, NOW);
    expect(results).toHaveLength(1);
    expect(results[0]?.lotId).toBe(due.id);
    expect((await getLot(db, due.id))?.status).toBe("sold");
    expect((await getLot(db, later.id))?.status).toBe("live");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/close.test.ts`
Expected: FAIL — cannot resolve `./close`.

- [ ] **Step 5: Write the close engine**

`packages/db/src/repositories/close.ts`:
```ts
import { computeInvoice, settleLot } from "@auction/core";
import type { PrismaClient } from "@prisma/client";
import { toDbMoney } from "../mappers";
import { getLotsDueToClose, getLot } from "./lots";
import { getSale } from "./sales";
import { getBidEventsForLot } from "./bids";

export interface CloseResult {
  lotId: string;
  outcome: "sold" | "unsold" | "skipped";
  winnerId: string | null;
  hammerPrice: number;
}

const SKIPPED = (lotId: string): CloseResult => ({
  lotId,
  outcome: "skipped",
  winnerId: null,
  hammerPrice: 0,
});

/** Close one lot: settle from the bid ledger, then atomically claim the lot
 *  (conditional update on status="live") and write the invoice + ledger in a
 *  single transaction. A concurrent runner that loses the claim makes no
 *  changes. Idempotent: a non-live or not-yet-due lot is skipped. */
export async function closeLot(
  db: PrismaClient,
  lotId: string,
  now: Date
): Promise<CloseResult> {
  const lot = await getLot(db, lotId);
  if (!lot || lot.status !== "live" || lot.closesAt > now) return SKIPPED(lotId);

  const sale = await getSale(db, lot.saleId);
  if (!sale) return SKIPPED(lotId);

  const events = await getBidEventsForLot(db, lotId);
  const settlement = settleLot(
    lot.startingPrice,
    events,
    sale.incrementTable,
    lot.reserve
  );
  const invoice =
    settlement.outcome === "sold"
      ? computeInvoice({
          hammer: settlement.hammerPrice,
          premiumPct: sale.buyersPremiumPct,
          taxPct: sale.taxPct,
        })
      : null;

  return db.$transaction(async (tx) => {
    // Atomic claim: only the runner that flips status from "live" proceeds.
    const claim = await tx.lot.updateMany({
      where: { id: lotId, status: "live" },
      data: { status: settlement.outcome },
    });
    if (claim.count === 0) return SKIPPED(lotId);

    if (settlement.outcome === "sold" && invoice && settlement.winnerId) {
      const created = await tx.invoice.create({
        data: {
          lotId,
          buyerId: settlement.winnerId,
          hammer: toDbMoney(invoice.hammer),
          premium: toDbMoney(invoice.premium),
          tax: toDbMoney(invoice.tax),
          total: toDbMoney(invoice.total),
        },
      });
      await tx.ledgerEntry.createMany({
        data: invoice.entries.map((e) => ({
          invoiceId: created.id,
          lotId,
          party: e.party,
          kind: e.kind,
          amount: toDbMoney(e.amount),
        })),
      });
    }

    return {
      lotId,
      outcome: settlement.outcome,
      winnerId: settlement.winnerId,
      hammerPrice: settlement.outcome === "sold" ? settlement.hammerPrice : 0,
    };
  });
}

/** Close every live lot whose closesAt has passed. */
export async function closeDueLots(
  db: PrismaClient,
  now: Date
): Promise<CloseResult[]> {
  const due = await getLotsDueToClose(db, now);
  const results: CloseResult[] = [];
  for (const lot of due) {
    results.push(await closeLot(db, lot.id, now));
  }
  return results;
}
```

- [ ] **Step 6: Export and run the full db suite**

Append to `packages/db/src/index.ts`:
```ts
export * from "./repositories/close";
```
Run: `pnpm --filter @auction/db test`
Expected: PASS — close engine + updateLotClosesAt + all prior db tests.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): race-safe close engine and lot-close extension"
```

---

### Task 3: Broadcast helper + `placeBid` server action (`apps/web`)

**Files:**
- Create: `apps/web/src/lib/realtime.ts`
- Create: `apps/web/src/app/lots/[id]/actions.ts`

**Interfaces:**
- Consumes: `requireUser` (Plan 4); `prisma`, `getLot`, `getSale`, `getRegistration`, `getBidEventsForLot`, `appendBid`, `updateLotClosesAt` (`@/lib/db`); `resolveBids`, `nextBidFloor`, `applySoftClose` (`@auction/core`).
- Produces:
  - `broadcastLotPrice(lotId: string, payload: { currentPrice: number; closesAt: string; bidCount: number; status?: string }): Promise<void>`
  - `placeBid(lotId: string, maxAmount: number): Promise<{ ok: boolean; error?: string; currentPrice?: number; closesAt?: string }>`

- [ ] **Step 1: Write the broadcast helper**

`apps/web/src/lib/realtime.ts`:
```ts
import "server-only";

const SOFT_CLOSE_MS = 2 * 60_000;
export const SOFT_CLOSE_WINDOW_MS = SOFT_CLOSE_MS;

export interface LotPricePayload {
  currentPrice: number;
  closesAt: string;
  bidCount: number;
  status?: string;
}

/** Push a price update to subscribers of the public `lot:{id}` channel via the
 *  Supabase Realtime REST broadcast endpoint. Fire-and-forget; never throws
 *  into the caller (a failed broadcast must not fail a committed bid). */
export async function broadcastLotPrice(
  lotId: string,
  payload: LotPricePayload
): Promise<void> {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        body: JSON.stringify({
          messages: [{ topic: `lot:${lotId}`, event: "price", payload }],
        }),
      }
    );
  } catch {
    // Realtime is best-effort; clients also see the fresh price on next load.
  }
}
```

- [ ] **Step 2: Write the `placeBid` server action**

`apps/web/src/app/lots/[id]/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { resolveBids, nextBidFloor, applySoftClose } from "@auction/core";
import {
  prisma,
  getLot,
  getSale,
  getRegistration,
  getBidEventsForLot,
  appendBid,
  updateLotClosesAt,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { broadcastLotPrice, SOFT_CLOSE_WINDOW_MS } from "@/lib/realtime";

export async function placeBid(
  lotId: string,
  maxAmount: number
): Promise<{ ok: boolean; error?: string; currentPrice?: number; closesAt?: string }> {
  const user = await requireUser();

  if (!Number.isInteger(maxAmount) || maxAmount <= 0) {
    return { ok: false, error: "Enter a valid bid amount." };
  }

  const lot = await getLot(prisma, lotId);
  if (!lot) return { ok: false, error: "Lot not found." };
  if (lot.status !== "live") return { ok: false, error: "Bidding is closed for this lot." };

  const now = new Date();
  if (lot.closesAt <= now) return { ok: false, error: "Bidding has ended for this lot." };

  const registration = await getRegistration(prisma, user.id, lot.saleId);
  if (!registration || registration.kycStatus !== "approved") {
    return { ok: false, error: "You must be approved to bid in this sale." };
  }

  const sale = await getSale(prisma, lot.saleId);
  if (!sale) return { ok: false, error: "Sale not found." };

  const events = await getBidEventsForLot(prisma, lotId);
  const floor = nextBidFloor(lot.startingPrice, events, sale.incrementTable);
  if (maxAmount < floor) {
    return { ok: false, error: `Your maximum must be at least ${floor}.` };
  }

  // Resolved price after including this bid (stored as the bid's revealed amount).
  const resolution = resolveBids(
    lot.startingPrice,
    [...events, { bidderId: user.id, maxAmount, createdAt: now.getTime() }],
    sale.incrementTable
  );

  await appendBid(prisma, {
    lotId,
    bidderId: user.id,
    maxAmount,
    amount: resolution.currentPrice,
  });

  // Soft-close: a late bid extends the close.
  const extended = applySoftClose(
    lot.closesAt.getTime(),
    now.getTime(),
    SOFT_CLOSE_WINDOW_MS
  );
  let closesAt = lot.closesAt;
  if (extended !== lot.closesAt.getTime()) {
    closesAt = new Date(extended);
    await updateLotClosesAt(prisma, lotId, closesAt);
  }

  await broadcastLotPrice(lotId, {
    currentPrice: resolution.currentPrice,
    closesAt: closesAt.toISOString(),
    bidCount: events.length + 1,
  });

  revalidatePath(`/lots/${lotId}`);
  return {
    ok: true,
    currentPrice: resolution.currentPrice,
    closesAt: closesAt.toISOString(),
  };
}
```

- [ ] **Step 3: Verify build and tests**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; the 14 existing web tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/realtime.ts "apps/web/src/app/lots/[id]/actions.ts"
git commit -m "feat(web): placeBid server action with engine validation and broadcast"
```

---

### Task 4: Live lot UI (countdown + bid box + Realtime subscription)

**Files:**
- Create: `apps/web/src/app/lots/[id]/lot-live.tsx` (client)
- Modify: `apps/web/src/app/lots/[id]/page.tsx` (compute initial state, render `<LotLive />`)

**Interfaces:**
- Consumes: `placeBid` (Task 3); `createBrowserSupabaseClient` (Plan 4); `formatRupiah`, `Button` (Plan 3); on the server page: `prisma`, `getLot`, `getSale`, `getBidEventsForLot`, `getRegistration` (`@/lib/db`), `resolveBids`, `nextBidFloor` (`@auction/core`), `getCurrentUser` (`@/lib/auth`).
- Produces: `LotLive` client component receiving the initial bid state + a `canBid` flag.

**Note (visual craft):** Use the frontend-design skill to make the bidding panel feel like a refined sale room — prominent current bid, a calm countdown, a clear max-bid input — in the paper-and-ink language, tokens-only.

- [ ] **Step 1: Write the live client component**

`apps/web/src/app/lots/[id]/lot-live.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { placeBid } from "./actions";

type BidGate =
  | { kind: "open"; floor: number }
  | { kind: "signin" }
  | { kind: "register"; saleId: string }
  | { kind: "closed" };

function useCountdown(target: number): string {
  const [remaining, setRemaining] = useState(() => target - Date.now());
  useEffect(() => {
    const t = setInterval(() => setRemaining(target - Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (remaining <= 0) return "Bidding ended";
  const s = Math.floor(remaining / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

export function LotLive({
  lotId,
  initialPrice,
  initialClosesAt,
  gate,
}: {
  lotId: string;
  initialPrice: number;
  initialClosesAt: string;
  gate: BidGate;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(initialPrice);
  const [closesAt, setClosesAt] = useState(initialClosesAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Subscribe to the public lot channel for live price updates.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`lot:${lotId}`)
      .on("broadcast", { event: "price" }, ({ payload }) => {
        if (typeof payload?.currentPrice === "number") setPrice(payload.currentPrice);
        if (typeof payload?.closesAt === "string") setClosesAt(payload.closesAt);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [lotId]);

  const countdown = useCountdown(new Date(closesAt).getTime());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const raw = inputRef.current?.value ?? "";
    const maxAmount = Number(raw);
    setPending(true);
    try {
      const result = await placeBid(lotId, maxAmount);
      if (!result.ok) {
        setError(result.error ?? "Could not place bid.");
        return;
      }
      if (typeof result.currentPrice === "number") setPrice(result.currentPrice);
      if (result.closesAt) setClosesAt(result.closesAt);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border border-line p-6">
      <p className="font-sans text-xs uppercase tracking-[0.15em] text-muted">
        Current bid
      </p>
      <p className="tnum mt-1 text-3xl">{formatRupiah(price)}</p>
      <p className="tnum mt-3 text-sm text-muted">{countdown}</p>

      <div className="mt-6">
        {gate.kind === "open" ? (
          <form onSubmit={onSubmit} className="space-y-3">
            <label htmlFor="maxAmount" className="block text-xs uppercase tracking-[0.15em] text-muted">
              Your maximum bid (min {formatRupiah(gate.floor)})
            </label>
            <input
              ref={inputRef}
              id="maxAmount"
              name="maxAmount"
              type="number"
              min={gate.floor}
              step={1}
              required
              className="tnum w-full border border-line bg-paper px-3 py-2 focus:border-ink focus:outline-none"
            />
            {error ? <p className="text-sm text-accent">{error}</p> : null}
            <Button type="submit" variant="accent" disabled={pending} className="w-full">
              Place bid
            </Button>
          </form>
        ) : gate.kind === "signin" ? (
          <a href="/sign-in" className="text-sm text-ink underline">
            Sign in to bid
          </a>
        ) : gate.kind === "register" ? (
          <a href={`/sales/${gate.saleId}`} className="text-sm text-ink underline">
            Register to bid in this sale
          </a>
        ) : (
          <p className="text-sm text-muted">Bidding has ended.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Compute initial state and render on the lot page**

Modify `apps/web/src/app/lots/[id]/page.tsx`. Add imports at the top (alongside existing ones):
```tsx
import { getSale, getBidEventsForLot, getRegistration } from "@/lib/db";
import { resolveBids, nextBidFloor } from "@auction/core";
import { getCurrentUser } from "@/lib/auth";
import { LotLive } from "./lot-live";
```
After `const lot = await getLot(prisma, id); if (!lot) notFound();`, compute the bidding state:
```tsx
  const sale = await getSale(prisma, lot.saleId);
  const events = await getBidEventsForLot(prisma, lot.id);
  const currentPrice = sale
    ? resolveBids(lot.startingPrice, events, sale.incrementTable).currentPrice
    : lot.startingPrice;
  const floor = sale
    ? nextBidFloor(lot.startingPrice, events, sale.incrementTable)
    : lot.startingPrice;

  const now = new Date();
  const user = await getCurrentUser();
  let gate:
    | { kind: "open"; floor: number }
    | { kind: "signin" }
    | { kind: "register"; saleId: string }
    | { kind: "closed" };
  if (lot.status !== "live" || lot.closesAt <= now) {
    gate = { kind: "closed" };
  } else if (!user) {
    gate = { kind: "signin" };
  } else {
    const reg = await getRegistration(prisma, user.id, lot.saleId);
    gate =
      reg && reg.kycStatus === "approved"
        ? { kind: "open", floor }
        : { kind: "register", saleId: lot.saleId };
  }
```
Then REPLACE the existing "Register to bid" CTA block (the `<div className="mt-10">…disabled CTA…</div>`) with:
```tsx
        <div className="mt-10">
          <LotLive
            lotId={lot.id}
            initialPrice={currentPrice}
            initialClosesAt={lot.closesAt.toISOString()}
            gate={gate}
          />
        </div>
```
Keep everything else (image hero, lot number, title, estimate, starting bid, description) unchanged. The page is already `export const dynamic = "force-dynamic"`.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; 14 web tests still pass. Manual (local Supabase + seeded DB, two browser sessions, one approved bidder): open a lot, place a bid → the current bid updates and (in the other session subscribed to the lot) the price updates live; a bid in the final 2 minutes extends the countdown.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/lots/[id]"
git commit -m "feat(web): live bidding UI with countdown and realtime price"
```

---

### Task 5: Close-lots cron route + scheduling

**Files:**
- Create: `apps/web/src/app/api/cron/close-lots/route.ts`
- Create: `vercel.json` (repo root)
- Modify: `apps/web/.env.local.example` (add `CRON_SECRET`)
- Modify: `apps/web/.env.local` (set a local `CRON_SECRET`)
- Create: `docs/operations/close-lots-cron.md`

**Interfaces:**
- Consumes: `prisma`, `closeDueLots` (`@/lib/db`); `broadcastLotPrice` (Task 3).
- Produces: a `GET /api/cron/close-lots` route gated by `Authorization: Bearer ${CRON_SECRET}`.

- [ ] **Step 1: Write the cron route**

`apps/web/src/app/api/cron/close-lots/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { prisma, closeDueLots } from "@/lib/db";
import { broadcastLotPrice } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await closeDueLots(prisma, new Date());

  // Notify live viewers that closed lots have ended.
  await Promise.all(
    results
      .filter((r) => r.outcome !== "skipped")
      .map((r) =>
        broadcastLotPrice(r.lotId, {
          currentPrice: r.hammerPrice,
          closesAt: new Date().toISOString(),
          bidCount: 0,
          status: r.outcome,
        })
      )
  );

  return NextResponse.json({
    closed: results.filter((r) => r.outcome !== "skipped").length,
    results,
  });
}
```

- [ ] **Step 2: Add the Vercel cron schedule and env**

`vercel.json` (repo root):
```json
{
  "crons": [{ "path": "/api/cron/close-lots", "schedule": "* * * * *" }]
}
```
(Vercel automatically sends `Authorization: Bearer $CRON_SECRET` to cron routes when `CRON_SECRET` is set in the project env.)

Append to `apps/web/.env.local.example`:
```
# Secret guarding the close-lots cron route (Vercel Cron sends it as a Bearer token).
CRON_SECRET="choose-a-long-random-string"
```
Set a real value in `apps/web/.env.local`, e.g.:
```
CRON_SECRET="local-dev-cron-secret-please-change"
```

- [ ] **Step 3: Document operating the job**

`docs/operations/close-lots-cron.md`:
```markdown
# Close-lots job

Closes timed lots whose `closesAt` has passed: settles each from the bid ledger,
writes the invoice + ledger, and flips the lot status. Idempotent and
concurrency-safe.

## Endpoint
`GET /api/cron/close-lots` — requires `Authorization: Bearer $CRON_SECRET`.

## Production (Vercel)
`vercel.json` schedules it every minute. Set `CRON_SECRET` in the Vercel project
environment; Vercel sends it automatically as the Bearer token.

## Local / Docker
Run it on a schedule by hitting the endpoint, e.g. every minute:

    while true; do
      curl -s -H "Authorization: Bearer $CRON_SECRET" \
        http://localhost:3000/api/cron/close-lots ;
      sleep 60 ;
    done

In a Docker Compose deployment, run an equivalent small cron/worker container
that curls the endpoint on the same schedule.

## Manual trigger
    curl -s -H "Authorization: Bearer $CRON_SECRET" \
      http://localhost:3000/api/cron/close-lots | jq
```

- [ ] **Step 4: Build and verify the gate**

```bash
pnpm --filter @auction/web build
```
Expected: build succeeds. Manual (app running locally with a seeded, past-closesAt lot — set one via psql `UPDATE "Lot" SET "closesAt" = now() - interval '1 minute' WHERE ...`):
- `curl -i http://localhost:3000/api/cron/close-lots` → `401` (no secret).
- `curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/close-lots` → `200` with a JSON summary; the due lot is now sold/unsold and (if sold) has an invoice.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api" vercel.json apps/web/.env.local.example docs/operations
git commit -m "feat(web): secret-protected close-lots cron route and scheduling"
```

---

## Self-Review

**Spec coverage (against the Phase 1 design doc §2, §4):**
- §4 bidding ruleset — proxy/max bidding (placeBid + resolveBids), increment-table minimum (nextBidFloor), soft-close 2-min (applySoftClose + updateLotClosesAt), reserve + settlement at close (settleLot in closeLot), buyer's premium + tax invoice at close (computeInvoice → invoice+ledger). All wired.
- §4 "register to bid → approved → bid" — placeBid and the lot-page `gate` both require an `approved` registration; unapproved users see "register to bid".
- §2 "live price updates via Supabase Realtime" — Broadcast on `lot:{id}` (server REST send + browser subscribe), with a live countdown.
- §2 "close-due-lots job (Vercel Cron / Docker worker) calling the same domain closeLot; soft-close recomputes closesAt" — Task 2 (engine) + Task 5 (route + schedule + docs).
- Concurrency/atomicity (Plan 2 review handoff) — `closeLot` claims via conditional `updateMany` and writes status+invoice+ledger in one `$transaction`; idempotent (tested).
- Deferred (not gaps): the disabled CTA from Plan 3 is now replaced by the live bid box. Plan 1's optional core polish (expose `winnerMax`, co-locate `Settlement`) remains cosmetic and is intentionally not bundled here.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step has complete code. Realtime/UI/cron edges are verified by build + documented manual steps (stated), with the money-critical logic (nextBidFloor, closeLot) under automated test.

**Type consistency:** `nextBidFloor(startingPrice, events, table)` (core) is used by both `placeBid` and the lot page. `CloseResult`/`closeLot`/`closeDueLots`/`updateLotClosesAt` names are stable across Tasks 2 and 5. `placeBid(lotId, maxAmount)` and `broadcastLotPrice(lotId, payload)` signatures match between Tasks 3 and 4/5. The `BidGate` union is defined identically in `lot-live.tsx` and the page. Repo calls match Plans 1–2 (`appendBid`, `getBidEventsForLot`, `getLot`, `getSale`, `getRegistration`, `getLotsDueToClose`, `getInvoice`, `getLedgerEntriesForInvoice`). The broadcast topic `lot:${lotId}` + event `price` match between server (`broadcastLotPrice`) and client (`LotLive` subscription).

---

## Handoff notes for later plans

- **Plan 6 (Payments):** the invoice rows `closeLot` writes are `status: "pending"`; add Xendit invoice creation + webhook reconciliation to flip `Invoice.status` → `paid` and set `Lot.status` → `paid`. Card-on-file (`Registration.xenditCardToken`) captured at/after registration.
- **Plan 7 (Admin):** a staff view of bids/results per lot; manual close/reopen controls; the cron's `CRON_SECRET` belongs in the Vercel project env.
- **Phase 2 (Live auctions):** the dedicated WebSocket auctioneer engine replaces Broadcast for sub-second control but reuses the same `@auction/core` engine and the Bid ledger.
- **Realtime private channels:** lot price channels are public (price is already public in the catalog). If bidder identities are ever broadcast, switch to private channels with `setAuth` + RLS.

---

## Next Plans (Phase 1 continuation)

6. **Payments** — Xendit invoice creation + webhook reconciliation over the persisted invoice/ledger; card-on-file.
7. **Admin** — staff console (sales/lots, Supabase Storage uploads, user management, registration review, results).
8. **Notifications** — Resend transactional emails (registration approved, outbid, sale ending, won/lost).
