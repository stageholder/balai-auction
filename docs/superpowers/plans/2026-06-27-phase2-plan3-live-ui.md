# Phase 2 — Plan 3: Live Bidder UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/live/[saleId]` page where bidders watch a live sale auto-advance lot-by-lot — current lot large with countdown + bid box, an "up next" queue and a "just sold" ticker — driven by the runner's `sale:{id}` broadcasts.

**Architecture:** Maximum reuse. The `LiveSale` client component subscribes to the `sale:{saleId}` channel and tracks the active lot; for the active lot it **renders the existing `LotLive`** (Plan 5) keyed by lot id, so its per-lot price subscription, countdown, gating, and `placeBid` are reused verbatim — a `lot-opened` event just remounts `LotLive` for the new lot. A pure `liveViewModel` helper partitions the sale's lots into up-next / just-sold for the surrounding chrome. The `/live/[saleId]` page is a Server Component that preloads the lots + the initial active lot's price/floor + the per-sale bid gate.

**Tech Stack:** Next.js 15 (Server + Client Components), Supabase Broadcast (browser), `@auction/core` (resolveBids/nextBidFloor), `@auction/db`, Vitest.

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **Reuse `LotLive`** (Plan 5) for the active lot — do not reimplement per-lot price/countdown/bidding. `LiveSale` only adds the sale-channel subscription + lot swapping + surrounding chrome.
- **The live page is for `mode:"live"` sales** — `notFound()` otherwise.
- **The bid gate is per-sale** (one `Registration` per sale): computed once server-side (`signin` / `register` / `open` / `closed`) and applied to whichever lot is active. The per-lot floor hint is the active lot's starting price on open (placeBid re-validates authoritatively, as in Plan 5).
- **Channel contract (from Plan 2):** sale events on `sale:{saleId}` — `lot-opened {lotId, closesAt}`, `lot-closed {lotId}`, `sale-ended {}`; per-lot price on `lot:{lotId}` (consumed by `LotLive`).
- **Money via `formatRupiah`**; tokens-only styling (paper-and-ink); no `@auction/db`/prisma import in client components (type-only allowed).
- **TDD** for the pure `liveViewModel`. `LiveSale` + the page are verified by build + manual run (realtime/interactive).
- Suites must stay green: `@auction/web` (25→ grows), others unchanged.

---

### Task 1: `liveViewModel` pure partition helper

**Files:**
- Create: `apps/web/src/lib/live-view.ts`
- Create: `apps/web/src/lib/live-view.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface LiveViewLot { id: string; lotNumber: number; title: string }`
  - `liveViewModel(lots: LiveViewLot[], activeLotId: string | null, soldIds: string[]): { upNext: LiveViewLot[]; justSold: LiveViewLot[] }` — `upNext` = lots not active and not sold, ordered by `lotNumber` ascending; `justSold` = lots whose id is in `soldIds`, in **most-recent-first** order (reverse of `soldIds`).

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/live-view.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { liveViewModel, type LiveViewLot } from "./live-view";

const lots: LiveViewLot[] = [
  { id: "a", lotNumber: 1, title: "Lot A" },
  { id: "b", lotNumber: 2, title: "Lot B" },
  { id: "c", lotNumber: 3, title: "Lot C" },
  { id: "d", lotNumber: 4, title: "Lot D" },
];

describe("liveViewModel", () => {
  it("up-next excludes the active and sold lots, ordered by lotNumber", () => {
    const { upNext } = liveViewModel(lots, "b", ["a"]);
    expect(upNext.map((l) => l.id)).toEqual(["c", "d"]);
  });

  it("just-sold lists sold lots most-recent-first", () => {
    const { justSold } = liveViewModel(lots, "c", ["a", "b"]);
    expect(justSold.map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("handles no active lot (all remaining are up-next)", () => {
    const { upNext, justSold } = liveViewModel(lots, null, ["a"]);
    expect(upNext.map((l) => l.id)).toEqual(["b", "c", "d"]);
    expect(justSold.map((l) => l.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/web test src/lib/live-view.test.ts`
Expected: FAIL — cannot resolve `./live-view`.

- [ ] **Step 3: Write the helper**

`apps/web/src/lib/live-view.ts`:
```ts
export interface LiveViewLot {
  id: string;
  lotNumber: number;
  title: string;
}

/** Partition a live sale's lots into the upcoming queue and the recently-sold
 *  ticker, given the current active lot and the ids closed so far (in close
 *  order). Pure — drives the live page's surrounding chrome. */
export function liveViewModel(
  lots: LiveViewLot[],
  activeLotId: string | null,
  soldIds: string[]
): { upNext: LiveViewLot[]; justSold: LiveViewLot[] } {
  const sold = new Set(soldIds);
  const byId = new Map(lots.map((l) => [l.id, l]));

  const upNext = lots
    .filter((l) => l.id !== activeLotId && !sold.has(l.id))
    .sort((a, b) => a.lotNumber - b.lotNumber);

  const justSold = [...soldIds]
    .reverse()
    .map((id) => byId.get(id))
    .filter((l): l is LiveViewLot => l !== undefined);

  return { upNext, justSold };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @auction/web test src/lib/live-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/live-view.ts apps/web/src/lib/live-view.test.ts
git commit -m "feat(web): liveViewModel pure partition helper"
```

---

### Task 2: `LiveSale` client component

**Files:**
- Create: `apps/web/src/app/live/[saleId]/live-sale.tsx` (client)

**Interfaces:**
- Consumes: `createBrowserSupabaseClient` (Plan 4); `LotLive` (Plan 5); `liveViewModel` (Task 1); `formatRupiah` (Plan 3).
- Produces:
  - `type LiveGate = "signin" | "register" | "open" | "closed"`
  - `interface LiveSaleLot { id: string; lotNumber: number; title: string; startingPrice: number }`
  - `interface LiveActive { id: string; closesAt: string; currentPrice: number; floor: number }`
  - `LiveSale({ saleId, lots, initialActive, gate }: { saleId: string; lots: LiveSaleLot[]; initialActive: LiveActive | null; gate: LiveGate })`

- [ ] **Step 1: Write the component**

`apps/web/src/app/live/[saleId]/live-sale.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { liveViewModel } from "@/lib/live-view";
import { formatRupiah } from "@/lib/format";
import { LotLive } from "@/app/lots/[id]/lot-live";

export type LiveGate = "signin" | "register" | "open" | "closed";

export interface LiveSaleLot {
  id: string;
  lotNumber: number;
  title: string;
  startingPrice: number;
}

export interface LiveActive {
  id: string;
  closesAt: string;
  currentPrice: number;
  floor: number;
}

export function LiveSale({
  saleId,
  lots,
  initialActive,
  gate,
}: {
  saleId: string;
  lots: LiveSaleLot[];
  initialActive: LiveActive | null;
  gate: LiveGate;
}) {
  const [active, setActive] = useState<LiveActive | null>(initialActive);
  const [soldIds, setSoldIds] = useState<string[]>([]);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`sale:${saleId}`)
      .on("broadcast", { event: "lot-opened" }, ({ payload }) => {
        const lot = lots.find((l) => l.id === payload?.lotId);
        if (lot && typeof payload?.closesAt === "string") {
          setActive({
            id: lot.id,
            closesAt: payload.closesAt,
            currentPrice: lot.startingPrice,
            floor: lot.startingPrice,
          });
        }
      })
      .on("broadcast", { event: "lot-closed" }, ({ payload }) => {
        if (typeof payload?.lotId === "string") {
          setSoldIds((ids) =>
            ids.includes(payload.lotId) ? ids : [...ids, payload.lotId]
          );
          setActive((a) => (a && a.id === payload.lotId ? null : a));
        }
      })
      .on("broadcast", { event: "sale-ended" }, () => {
        setActive(null);
        setEnded(true);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [saleId, lots]);

  const { upNext, justSold } = liveViewModel(
    lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, title: l.title })),
    active?.id ?? null,
    soldIds
  );

  // The per-sale gate maps to LotLive's per-lot gate (floor = active lot floor).
  const lotGate =
    gate === "open" && active
      ? ({ kind: "open", floor: active.floor } as const)
      : gate === "signin"
        ? ({ kind: "signin" } as const)
        : gate === "register"
          ? ({ kind: "register", saleId } as const)
          : ({ kind: "closed" } as const);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
      {/* ── Current lot ── */}
      <section>
        <p className="mb-4 font-sans text-xs uppercase tracking-[0.2em] text-accent">
          Live now
        </p>
        {active ? (
          <LotLive
            key={active.id}
            lotId={active.id}
            initialPrice={active.currentPrice}
            initialClosesAt={active.closesAt}
            gate={lotGate}
          />
        ) : ended ? (
          <p className="text-muted">This sale has ended.</p>
        ) : (
          <p className="text-muted">Waiting for the next lot…</p>
        )}
      </section>

      {/* ── Up next + just sold ── */}
      <aside className="space-y-8">
        <div>
          <h2 className="mb-3 font-sans text-xs uppercase tracking-[0.15em] text-muted">
            Up next
          </h2>
          {upNext.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {upNext.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className="tnum text-muted">{l.lotNumber}</span>
                  <span className="text-ink">{l.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="mb-3 font-sans text-xs uppercase tracking-[0.15em] text-muted">
            Just sold
          </h2>
          {justSold.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {justSold.map((l) => (
                <li key={l.id} className="flex gap-2 text-muted">
                  <span className="tnum">{l.lotNumber}</span>
                  <span>{l.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
```
(`formatRupiah` is imported for parity with the design system / future price labels in the chrome; if your linter flags it as unused after frontend-design styling, either use it in a price label or drop the import.)

**Note (visual craft):** Use the frontend-design skill to make the live room feel alive — a prominent "LIVE" indicator, the current lot dominant, a calm up-next rail and just-sold ticker — tokens-only, while keeping the `LotLive` reuse, the three sale-channel events, and the gate mapping intact.

- [ ] **Step 2: Build**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; existing tests pass (no new unit test here — `LiveSale` is realtime/interactive, verified with the page in Task 3).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/live"
git commit -m "feat(web): LiveSale client component wrapping LotLive with sale-channel auto-advance"
```

---

### Task 3: `/live/[saleId]` page + sale-page link

**Files:**
- Create: `apps/web/src/app/live/[saleId]/page.tsx`
- Modify: `apps/web/src/app/sales/[id]/page.tsx` (add a "Watch live" link for running live sales)

**Interfaces:**
- Consumes: `prisma`, `getSale`, `listLotsForSale`, `getBidEventsForLot`, `getRegistration` (`@/lib/db`); `resolveBids`, `nextBidFloor` (`@auction/core`); `getCurrentUser` (`@/lib/auth`); `LiveSale` + its types (Task 2); `notFound` from `next/navigation`.
- Produces: the `/live/[saleId]` route; a link from the sale page.

- [ ] **Step 1: Write the live page**

`apps/web/src/app/live/[saleId]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import {
  prisma,
  getSale,
  listLotsForSale,
  getBidEventsForLot,
  getRegistration,
} from "@/lib/db";
import { resolveBids, nextBidFloor } from "@auction/core";
import { getCurrentUser } from "@/lib/auth";
import {
  LiveSale,
  type LiveActive,
  type LiveGate,
  type LiveSaleLot,
} from "./live-sale";

export const dynamic = "force-dynamic";

export default async function LiveSalePage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const { saleId } = await params;
  const sale = await getSale(prisma, saleId);
  if (!sale || sale.mode !== "live") notFound();

  const lots = await listLotsForSale(prisma, saleId);
  const liveLots: LiveSaleLot[] = lots.map((l) => ({
    id: l.id,
    lotNumber: l.lotNumber,
    title: l.title,
    startingPrice: l.startingPrice,
  }));

  // Initial active lot (the one currently "live"), with its real price/floor.
  const activeLot = lots.find((l) => l.status === "live") ?? null;
  let initialActive: LiveActive | null = null;
  if (activeLot) {
    const events = await getBidEventsForLot(prisma, activeLot.id);
    initialActive = {
      id: activeLot.id,
      closesAt: activeLot.closesAt.toISOString(),
      currentPrice: resolveBids(
        activeLot.startingPrice,
        events,
        sale.incrementTable
      ).currentPrice,
      floor: nextBidFloor(activeLot.startingPrice, events, sale.incrementTable),
    };
  }

  // Per-sale bid gate.
  let gate: LiveGate;
  if (sale.status === "closed") {
    gate = "closed";
  } else {
    const user = await getCurrentUser();
    if (!user) {
      gate = "signin";
    } else {
      const reg = await getRegistration(prisma, user.id, saleId);
      gate = reg && reg.kycStatus === "approved" ? "open" : "register";
    }
  }

  return (
    <div>
      <header className="mb-10">
        <p className="font-sans text-xs uppercase tracking-[0.2em] text-muted">
          Live auction
        </p>
        <h1 className="mt-2 text-4xl leading-tight">{sale.title}</h1>
      </header>
      <LiveSale
        saleId={saleId}
        lots={liveLots}
        initialActive={initialActive}
        gate={gate}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the "Watch live" link on the sale page**

In `apps/web/src/app/sales/[id]/page.tsx`, after the sale header section (and before the `<SaleRegistration />` block), add a prominent link shown only for a running live sale:
```tsx
      {sale.mode === "live" && sale.status === "live" ? (
        <div className="mb-10">
          <a
            href={`/live/${sale.id}`}
            className="inline-block border border-accent px-5 py-2 text-sm uppercase tracking-[0.15em] text-accent hover:bg-accent hover:text-paper"
          >
            ● Watch live
          </a>
        </div>
      ) : null}
```
(The existing `getPublishedSale` guard, registration block, and lots grid stay unchanged. `sale.mode` exists on `SaleRecord` since Phase 2 Plan 1.)

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual end-to-end (needs Plan 4's queued-lot creation to fully exercise, but the page renders now): with the Supabase stack + a live-mode sale, `/live/{saleId}` shows the live layout; when the runner opens/closes lots, the current lot advances live and the up-next/just-sold rails update. The sale page shows "Watch live" while the sale is live.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/live" "apps/web/src/app/sales/[id]/page.tsx"
git commit -m "feat(web): /live/[saleId] page and sale-page Watch live link"
```

---

## Self-Review

**Spec coverage (against the Phase 2 design doc §5):**
- §5 the `/live/[saleId]` page (current lot large, countdown, bid box, up-next, just-sold, auto-advance) → Task 3 (page) + Task 2 (`LiveSale`) + Task 1 (`liveViewModel`).
- §5 built on `LotLive`, subscribing to the `sale:{id}` channel → `LiveSale` renders `LotLive` keyed by active lot id (reuses per-lot price/countdown/bid) and subscribes to `sale:{id}` for `lot-opened`/`lot-closed`/`sale-ended`.
- Per-sale gate (signin/register/open/closed) computed server-side; live-mode-only via `notFound()`; money via `formatRupiah`; tokens-only.
- Reuses `placeBid` (through `LotLive`) and the per-lot `lot:{id}` price channel — no new bid path.
- Depends on Plan 4 (queued-lot creation) for a full multi-lot e2e; the page itself renders today and the active-lot path works for any opened lot.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step has complete code. `LiveSale`/page are realtime/interactive → verified by build + manual; the pure `liveViewModel` is unit-tested.

**Type consistency:** `LiveSaleLot`/`LiveActive`/`LiveGate` defined once in `live-sale.tsx` (Task 2) and imported by the page (Task 3). `liveViewModel`/`LiveViewLot` (Task 1) consumed by `LiveSale`. `LotLive` props (`lotId`, `initialPrice`, `initialClosesAt`, `gate`) match Plan 5; the `gate` mapping produces LotLive's `BidGate` shape (`{kind:"open",floor}` / `{kind:"signin"}` / `{kind:"register",saleId}` / `{kind:"closed"}`). The `sale:{id}` event names/payloads (`lot-opened {lotId,closesAt}`, `lot-closed {lotId}`, `sale-ended`) match Plan 2's broadcaster. `sale.mode`/`SaleRecord` from Plan 1.

---

## Next Plan (Phase 2 finale)

4. **Admin live controls + queued-lot creation** — sale `mode`/`liveLotSeconds` in the admin sale form; create live sales' lots as `queued` (optional `status` on `NewLot`); keep `Lot.closesAt` non-null. Unlocks a full DB end-to-end of the runner + this live UI.
