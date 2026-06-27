# Public Experience — Plan 2: Public Results

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone see what a finished sale realized — public "prices realized" at the sale level and a "Sold for X / Unsold" outcome on every closed lot — without ever exposing buyer identity.

**Architecture:** A buyer-safe `getPublicSaleResults` + `getLotHammer` in `@auction/db` that never query buyer or invoice-status data (defense-in-depth, distinct from the staff `getSaleResults`). On top of those, three `frontend-design`-built surfaces: a public `/sales/[id]/results` page, a status-aware sale page (closed → prices realized), and a status-aware lot page (sold/unsold outcome). Plus the deferred **Results** entry in the site nav.

**Tech Stack:** `@auction/db` (Prisma, Vitest), Next.js 15 App Router, `frontend-design` skill for UI.

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **All UI tasks (2, 3, 4, 5) are built via the `frontend-design` skill.** Christie's-grade UX; tokens-only (no hex); no new UI deps.
- **Buyer identity NEVER leaks on the public path** — `getPublicSaleResults`/`getLotHammer` select only public-safe fields (no buyer, no invoice status). The staff `getSaleResults` is untouched.
- **No draft-sale leakage** — public surfaces use `getPublishedSale`.
- **Sold lots in any settled status (`sold`/`paid`/`fulfilled`) render "Sold for {hammer}"; `unsold` renders "Unsold".**
- **Money** via `formatRupiah` at render.
- **Reuse, don't fork** — extend the existing sale/lot pages in place (status-aware); keep registration/bidding for non-closed sales exactly as today.
- **Next.js 15** patterns (async `params`, Server Components default).
- **TDD** for the repo; UI verified by build + review.
- Suites stay green: db (66→), web (30).

---

### Task 1: Buyer-safe public results repo

**Files:**
- Modify: `packages/db/src/types.ts` (add `PublicLotResult`)
- Modify: `packages/db/src/repositories/results.ts` (add `getPublicSaleResults`, `getLotHammer`)
- Modify: `packages/db/src/repositories/results.test.ts` (create if absent)

**Interfaces:**
- Consumes: `PrismaClient`, `LotStatus`.
- Produces:
  - `interface PublicLotResult { lotId: string; lotNumber: number; title: string; status: LotStatus; hammer: number | null }`
  - `getPublicSaleResults(db, saleId): Promise<PublicLotResult[]>` — lots of a sale, ascending `lotNumber`, hammer from the invoice (sold lots), **no buyer / no invoice status selected**.
  - `getLotHammer(db, lotId): Promise<number | null>` — a single lot's hammer (sold) or null, selecting only the invoice hammer.

- [ ] **Step 1: Write the failing test**

In `packages/db/src/repositories/results.test.ts` (use the file's existing test-db harness; if the file does not exist, mirror the setup of `packages/db/src/repositories/lots.test.ts` — same `beforeEach(resetDb)` + the shared `db`):
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db, resetDb } from "../test/testDb"; // match the harness used by lots.test.ts
import { createSale } from "./sales";
import { createLot } from "./lots";
import { createUser } from "./users";
import { createRegistration, setRegistrationKyc } from "./registrations";
import { appendBid } from "./bids";
import { closeLot } from "./close";
import { getPublicSaleResults, getLotHammer } from "./results";

const incrementTable = [{ upTo: null, step: 100_000 }];

beforeEach(async () => {
  await resetDb();
});

async function seedSaleWithSoldAndUnsold() {
  const sale = await createSale(db, {
    title: "Results Sale",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-02T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });
  const closesAt = new Date("2026-07-01T01:00:00.000Z");
  const sold = await createLot(db, {
    saleId: sale.id, lotNumber: 1, title: "Sold Lot",
    estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
    reserve: null, closesAt,
  });
  const unsold = await createLot(db, {
    saleId: sale.id, lotNumber: 2, title: "Unsold Lot",
    estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
    reserve: 9_000_000, closesAt,
  });
  const buyer = await createUser(db, { email: "winner@example.com" });
  const reg = await createRegistration(db, { userId: buyer.id, saleId: sale.id });
  await setRegistrationKyc(db, reg.id, "approved");
  await appendBid(db, { lotId: sold.id, bidderId: buyer.id, maxAmount: 3_000_000, amount: 2_000_000 });
  const after = new Date(closesAt.getTime() + 1);
  await closeLot(db, sold.id, after);   // → sold + invoice
  await closeLot(db, unsold.id, after); // → unsold (reserve unmet)
  return { sale, sold, unsold };
}

describe("getPublicSaleResults", () => {
  it("returns public-safe rows: hammer for sold, null for unsold, NO buyer/invoice fields", async () => {
    const { sale, sold, unsold } = await seedSaleWithSoldAndUnsold();
    const rows = await getPublicSaleResults(db, sale.id);

    expect(rows.map((r) => r.lotNumber)).toEqual([1, 2]); // lotNumber asc
    const soldRow = rows.find((r) => r.lotId === sold.id)!;
    const unsoldRow = rows.find((r) => r.lotId === unsold.id)!;
    expect(soldRow.status).toBe("sold");
    expect(soldRow.hammer).toBe(2_000_000);
    expect(unsoldRow.status).toBe("unsold");
    expect(unsoldRow.hammer).toBeNull();

    // buyer identity / invoice status must NOT appear in the public payload
    expect(soldRow).not.toHaveProperty("buyerEmail");
    expect(soldRow).not.toHaveProperty("invoiceStatus");
  });
});

describe("getLotHammer", () => {
  it("returns the hammer for a sold lot and null for an unsold lot", async () => {
    const { sold, unsold } = await seedSaleWithSoldAndUnsold();
    expect(await getLotHammer(db, sold.id)).toBe(2_000_000);
    expect(await getLotHammer(db, unsold.id)).toBeNull();
  });
});
```
(If the repo helper names/signatures differ — e.g. `closeLot`'s arity, or the bid-seeding shape — adapt to the real ones; they were used identically in `services/live-runner/src/e2e.test.ts`. The behavioral assertions stay fixed.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/results.test.ts`
Expected: FAIL — `getPublicSaleResults`/`getLotHammer` not exported.

- [ ] **Step 3: Add the type**

In `packages/db/src/types.ts`:
```ts
export interface PublicLotResult {
  lotId: string;
  lotNumber: number;
  title: string;
  status: LotStatus;
  hammer: number | null;
}
```

- [ ] **Step 4: Implement the repo functions**

In `packages/db/src/repositories/results.ts`, add (import `PublicLotResult`, `LotStatus` from `../types`):
```ts
export async function getPublicSaleResults(
  db: PrismaClient,
  saleId: string
): Promise<PublicLotResult[]> {
  const rows = await db.lot.findMany({
    where: { saleId },
    orderBy: { lotNumber: "asc" },
    // Public path: select ONLY the invoice hammer. Never buyer, never status.
    include: { invoice: { select: { hammer: true } } },
  });
  return rows.map((lot) => ({
    lotId: lot.id,
    lotNumber: lot.lotNumber,
    title: lot.title,
    status: lot.status as LotStatus,
    hammer: lot.invoice ? Number(lot.invoice.hammer) : null,
  }));
}

export async function getLotHammer(
  db: PrismaClient,
  lotId: string
): Promise<number | null> {
  const lot = await db.lot.findUnique({
    where: { id: lotId },
    include: { invoice: { select: { hammer: true } } },
  });
  return lot?.invoice ? Number(lot.invoice.hammer) : null;
}
```

- [ ] **Step 5: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS — new public-results tests + all prior db tests.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): buyer-safe getPublicSaleResults + getLotHammer"
```

---

### Task 2: Public `/sales/[id]/results` page (frontend-design)

**Files:**
- Create: `apps/web/src/app/sales/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `prisma`, `getPublishedSale`, `getPublicSaleResults` (`@/lib/db`); `departmentLabel` (`@auction/core`); `formatRupiah`; `notFound`.
- Produces: the public prices-realized page.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Build the results page**

`apps/web/src/app/sales/[id]/results/page.tsx` — a Server Component (`dynamic = "force-dynamic"`):
- `const { id } = await params;` → `const sale = await getPublishedSale(prisma, id);` → `if (!sale) notFound();`
- `const results = await getPublicSaleResults(prisma, id);`
- Compute summary totals from `results`: lots sold (`status` in `sold`/`paid`/`fulfilled`), lots offered (all), total realized (`sum of hammer`).
- Render a **"Prices realized"** header (sale title, date, `departmentLabel(sale.category)`, the totals) and a results table: **Lot · Title · Result · Hammer**, where Result is "Sold" (with `formatRupiah(hammer)`) or "Unsold". **No buyer column.** Each lot title links to `/lots/[lotId]`.
- Empty/no-results → a calm "Results are not yet available." line.

**Design intent (christies.com "prices realized"):** an editorial results table — quiet hairlines, tabular figures for hammer, sold/unsold legible at a glance, the realized total as a headline figure. Tokens-only. Invoke `frontend-design`, then implement.

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds (`/sales/[id]/results` compiles); tests pass.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/sales/[id]/results"
git commit -m "feat(web): public prices-realized results page"
```

---

### Task 3: Status-aware sale page — closed → prices realized (frontend-design)

**Files:**
- Modify: `apps/web/src/app/sales/[id]/page.tsx`

**Interfaces:**
- Consumes: `sale.status` (`SaleRecord`); `getPublicSaleResults` (for an inline summary, optional) or just links to `/sales/[id]/results`.
- Produces: the sale page adapts to a closed sale.

**REQUIRED:** Build with the **`frontend-design` skill`**.

- [ ] **Step 1: Make the sale page status-aware**

In `apps/web/src/app/sales/[id]/page.tsx` (keep the existing `getPublishedSale` guard, hero, and lots grid):
- When `sale.status === "closed"`: **do not** render the registration/bidding block. Instead render a prominent **"Prices realized"** band — a short summary (e.g. lots sold / total realized via `getPublicSaleResults`) and a **"View full results →"** link to `/sales/[id]/results`. The lots catalogue grid stays (browsable).
- When `sale.status !== "closed"`: render exactly as today (registration + catalogue).
- Show `departmentLabel(sale.category)` in the sale header (a small department eyebrow) for all statuses.

**Design intent:** a closed sale reads as a results archive — the "prices realized" band replaces the call-to-register, framed editorially. Invoke `frontend-design`, then implement.

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: a closed sale shows the prices-realized band + results link and no registration; a scheduled/live sale is unchanged.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/sales/[id]/page.tsx"
git commit -m "feat(web): status-aware sale page (closed shows prices realized)"
```

---

### Task 4: Status-aware lot page — sold/unsold outcome (frontend-design)

**Files:**
- Modify: `apps/web/src/app/lots/[id]/page.tsx`

**Interfaces:**
- Consumes: `lot.status`; `getLotHammer` (Task 1); `formatRupiah`.
- Produces: a closed lot shows its outcome instead of a dead bid box.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Show the outcome for closed lots**

In `apps/web/src/app/lots/[id]/page.tsx` (keep the `getPublishedSale` guard, images, estimate, and the live-bidding path for live lots):
- For a **settled** lot (`lot.status` in `sold`/`paid`/`fulfilled`): fetch `const hammer = await getLotHammer(prisma, lot.id);` and render a **"Sold for {formatRupiah(hammer)}"** result block in place of the bid box. (If `hammer` is null for a settled lot — shouldn't happen — fall back to "Sold".)
- For `unsold`: render **"Unsold"**.
- For `live` (and not past `closesAt`): keep the existing `LotLive`/gate bidding path exactly as today.
- Estimate stays visible in all states. **No buyer shown.**

**Design intent:** a sold lot reads like a result record — "Sold for" with the hammer in tabular figures, estimate beneath for context; unsold stated plainly. Invoke `frontend-design`, then implement.

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: a sold lot shows "Sold for X"; an unsold lot shows "Unsold"; a live lot still bids.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/lots/[id]/page.tsx"
git commit -m "feat(web): status-aware lot page (sold/unsold outcome)"
```

---

### Task 5: Results in the site navigation (frontend-design)

**Files:**
- Modify: `apps/web/src/components/site-header.tsx`

**Interfaces:**
- Produces: a **Results** primary-nav entry → `/auctions?lifecycle=past` (past sales = results; that route exists from Plan 1).

- [ ] **Step 1: Add the Results link**

In `apps/web/src/components/site-header.tsx`, add a **Results** link mirroring the existing `NAV_LINK` idiom (next to **Auctions**), pointing to `/auctions?lifecycle=past`. Keep the wordmark, Auctions, the departments `<details>`, and the `accountSlot` intact. Tokens-only; match the existing nav system (use the `frontend-design` skill to keep it coherent).

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: every page's header shows **Auctions · Results · Departments** + account; Results lands on the past-sales (results) browse.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/site-header.tsx
git commit -m "feat(web): add Results to site navigation"
```

---

## Self-Review

**Spec coverage (against the design doc):**
- Public prices realized (no buyer identity) → Task 1 (`getPublicSaleResults`/`getLotHammer`, buyer/invoice-status never selected) + Task 2 (`/sales/[id]/results`).
- Status-aware sale page (closed → prices realized) → Task 3. Status-aware lot page (sold/unsold) → Task 4.
- Results in nav → Task 5 (→ `/auctions?lifecycle=past`, which exists from Plan 1).
- Buyer-identity-never-leaks + draft-never-leaks + sold-states render "Sold for" → Global Constraints + per-task contracts.
- Curated home landing is **Plan 3** — out of scope here.

**Placeholder scan:** No TBD/TODO. Task 1 carries complete repo code + concrete assertions; UI tasks carry complete contracts + design intent + the `frontend-design` mandate.

**Type consistency:** `PublicLotResult` (Task 1) is consumed by Tasks 2/3. `getLotHammer` (Task 1) by Task 4. `getPublicSaleResults` selects only `{lotId,lotNumber,title,status,hammer}` — the public payload has no `buyerEmail`/`invoiceStatus` (test-asserted). `sale.status`/`lot.status` drive the status-aware branches (Tasks 3/4). The Results nav target (`/auctions?lifecycle=past`) is the Plan 1 route. The staff `getSaleResults` is untouched.

---

## Next Plan (Public Experience)

3. **Curated home landing** — rebuild `/` as Live now / Upcoming / Recent results / department rail (deriving the **visible** department set from actual data to avoid empty-department dead-ends). (frontend-design.)
