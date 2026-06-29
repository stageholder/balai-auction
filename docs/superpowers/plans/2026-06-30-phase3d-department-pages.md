# Phase 3D — Department Landing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every department a Christie's-style editorial home — a `/departments` directory and a `/departments/[slug]` landing page (description + its sales) — reusing the public-experience spine. Lean, not over-engineered.

**Architecture:** Editorial copy (`blurb`/`description`) added to the existing `@auction/core` `DEPARTMENTS` constant (no DB change); two new public Server-Component pages reusing `listPublishedSales` → `partitionSalesByLifecycle` → `SaleCard`; the nav's Departments affordance points at the new directory. No new data model, no auth, no money.

**Tech Stack:** `@auction/core` (TS, Vitest), Next.js 15 App Router, `frontend-design` for UI.

## Global Constraints

- **Node.js >= 20**, **pnpm only**. **Commit directly to `main`** (pre-production).
- **Don't over-engineer:** reuse `partitionSalesByLifecycle`/`SaleCard`/the `/auctions?department=` browse; no new data model, no new abstractions beyond `getDepartment` + two copy fields. Keep each page focused.
- **All UI via the `frontend-design` skill**; tokens-only (no hex); no new UI deps. Christie's-grade — these are editorial front doors.
- **No draft-sale leakage** (`listPublishedSales`); unknown slug → `notFound()`.
- **Next.js 15** Server Component patterns; money via `formatRupiah` through `SaleCard`.
- **TDD** for the `@auction/core` data/helper; pages by build + review.
- Suites stay green: core (45→), web (35→), db (85), live-runner (7).

---

### Task 1: `@auction/core` — department editorial copy + `getDepartment`

**Files:**
- Modify: `packages/core/src/departments.ts`
- Modify: `packages/core/src/departments.test.ts`

**Interfaces:**
- Produces: `Department` gains `blurb: string` + `description: string` (all 8 populated); `getDepartment(slug: string): Department | null`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/departments.test.ts`:
```ts
import { getDepartment } from "./departments";

describe("department editorial copy", () => {
  it("every department has a non-empty blurb and description", () => {
    for (const d of DEPARTMENTS) {
      expect(d.blurb.trim().length).toBeGreaterThan(0);
      expect(d.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("getDepartment returns the entry for a known slug, else null", () => {
    expect(getDepartment("watches")?.label).toBe("Watches");
    expect(getDepartment("bogus")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — `blurb`/`description` missing; `getDepartment` not exported.

- [ ] **Step 3: Add copy + `getDepartment`**

In `packages/core/src/departments.ts`, extend the interface and every entry, and add the helper:
```ts
export interface Department {
  slug: string;
  label: string;
  blurb: string;
  description: string;
}

export const DEPARTMENTS: Department[] = [
  {
    slug: "paintings",
    label: "Paintings & Fine Art",
    blurb: "Old Masters to contemporary canvases.",
    description:
      "From Old Master pictures to post-war and contemporary painting, our Paintings & Fine Art sales bring significant works to market. Every lot is catalogued with provenance, condition, and estimate.",
  },
  {
    slug: "asian-art",
    label: "Asian Art",
    blurb: "Classical and modern works from across Asia.",
    description:
      "Ceramics, paintings, and works of art spanning the classical and modern traditions of China, Japan, Southeast Asia, and beyond — offered across dedicated Asian Art sales.",
  },
  {
    slug: "watches",
    label: "Watches",
    blurb: "Fine and collectible timepieces.",
    description:
      "Vintage and modern wristwatches from the houses that define collecting — catalogued by reference, condition, and provenance, with estimates set by specialists.",
  },
  {
    slug: "jewellery",
    label: "Jewellery",
    blurb: "Signed jewels, gemstones, and period pieces.",
    description:
      "Signed jewels, important coloured stones, and period pieces — each lot described with its materials, measurements, and provenance ahead of sale.",
  },
  {
    slug: "wine",
    label: "Wine & Spirits",
    blurb: "Fine wine and rare spirits by the case and bottle.",
    description:
      "Fine wine and rare spirits offered by the case and the bottle, with provenance and storage detailed so collectors can bid with confidence.",
  },
  {
    slug: "books",
    label: "Books & Manuscripts",
    blurb: "Rare books, manuscripts, and printed matter.",
    description:
      "Rare books, autograph manuscripts, maps, and printed matter — catalogued with collation and condition for collectors and institutions alike.",
  },
  {
    slug: "design",
    label: "Design & Decorative Arts",
    blurb: "Furniture, objects, and twentieth-century design.",
    description:
      "Furniture, lighting, ceramics, and decorative objects from the historical to the twentieth-century design canon, presented with maker and period attributions.",
  },
  {
    slug: "collectibles",
    label: "Collectibles",
    blurb: "Memorabilia, curiosities, and collecting categories.",
    description:
      "Memorabilia, curiosities, and the categories that don't sit in a single department — a home for the unexpected and the keenly collected.",
  },
];

// ... keep BY_SLUG / isDepartmentSlug / departmentLabel as-is ...

export function getDepartment(slug: string): Department | null {
  return BY_SLUG.get(slug) ?? null;
}
```
(Keep the existing `BY_SLUG` map, `isDepartmentSlug`, and `departmentLabel` unchanged — they keep working with the wider interface.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @auction/core test`
Expected: PASS — copy present on all 8; `getDepartment` known→entry / unknown→null. The existing department tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): department editorial copy (blurb/description) + getDepartment"
```

---

### Task 2: `/departments` editorial directory (frontend-design)

**Files:**
- Create: `apps/web/src/app/departments/page.tsx`

**Interfaces:**
- Consumes: `DEPARTMENTS` (`@auction/core`).
- Produces: the public departments directory.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Build the directory**

`apps/web/src/app/departments/page.tsx` — a Server Component:
- Render a short editorial header ("Departments" + a one-line intro), then **every** `DEPARTMENTS` entry as a card: `label` (serif), `blurb` (muted), linking to `/departments/<slug>`.
- All departments are shown (this is an editorial directory, not a browse — an empty department's landing page degrades gracefully). Tokens-only.

**Design intent (christies.com departments index):** an elegant directory — serif department names, quiet blurbs, generous grid. Reuse the paper-and-ink tokens. Invoke `frontend-design`, then implement.

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds (`/departments` compiles); tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/departments/page.tsx
git commit -m "feat(web): /departments editorial directory"
```

---

### Task 3: `/departments/[slug]` landing page (frontend-design)

**Files:**
- Create: `apps/web/src/app/departments/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getDepartment` (`@auction/core`, Task 1); `prisma`, `listPublishedSales` (`@/lib/db`); `partitionSalesByLifecycle` (`@/lib/lifecycle`); the existing `SaleCard`.
- Produces: the per-department landing page.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Build the landing page**

`apps/web/src/app/departments/[slug]/page.tsx` — Server Component, `export const dynamic = "force-dynamic"`:
- `const { slug } = await params;` → `const department = getDepartment(slug);` → `if (!department) notFound();`
- **Hero:** `department.label` (serif display) + `department.description`.
- `const sales = (await listPublishedSales(prisma)).filter((s) => s.category === slug);` → `const { liveNow, upcoming, past } = partitionSalesByLifecycle(sales);`
- Sections **Live now → Upcoming → Past results** (each only when non-empty), each sale via `SaleCard`. If the department has no published sales → a calm "No sales in this department yet." line.
- A **"Browse all {label} lots →"** link to `/auctions?department=<slug>`.
- Tokens-only; reuse `SaleCard`.

**Design intent:** a department reads as a destination — an editorial hero over its calendar (live/upcoming) and results. Mirror the `/auctions` section language for consistency. Invoke `frontend-design`, then implement.

- [ ] **Step 2: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: `/departments/watches` shows the hero + its sales (or the empty state); `/departments/bogus` → 404.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/departments/[slug]"
git commit -m "feat(web): /departments/[slug] landing page"
```

---

### Task 4: Nav — Departments → `/departments` (frontend-design)

**Files:**
- Modify: `apps/web/src/components/site-header.tsx`

**Interfaces:**
- Produces: the header **Departments** affordance points at the `/departments` directory; per-department links still work.

**REQUIRED:** Build with the **`frontend-design` skill** (light — a focused nav change).

- [ ] **Step 1: Read the current header**

Read `apps/web/src/components/site-header.tsx` — the current Departments `<details>` menu (from the public-experience plan) listing `/auctions?department=<slug>` links, plus the `Auctions`/`Results` links.

- [ ] **Step 2: Point Departments at the directory**

Make the header **Departments** affordance link to **`/departments`** (the editorial index). Keep it coherent with the existing nav idiom:
- Simplest, on-brand: a plain **Departments** nav link (`/departments`) alongside **Auctions** / **Results** (the `<details>` per-department dropdown becomes redundant now that the directory exists — replacing it with a single link is the *less* engineered choice and is preferred). If `frontend-design` prefers keeping a dropdown whose header links to `/departments`, that's acceptable too — but don't add complexity for its own sake.
- Per-department `/auctions?department=<slug>` links remain reachable from the new directory + landing pages, so removing the dropdown loses nothing.
- Keep wordmark + `accountSlot` intact. Tokens-only.

- [ ] **Step 3: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual: the header **Departments** link lands on `/departments`; from there → a department landing → its sales / `/auctions?department=`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/site-header.tsx
git commit -m "feat(web): point nav Departments at /departments directory"
```

---

## Self-Review

**Spec coverage (against the design doc):**
- `Department.blurb`/`description` + `getDepartment` → Task 1.
- `/departments` directory → Task 2. `/departments/[slug]` landing (hero + live/upcoming/past + empty + 404) → Task 3.
- Nav Departments → `/departments` → Task 4.
- Public, no draft leakage (`listPublishedSales`), unknown slug → `notFound`, reuse the spine, tokens-only, `frontend-design` — Global Constraints + per-task contracts.
- Articles/stories CMS explicitly deferred (spec) — out of scope.

**Placeholder scan:** No TBD/TODO. Task 1 carries the full populated data + helper + tests. UI tasks carry complete contracts + design intent + the `frontend-design` mandate (visual specifics produced by that skill). Department copy is real prose, not placeholder.

**Type consistency:** `Department` (Task 1, now 4 fields) is consumed by Tasks 2 (directory cards) + 3 (`getDepartment` → hero) + the nav. `isDepartmentSlug`/`departmentLabel` (unchanged) keep working against the wider interface. `getDepartment` (Task 1) → Task 3. `partitionSalesByLifecycle`/`SaleCard`/`listPublishedSales` reused unchanged; `SaleRecord.category` (public-experience) drives the per-department filter. Nav targets (`/departments`, `/auctions?department=`) exist.

---

## After this plan

**3C — Consignor KYC/AML** is the remaining planned Phase 3 piece. Christie's-completeness follow-ons to weigh (per the user's "do everything like Christie's" steer, offered not assumed): site **search**, **save/watchlist** a lot, a public **"Sell with us"** consignment submission.
