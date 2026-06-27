# Public Experience — Plan 1: Departments + Discovery Foundation + Nav

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the public a real way to discover auctions — a curated `/auctions` browse filtered by lifecycle (upcoming/live/past) and department, backed by lightweight `Sale.category` departments and real site navigation.

**Architecture:** A pure `DEPARTMENTS` taxonomy in `@auction/core`; a nullable `Sale.category` department slug in `@auction/db` (admin-set, write-validated); a pure `partitionSalesByLifecycle` helper; and two `frontend-design`-built surfaces — the `/auctions` browse page and the site header navigation. The home page is unchanged here (its curated landing is Plan 3); nav links only target routes that exist after this plan.

**Tech Stack:** `@auction/core` (TS, Vitest), `@auction/db` (Prisma/Postgres, Vitest), Next.js 15 App Router, `frontend-design` skill for UI.

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **All UI tasks (5, 6) are built via the `frontend-design` skill.** Christie's-grade UX is required; tokens-only (paper-and-ink); no hard-coded hex; no new UI dependencies.
- **No draft-sale leakage** — public surfaces use `listPublishedSales`/`getPublishedSale`.
- **Department is sale-level**, a nullable slug validated against `@auction/core`'s `DEPARTMENTS` on write, so the public filter only ever sees known slugs.
- **Money** via `formatRupiah` at render.
- **Next.js 15** patterns: async `params`/`searchParams`, Server Components by default.
- **Timed/live bidding and registration paths are untouched.**
- **TDD** for `@auction/core` + `@auction/db` + the pure `partitionSalesByLifecycle`. UI verified by build + the established review pattern.
- Suites stay green: core (36→), db (64→), web (28→).

---

### Task 1: `@auction/core` — `DEPARTMENTS` taxonomy

**Files:**
- Create: `packages/core/src/departments.ts`
- Create: `packages/core/src/departments.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `interface Department { slug: string; label: string }`; `const DEPARTMENTS: Department[]`; `departmentLabel(slug: string | null): string | null`; `isDepartmentSlug(slug: string): boolean`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/departments.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  DEPARTMENTS,
  departmentLabel,
  isDepartmentSlug,
} from "./departments";

describe("departments", () => {
  it("has unique, non-empty slugs and labels", () => {
    expect(DEPARTMENTS.length).toBeGreaterThan(0);
    const slugs = DEPARTMENTS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const d of DEPARTMENTS) {
      expect(d.slug).toMatch(/^[a-z-]+$/);
      expect(d.label.length).toBeGreaterThan(0);
    }
  });

  it("isDepartmentSlug recognises known slugs only", () => {
    expect(isDepartmentSlug("watches")).toBe(true);
    expect(isDepartmentSlug("not-a-department")).toBe(false);
    expect(isDepartmentSlug("")).toBe(false);
  });

  it("departmentLabel maps slug → label, else null", () => {
    expect(departmentLabel("watches")).toBe("Watches");
    expect(departmentLabel("bogus")).toBeNull();
    expect(departmentLabel(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./departments`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/departments.ts`:
```ts
export interface Department {
  slug: string;
  label: string;
}

/** Curated auction departments. Sale-level; forward-compatible to a real
 *  Department table in a later phase. */
export const DEPARTMENTS: Department[] = [
  { slug: "paintings", label: "Paintings & Fine Art" },
  { slug: "asian-art", label: "Asian Art" },
  { slug: "watches", label: "Watches" },
  { slug: "jewellery", label: "Jewellery" },
  { slug: "wine", label: "Wine & Spirits" },
  { slug: "books", label: "Books & Manuscripts" },
  { slug: "design", label: "Design & Decorative Arts" },
  { slug: "collectibles", label: "Collectibles" },
];

const BY_SLUG = new Map(DEPARTMENTS.map((d) => [d.slug, d]));

export function isDepartmentSlug(slug: string): boolean {
  return BY_SLUG.has(slug);
}

export function departmentLabel(slug: string | null): string | null {
  if (slug === null) return null;
  return BY_SLUG.get(slug)?.label ?? null;
}
```

- [ ] **Step 4: Re-export and run**

Append to `packages/core/src/index.ts`:
```ts
export * from "./departments";
```
Run: `pnpm --filter @auction/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): add DEPARTMENTS taxonomy + helpers"
```

---

### Task 2: `@auction/db` — `Sale.category` department slug

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Generated: `packages/db/prisma/migrations/**`
- Modify: `packages/db/src/types.ts` (`SaleRecord`, `NewSale`, `UpdateSale`)
- Modify: `packages/db/src/mappers.ts` (`saleRowToRecord`)
- Modify: `packages/db/src/repositories/sales.ts` (`createSale`/`updateSale`)
- Modify: `packages/db/src/repositories/sales.test.ts`

**Interfaces:**
- Produces: `SaleRecord.category: string | null`; `NewSale.category?: string | null`; `UpdateSale.category?: string | null`.

- [ ] **Step 1: Write the failing test**

Append to `packages/db/src/repositories/sales.test.ts`:
```ts
describe("sale category", () => {
  it("defaults category to null", async () => {
    const sale = await createSale(db, sampleSale("Uncategorised"));
    expect(sale.category).toBeNull();
  });

  it("creates and updates a sale's category", async () => {
    const sale = await createSale(db, {
      ...sampleSale("Watch Sale"),
      category: "watches",
    });
    expect(sale.category).toBe("watches");

    const cleared = await updateSale(db, sale.id, { category: null });
    expect(cleared.category).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test`
Expected: FAIL — `category` not on the record / not accepted.

- [ ] **Step 3: Edit the schema and migrate**

In `packages/db/prisma/schema.prisma`, add to `model Sale` (after `liveLotSeconds`):
```prisma
  category         String?
```
Migrate (Docker Postgres up):
```bash
cd packages/db
pnpm exec prisma migrate dev --name sale_category
```
Expected: a migration adding the nullable `category` column only.

- [ ] **Step 4: Extend types**

In `packages/db/src/types.ts`:
- `SaleRecord`: add `category: string | null;`
- `NewSale`: add `category?: string | null;`
- `UpdateSale`: add `category?: string | null;`

- [ ] **Step 5: Map and pass through**

In `packages/db/src/mappers.ts`, extend `saleRowToRecord`'s param shape with `category: string | null;` and return `category: row.category`.

In `packages/db/src/repositories/sales.ts`, add to both `createSale` and `updateSale` `data`:
```ts
      ...(input.category !== undefined ? { category: input.category } : {}),
```

- [ ] **Step 6: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS — new category tests + all prior db tests (existing sales default `category: null`).

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): add nullable Sale.category department slug"
```

---

### Task 3: Admin sale form — Department dropdown + validation

**Files:**
- Modify: `apps/web/src/app/admin/sales/sale-form.tsx`
- Modify: `apps/web/src/app/admin/sales/actions.ts`

**Interfaces:**
- Consumes: `DEPARTMENTS`/`isDepartmentSlug` (`@auction/core`); `SaleRecord.category` + `NewSale`/`UpdateSale.category` (Task 2).
- Produces: the admin form sets a validated `category` (slug or null).

- [ ] **Step 1: Add the Department select**

In `apps/web/src/app/admin/sales/sale-form.tsx`, import `DEPARTMENTS` from `@auction/core` and add a select (reuse the `FIELD`/`LABEL` constants), placed near the mode/timer row:
```tsx
        <div>
          <label htmlFor="category" className={LABEL}>Department</label>
          <select
            id="category"
            name="category"
            defaultValue={sale?.category ?? ""}
            className={FIELD}
          >
            <option value="">— None —</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.slug} value={d.slug}>{d.label}</option>
            ))}
          </select>
        </div>
```

- [ ] **Step 2: Validate + pass in the action**

In `apps/web/src/app/admin/sales/actions.ts`, import `isDepartmentSlug` from `@auction/core` and extend `readForm`:
```ts
    category: (() => {
      const raw = String(formData.get("category") ?? "");
      return isDepartmentSlug(raw) ? raw : null;
    })(),
```
(An empty or unknown value becomes `null` — "uncategorised". `readForm`'s result flows through both `createSaleAction` and `updateSaleAction`.)

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; the web tests still pass. Manual (staff): create/edit a sale → pick a Department → it persists; picking "— None —" clears it.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/sales
git commit -m "feat(web): admin sale form department dropdown with validation"
```

---

### Task 4: `partitionSalesByLifecycle` pure helper

**Files:**
- Create: `apps/web/src/lib/lifecycle.ts`
- Create: `apps/web/src/lib/lifecycle.test.ts`

**Interfaces:**
- Produces:
  - `interface LifecycleSale { id: string; status: string; startsAt: Date; endsAt: Date }`
  - `partitionSalesByLifecycle<T extends LifecycleSale>(sales: T[]): { liveNow: T[]; upcoming: T[]; past: T[] }` — `liveNow` = status `live`; `upcoming` = status `scheduled` sorted `startsAt` ascending; `past` = status `closed` sorted `endsAt` descending.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/lifecycle.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { partitionSalesByLifecycle, type LifecycleSale } from "./lifecycle";

function s(
  id: string,
  status: string,
  startsAt: string,
  endsAt: string
): LifecycleSale {
  return { id, status, startsAt: new Date(startsAt), endsAt: new Date(endsAt) };
}

describe("partitionSalesByLifecycle", () => {
  const sales = [
    s("u2", "scheduled", "2026-08-01", "2026-08-05"),
    s("live1", "live", "2026-07-01", "2026-07-10"),
    s("p1", "closed", "2026-05-01", "2026-05-05"),
    s("u1", "scheduled", "2026-07-20", "2026-07-25"),
    s("p2", "closed", "2026-06-01", "2026-06-05"),
    s("draftish", "draft", "2026-09-01", "2026-09-05"),
  ];

  it("splits by lifecycle", () => {
    const { liveNow, upcoming, past } = partitionSalesByLifecycle(sales);
    expect(liveNow.map((x) => x.id)).toEqual(["live1"]);
    expect(upcoming.map((x) => x.id)).toEqual(["u1", "u2"]); // soonest first
    expect(past.map((x) => x.id)).toEqual(["p2", "p1"]); // most recent first
  });

  it("ignores statuses that are neither live/scheduled/closed", () => {
    const { liveNow, upcoming, past } = partitionSalesByLifecycle(sales);
    const all = [...liveNow, ...upcoming, ...past].map((x) => x.id);
    expect(all).not.toContain("draftish");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/web test src/lib/lifecycle.test.ts`
Expected: FAIL — cannot resolve `./lifecycle`.

- [ ] **Step 3: Write the helper**

`apps/web/src/lib/lifecycle.ts`:
```ts
export interface LifecycleSale {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
}

/** Partition published sales into the discovery buckets the public UI shows. */
export function partitionSalesByLifecycle<T extends LifecycleSale>(
  sales: T[]
): { liveNow: T[]; upcoming: T[]; past: T[] } {
  const liveNow = sales.filter((s) => s.status === "live");
  const upcoming = sales
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = sales
    .filter((s) => s.status === "closed")
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
  return { liveNow, upcoming, past };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @auction/web test src/lib/lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/lifecycle.ts apps/web/src/lib/lifecycle.test.ts
git commit -m "feat(web): partitionSalesByLifecycle discovery helper"
```

---

### Task 5: `/auctions` browse page (frontend-design)

**Files:**
- Create: `apps/web/src/app/auctions/page.tsx`

**Interfaces:**
- Consumes: `prisma`, `listPublishedSales` (`@/lib/db`); `partitionSalesByLifecycle` (Task 4); `DEPARTMENTS`/`departmentLabel`/`isDepartmentSlug` (`@auction/core`); the existing `SaleCard` component.
- Produces: the public `/auctions` route with lifecycle + department filtering.

**REQUIRED:** Build this surface with the **`frontend-design` skill** — Christie's-grade browse experience.

- [ ] **Step 1: Build the browse page**

`apps/web/src/app/auctions/page.tsx` — a Server Component:
- Read `searchParams` (Next 15: `searchParams: Promise<{ lifecycle?: string; department?: string }>`).
- `const sales = await listPublishedSales(prisma);`
- If a valid `department` slug (`isDepartmentSlug`), filter `sales` to `s.category === department`.
- `const { liveNow, upcoming, past } = partitionSalesByLifecycle(sales);`
- If `lifecycle` is one of `live|upcoming|past`, show only that bucket; otherwise show all three sections in order **Live now → Upcoming → Past results**.
- Render: a department filter rail (chips from `DEPARTMENTS`, the active one highlighted, each linking `/auctions?department=<slug>`; an "All" chip clears it), lifecycle tabs (`/auctions?lifecycle=...`), and each sale as the existing `SaleCard` (linking to `/sales/[id]`). Empty buckets render a calm "Nothing here yet" line.
- Show the active department label (`departmentLabel`) in the heading when filtered.

**Design intent (christies.com feel):** auctions read as a calendar of events — section headers with counts, dates prominent on each card, "Live now" visually distinct, past sales framed as "results". Tokens-only; reuse `SaleCard`; large type and generous spacing. Invoke `frontend-design` for the layout, then implement.

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds (the `/auctions` route compiles); tests pass. Manual: `/auctions` shows the three sections; `?department=watches` filters; `?lifecycle=past` shows only past sales.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/auctions
git commit -m "feat(web): public /auctions browse with lifecycle + department filters"
```

---

### Task 6: Site navigation (frontend-design)

**Files:**
- Modify: `apps/web/src/components/site-header.tsx`

**Interfaces:**
- Consumes: `DEPARTMENTS` (`@auction/core`) for the department links; the existing `accountSlot`.
- Produces: real primary navigation linking to routes that exist after this plan.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Add primary navigation**

In `apps/web/src/components/site-header.tsx`, add primary nav between the wordmark and the `accountSlot`:
- An **Auctions** link → `/auctions`.
- **Departments** access → either an inline set of links or a disclosure, each → `/auctions?department=<slug>` (labels from `DEPARTMENTS`). Keep it server-renderable (no new client component) unless `frontend-design` calls for a disclosure, in which case a small focused client component is acceptable — tokens-only, no new deps.
- Keep the existing `accountSlot` (Sign in / account menu) and the wordmark/home link.
- (A **Results** entry is added in Plan 2, when its routes exist — do not add a dead link now.)

**Design intent:** a restrained editorial header — wordmark left, primary nav, account right. Christie's-like clarity. Invoke `frontend-design`, then implement.

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: every page shows the header with a working **Auctions** link and department links into `/auctions?department=...`; anonymous users see Sign in; signed-in users see their account menu.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/site-header.tsx
git commit -m "feat(web): primary site navigation (Auctions + departments)"
```

---

## Self-Review

**Spec coverage (against the design doc):**
- Lightweight departments → Tasks 1 (`DEPARTMENTS`) + 2 (`Sale.category`) + 3 (admin dropdown + write validation).
- Discovery core → Task 4 (`partitionSalesByLifecycle`) + Task 5 (`/auctions` browse with lifecycle + department filters).
- Navigation → Task 6 (Auctions + departments; Results deferred to Plan 2 when its routes exist — noted, not a gap).
- Christie's-grade UX + `frontend-design` → mandated on Tasks 5 and 6.
- No draft leakage (`listPublishedSales`), department validated on write, money via `formatRupiah`, bidding untouched — all carried in Global Constraints.
- Public results, status-aware sale/lot pages, and the curated home landing are **Plan 2 / Plan 3** — out of scope here by design.

**Placeholder scan:** No TBD/TODO. Core/db/pure tasks carry complete code; UI tasks carry complete contracts + design intent + the `frontend-design` mandate (their visual specifics are produced by that skill, not pre-frozen here).

**Type consistency:** `DEPARTMENTS`/`isDepartmentSlug`/`departmentLabel` (Task 1) are consumed by Tasks 3, 5, 6. `Sale.category` (Task 2) is read by Task 3 (form default), Task 5 (filter), and write-validated in Task 3. `partitionSalesByLifecycle`/`LifecycleSale` (Task 4) consumed by Task 5; `SaleRecord` satisfies `LifecycleSale` (has `id`/`status`/`startsAt`/`endsAt`). Nav links (`/auctions`, `/auctions?department=`) target the route built in Task 5.

---

## Next Plans (Public Experience)

2. **Public results** — `getPublicSaleResults` (no buyer identity) + status-aware sale page (closed → prices realized) + `/sales/[id]/results` + status-aware lot page (sold/unsold) + add **Results** to nav. (frontend-design.)
3. **Curated home landing** — rebuild `/` as Live now / Upcoming / Recent results / department rail, on top of the now-working browse + results. (frontend-design.)
