# Public Experience — Plan 3: Curated Home Landing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat catalogue home with a curated Christie's-style landing — Live now, Upcoming, Recent results, and a browse-by-department rail derived from real data — the first impression for the presentation.

**Architecture:** A pure `activeDepartments` helper (the departments that actually have published sales, so the rail never dead-ends) plus a `frontend-design`-built home page that composes the existing `partitionSalesByLifecycle` (Plan 1), `SaleCard`, and the `/auctions`/`/sales/[id]/results` routes (Plans 1-2) into curated sections with "View all" links to the full browse.

**Tech Stack:** Next.js 15 App Router, `@auction/core` (`DEPARTMENTS`), `frontend-design` skill for UI, Vitest.

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **The home page is built via the `frontend-design` skill.** Christie's-grade landing; tokens-only (no hex); no new UI deps.
- **No draft-sale leakage** — home uses `listPublishedSales`.
- **The department rail shows only departments that have ≥1 published sale** (derived from data) — no empty-department dead-ends.
- **Reuse:** `partitionSalesByLifecycle` (Plan 1), `SaleCard`, the `/auctions?lifecycle=…&department=…` browse and `/sales/[id]/results` routes. Home sections are curated teasers (limited counts) with "View all →" links to `/auctions`; the full browse stays the workhorse.
- **Money** via `formatRupiah`; **Next.js 15** Server Component patterns.
- **TDD** for `activeDepartments`; the home page verified by build + review.
- Suites stay green: web (30→).

---

### Task 1: `activeDepartments` helper (departments with sales)

**Files:**
- Create: `apps/web/src/lib/departments-view.ts`
- Create: `apps/web/src/lib/departments-view.test.ts`

**Interfaces:**
- Consumes: `DEPARTMENTS`/`Department` (`@auction/core`).
- Produces: `activeDepartments(sales: { category: string | null }[]): Department[]` — the `DEPARTMENTS` (in their canonical order) that appear as a `category` on at least one given sale.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/departments-view.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { activeDepartments } from "./departments-view";

describe("activeDepartments", () => {
  it("returns only departments present in the sales, in DEPARTMENTS order", () => {
    const sales = [
      { category: "watches" },
      { category: null },
      { category: "wine" },
      { category: "watches" }, // duplicate
      { category: "not-a-real-slug" }, // ignored (not in DEPARTMENTS)
    ];
    const result = activeDepartments(sales).map((d) => d.slug);
    // canonical DEPARTMENTS order has paintings, asian-art, watches, jewellery, wine, …
    expect(result).toEqual(["watches", "wine"]);
  });

  it("returns empty when no sale has a known department", () => {
    expect(activeDepartments([{ category: null }, { category: "bogus" }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/web test src/lib/departments-view.test.ts`
Expected: FAIL — cannot resolve `./departments-view`.

- [ ] **Step 3: Write the helper**

`apps/web/src/lib/departments-view.ts`:
```ts
import { DEPARTMENTS, type Department } from "@auction/core";

/** The departments that actually have at least one published sale, in the
 *  canonical DEPARTMENTS order. Drives the home rail so it never links to an
 *  empty department. */
export function activeDepartments(
  sales: { category: string | null }[]
): Department[] {
  const present = new Set(
    sales.map((s) => s.category).filter((c): c is string => c !== null)
  );
  return DEPARTMENTS.filter((d) => present.has(d.slug));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @auction/web test src/lib/departments-view.test.ts`
Expected: PASS — unknown slugs ignored (not in `DEPARTMENTS`), duplicates collapsed, canonical order preserved.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/departments-view.ts apps/web/src/lib/departments-view.test.ts
git commit -m "feat(web): activeDepartments (departments with published sales)"
```

---

### Task 2: Curated home landing (frontend-design)

**Files:**
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `prisma`, `listPublishedSales` (`@/lib/db`); `partitionSalesByLifecycle` (`@/lib/lifecycle`, Plan 1); `activeDepartments` (Task 1); `departmentLabel` (`@auction/core`); the existing `SaleCard`.
- Produces: the curated landing page.

**REQUIRED:** Build this page with the **`frontend-design` skill** — this is the front door; Christie's-grade.

- [ ] **Step 1: Rebuild the home page**

Replace `apps/web/src/app/page.tsx` (Server Component) with a curated landing:
- `const sales = await listPublishedSales(prisma);` → `const { liveNow, upcoming, past } = partitionSalesByLifecycle(sales);` → `const departments = activeDepartments(sales);`
- **Hero:** a restrained editorial masthead (house name / tagline from `@/lib/site`) — set the tone, not a loud banner.
- **Live now** (only if `liveNow.length`): the most prominent section — a clear "Live now" treatment (accent + a live indicator), each sale via `SaleCard`. (A live sale's card already links to `/sales/[id]`; the sale page surfaces "Watch live".)
- **Upcoming** (if any): the next few (cap ~4–6) by soonest, via `SaleCard`, with a **"View all upcoming →"** link to `/auctions?lifecycle=upcoming`.
- **Recent results** (if any `past`): the most recent few (cap ~3–4), via `SaleCard`, with a **"View all results →"** link to `/auctions?lifecycle=past`. (Past-sale cards link to `/sales/[id]`, which shows prices realized.)
- **Browse by department:** a rail of `departments` (from `activeDepartments`) — each links `/auctions?department=<slug>` with `departmentLabel`. Omit the whole rail if empty.
- Each section renders only when it has content; a wholly empty catalogue shows a calm "No sales are published yet." line.

**Design intent (christies.com home):** editorial restraint — a quiet masthead, Live now as the hero moment when present, upcoming framed as a calendar, recent results as an archive teaser, departments as an elegant index. Generous whitespace, serif display, hairlines, tokens-only. Invoke `frontend-design`, then implement.

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; the 32 web tests pass (30 prior + Task 1's 2). Manual: the home shows Live now (when a live sale exists), a few Upcoming with "View all", a few Recent results with "View all", and a department rail of only departments that have sales; "View all" links land on the right `/auctions` filter.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): curated home landing (live/upcoming/results/departments)"
```

---

## Self-Review

**Spec coverage (against the design doc):**
- Curated home landing (Live now / Upcoming / Recent results / department rail) → Task 2, composing `partitionSalesByLifecycle` (Plan 1) + `SaleCard` + the `/auctions` & `/sales/[id]/results` routes (Plans 1-2).
- "Derive the visible department set from actual data to avoid empty-department dead-ends" (carry-forward from Plan 1's review) → Task 1 (`activeDepartments`) feeding the rail.
- No draft leakage (`listPublishedSales`); money via `formatRupiah`; `frontend-design` + tokens-only — Global Constraints.
- This completes the Public Experience sub-project (Plans 1-3).

**Placeholder scan:** No TBD/TODO. Task 1 carries complete code + tests; Task 2 carries a complete contract + design intent + the `frontend-design` mandate (visual specifics produced by that skill). Section caps ("~4–6", "~3–4") are intentional ranges for the designer, not placeholders — the contract is "a curated few with a View-all link," exact counts at the designer's discretion.

**Type consistency:** `activeDepartments` (Task 1) consumed by Task 2; `SaleRecord` (with `category: string | null`) satisfies its `{ category: string | null }[]` parameter and `partitionSalesByLifecycle`'s `LifecycleSale`. "View all" targets (`/auctions?lifecycle=upcoming|past`, `/auctions?department=<slug>`) are Plan 1 routes; past-sale cards → `/sales/[id]` (closed → prices realized, Plan 2). `SaleCard` reused unchanged.

---

## Public Experience — complete after this plan

Plans 1-3 deliver the full public face: discover upcoming/live auctions, browse by department, and see finished sales' prices realized — all without an account, all `frontend-design`-built. **Next: Phase 3 seller-side** (consignment intake, seller settlement/payouts, deeper KYC/AML, editorial/department landing pages — where departments may graduate to a real table).
