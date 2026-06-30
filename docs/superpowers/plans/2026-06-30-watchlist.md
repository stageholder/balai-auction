# Save / Watchlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can save/unsave a lot and see their saved lots in their account. Lean — a join table, a toggle, a list page.

**Architecture:** A `Watchlist` join table + repos in `@auction/db`; a lot-page Save toggle (client) + own-record server action; a `/account/saved` page + nav link. Reuse the lot card.

**Tech Stack:** `@auction/db` (Prisma/Postgres, Vitest), Next.js 15 (server action + a small client toggle), `frontend-design`.

## Global Constraints

- **Node.js >= 20**, **pnpm only**. **Commit directly to `main`** (pre-production).
- **All UI via `frontend-design`**; tokens-only; no new UI deps.
- **Own-record-only:** the action derives `userId` from `requireUser()` — never from the form/client. Anonymous → a sign-in link (no mutation).
- **Reuse** the lot card visual language + `formatRupiah`. `WatchlistItem.id` is the **lot** id (card links `/lots/[id]`).
- **TDD** for the repos; UI by build + review. Suites green: db (94→), web (35→).

---

### Task 1: `@auction/db` — `Watchlist` model + repos

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Generated: `packages/db/prisma/migrations/**`
- Modify: `packages/db/src/types.ts` (`WatchlistItem`)
- Create: `packages/db/src/repositories/watchlist.ts`
- Modify: `packages/db/src/index.ts` (barrel)
- Create: `packages/db/src/repositories/watchlist.test.ts`

**Interfaces:**
- Produces: `interface WatchlistItem { id; lotNumber; title; saleId; saleTitle; image: string | null; status: LotStatus; estimateLow: number; estimateHigh: number }`; `toggleWatchlist(db, userId, lotId): Promise<{ watched: boolean }>`; `isWatched(db, userId, lotId): Promise<boolean>`; `listWatchlist(db, userId): Promise<WatchlistItem[]>`.

- [ ] **Step 1: Write the failing tests**

First **read** `packages/db/src/repositories/lots.ts` (lot row + `images` handling + `toMoney`), `users.ts` (`createUser`), and the test-db harness import in `lots.test.ts`.

`packages/db/src/repositories/watchlist.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../test/testDb"; // match the real harness
import { createUser } from "./users";
import { createSale } from "./sales";
import { createLot } from "./lots";
import { toggleWatchlist, isWatched, listWatchlist } from "./watchlist";

const db = testDb();
beforeEach(async () => { await resetDb(db); });

async function seedLot(title = "A fine lot") {
  const sale = await createSale(db, {
    title: "Sale", startsAt: new Date("2026-07-01"), endsAt: new Date("2026-07-08"),
    buyersPremiumPct: 20, taxPct: 11, incrementTable: [{ upTo: null, step: 100_000 }],
  });
  return createLot(db, {
    saleId: sale.id, lotNumber: 1, title,
    estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
    reserve: null, closesAt: new Date("2026-07-08"),
  });
}

describe("watchlist", () => {
  it("toggles a lot on then off (idempotent)", async () => {
    const u = await createUser(db, { email: "w@example.com" });
    const lot = await seedLot();
    expect(await isWatched(db, u.id, lot.id)).toBe(false);
    expect(await toggleWatchlist(db, u.id, lot.id)).toEqual({ watched: true });
    expect(await isWatched(db, u.id, lot.id)).toBe(true);
    expect(await toggleWatchlist(db, u.id, lot.id)).toEqual({ watched: false });
    expect(await isWatched(db, u.id, lot.id)).toBe(false);
  });

  it("lists only the given user's saved lots, newest first", async () => {
    const u1 = await createUser(db, { email: "u1@example.com" });
    const u2 = await createUser(db, { email: "u2@example.com" });
    const a = await seedLot("Lot A");
    const b = await seedLot("Lot B");
    await toggleWatchlist(db, u1.id, a.id);
    await toggleWatchlist(db, u1.id, b.id);
    await toggleWatchlist(db, u2.id, a.id);

    const mine = await listWatchlist(db, u1.id);
    expect(mine.map((x) => x.id)).toEqual([b.id, a.id]); // newest saved first
    expect(mine[0]!.saleTitle).toBe("Sale");
    expect(mine[0]!.estimateLow).toBe(1_000_000);
  });
});
```
(Adapt harness/field names to the real ones.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @auction/db test src/repositories/watchlist.test.ts`
Expected: FAIL — cannot resolve `./watchlist`.

- [ ] **Step 3: Schema + migrate**

In `schema.prisma` add the `Watchlist` model (per the spec) + the back-relations `watchlist Watchlist[]` on `User` and `watchers Watchlist[]` on `Lot`. Migrate — `migrate dev` is interactive in non-TTY shells, so create the migration dir manually and `prisma migrate deploy` to **both** the dev DB and `auction_test`, then `prisma generate` (the established workaround):
```bash
cd packages/db
TS=$(date +%Y%m%d%H%M%S); mkdir -p prisma/migrations/${TS}_watchlist
# write migration.sql: CREATE TABLE "Watchlist" (...), the unique index on (userId,lotId),
#   the userId index, and the two FKs to "User"/"Lot".
pnpm exec prisma migrate deploy
DATABASE_URL=postgresql://auction:auction@localhost:5434/auction_test pnpm exec prisma migrate deploy
pnpm exec prisma generate
```

- [ ] **Step 4: Type + repos**

`types.ts`: add `WatchlistItem` (per the spec).

`packages/db/src/repositories/watchlist.ts`:
```ts
import type { PrismaClient } from "@prisma/client";
import { toMoney } from "../mappers";
import type { WatchlistItem, LotStatus } from "../types";

export async function toggleWatchlist(
  db: PrismaClient, userId: string, lotId: string
): Promise<{ watched: boolean }> {
  const existing = await db.watchlist.findUnique({ where: { userId_lotId: { userId, lotId } } });
  if (existing) {
    await db.watchlist.delete({ where: { id: existing.id } });
    return { watched: false };
  }
  await db.watchlist.create({ data: { userId, lotId } });
  return { watched: true };
}

export async function isWatched(db: PrismaClient, userId: string, lotId: string): Promise<boolean> {
  const row = await db.watchlist.findUnique({ where: { userId_lotId: { userId, lotId } } });
  return row !== null;
}

export async function listWatchlist(db: PrismaClient, userId: string): Promise<WatchlistItem[]> {
  const rows = await db.watchlist.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { lot: { include: { sale: { select: { title: true } } } } },
  });
  return rows.map((r) => {
    const images = Array.isArray(r.lot.images) ? (r.lot.images as string[]) : [];
    return {
      id: r.lot.id,
      lotNumber: r.lot.lotNumber,
      title: r.lot.title,
      saleId: r.lot.saleId,
      saleTitle: r.lot.sale.title,
      image: images[0] ?? null,
      status: r.lot.status as LotStatus,
      estimateLow: toMoney(r.lot.estimateLow),
      estimateHigh: toMoney(r.lot.estimateHigh),
    };
  });
}
```
(The compound unique selector is `userId_lotId` from `@@unique([userId, lotId])` — confirm the generated name. Match the real `images` handling.)

- [ ] **Step 5: Export + run**

Barrel-export `./repositories/watchlist`. Run `pnpm --filter @auction/db test` → PASS (watchlist + all prior).

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): Watchlist model + toggle/isWatched/list repos"
```

---

### Task 2: Lot-page Save toggle (frontend-design)

**Files:**
- Create: `apps/web/src/app/lots/[id]/save-button.tsx` (client)
- Create: `apps/web/src/app/lots/[id]/watchlist-actions.ts`
- Modify: `apps/web/src/app/lots/[id]/page.tsx` (render the toggle)

**Interfaces:**
- Consumes: `requireUser`/`getCurrentUser` (`@/lib/auth`); `toggleWatchlist`, `isWatched` (`@/lib/db`).
- Produces: a Save/Saved toggle on the lot page; anonymous → "Sign in to save".

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Read the lot page**

Read `apps/web/src/app/lots/[id]/page.tsx` (it already loads the lot, computes the bid gate, and gets the current user) and `@/lib/auth`.

- [ ] **Step 2: Action**

`watchlist-actions.ts` (`"use server"`):
```ts
export async function toggleWatchlistAction(lotId: string): Promise<{ watched: boolean }> {
  const user = await requireUser();               // SESSION user
  return toggleWatchlist(prisma, user.id, lotId); // own id only — never client input
}
```
Wrap the repo call so a thrown error returns a safe value (e.g. re-throw is acceptable for a toggle, but prefer returning the prior state or a typed error — keep it simple + non-crashing).

- [ ] **Step 3: Toggle component + page wiring**

`save-button.tsx` (`"use client"`): a Save/Saved toggle taking `lotId` + `initialWatched`; on click calls `toggleWatchlistAction(lotId)` (via `useTransition`) and reflects `{ watched }`. Tokens-only; a clear saved/unsaved state (e.g. an outline vs filled bookmark/heart + label).

In `page.tsx`: get the current user; if signed in, `const watched = await isWatched(prisma, user.id, lot.id)` and render `<SaveButton lotId={lot.id} initialWatched={watched} />` near the lot title/estimate (not disturbing the bid box). If anonymous, render a **"Sign in to save"** link to `/sign-in` instead.

**Design intent:** a quiet, confident save affordance in the auction-house language — not a loud social button. Invoke `frontend-design`, then implement. Tokens-only.

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: signed-in → Save toggles to Saved and back (persists on refresh); anonymous → "Sign in to save".

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/lots/[id]"
git commit -m "feat(web): save/unsave lot toggle on the lot page"
```

---

### Task 3: `/account/saved` + nav link (frontend-design)

**Files:**
- Create: `apps/web/src/app/account/saved/page.tsx`
- Modify: `apps/web/src/components/account-nav.tsx` (Saved link)

**Interfaces:**
- Consumes: `requireUser`; `listWatchlist` (`@/lib/db`); the lot card; `formatRupiah`.
- Produces: the saved-lots page + nav link.

**REQUIRED:** Build with the **`frontend-design` skill`**.

- [ ] **Step 1: Build the page**

`apps/web/src/app/account/saved/page.tsx` — Server Component, `requireUser()`, `force-dynamic`:
- `const items = await listWatchlist(prisma, user.id);`
- Render the saved lots with the **shared lot card** (the same compact card as `/search` — extract it to a shared component if that's the cleaner reuse, or mirror its markup; do not invent a third variant). Each → `/lots/[id]`.
- Empty → a calm "You haven't saved any lots yet." with a link to `/auctions`.
- Tokens-only.

- [ ] **Step 2: Nav link**

In `account-nav.tsx`, add a **Saved** link → `/account/saved` for any signed-in user (alongside Invoices / Verification). Keep the rest intact.

**Design intent:** a personal saved-lots gallery in the house style. `frontend-design`, tokens-only.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: saved lots appear at `/account/saved`; empty state for a new user; the nav link shows for signed-in users.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/account/saved" apps/web/src/components/account-nav.tsx
git commit -m "feat(web): /account/saved page + nav link"
```

---

## Self-Review

**Spec coverage:** `Watchlist` + repos → Task 1; lot-page Save toggle + own-record action + anon sign-in → Task 2; `/account/saved` + nav → Task 3. Own-record-only, reuse the lot card, tokens-only, `frontend-design` — Global Constraints + per-task contracts.

**Placeholder scan:** No TBD/TODO. Task 1 carries complete repo code + tests (with read-sibling + adapt-harness + manual-migration notes — flagged). UI tasks carry complete contracts + the `frontend-design` mandate.

**Type consistency:** `WatchlistItem` (Task 1) consumed by Task 3. `toggleWatchlist`/`isWatched` (Task 1) by Task 2; `listWatchlist` by Task 3. `WatchlistItem.id` = lot id → `/lots/[id]`. The action's `userId` is session-derived (own-record). The shared lot card (from `/search`) is reused.

---

## Next

Sell-with-us → the layout/Christie's consistency pass.
