# Phase 3D — Department Landing Pages (editorial) — Design

**Status:** pending spec review.
**Part of:** Phase 3 (seller-side). 3A (intake) + 3B (settlement & payouts) are done; 3C (consignor KYC/AML) is the remaining back-office piece. This sub-project (**3D**) is the presentation-facing editorial layer — chosen before 3C for demo value. Built directly on `main` (pre-production). See [[phase3-progress]], [[public-experience-progress]], [[workflow-main-branch]].

## Problem

Departments exist only as filter labels: `@auction/core`'s `DEPARTMENTS` (`{slug, label}`), the `/auctions?department=<slug>` filter, and a nav `<details>` menu. There is no editorial **home** for a department — no description, no dedicated landing page where a visitor enters a collecting category and sees its story + its sales. Christie's leads with departments as destinations; ours are a dropdown.

## Goal

Give every department a Christie's-style **landing page** — an editorial hero (name + description) over its sales (live / upcoming / past results) — plus a `/departments` directory, reusing the public-experience spine (`listPublishedSales` → `partitionSalesByLifecycle` → `SaleCard`). No new data model; the department copy lives in the existing curated constant.

## Architecture

### `@auction/core` — editorial copy on the existing taxonomy

Extend `Department` with editorial fields (no DB change — departments stay a curated constant, forward-compatible to a table in a later phase):
```ts
export interface Department {
  slug: string;
  label: string;
  blurb: string;       // one line — cards, nav, directory
  description: string; // a short paragraph — the landing hero
}
```
Populate `blurb` + `description` for all 8 departments. `departmentLabel`/`isDepartmentSlug` are unchanged; add `getDepartment(slug): Department | null` for the landing page.

### `apps/web` — the pages (all via `frontend-design`)

- **`/departments`** (`page.tsx`, Server Component): an editorial **directory** of all `DEPARTMENTS` — each a card (label + `blurb`) linking to its landing page. (Shows all departments, including currently-empty ones — a directory, not a browse; an empty department's landing page degrades gracefully. This is the deliberate counterpart to the home rail, which shows only `activeDepartments`.)
- **`/departments/[slug]`** (`page.tsx`, Server Component, `force-dynamic`): `getDepartment(slug)` → `notFound()` if unknown. Render a **hero** (label + `description`), then the department's sales: `listPublishedSales(prisma)` filtered to `category === slug`, `partitionSalesByLifecycle` → **Live now / Upcoming / Past results** sections (reusing `SaleCard`), each shown only when non-empty; a calm "No sales in this department yet." when the department has none. A "Browse all <Label> lots" link to `/auctions?department=<slug>`.
- **Nav:** point the header **Departments** affordance at **`/departments`** (the editorial index). The existing per-department links (`/auctions?department=<slug>`) keep working — the landing page links onward to that filtered browse.

## Access & security

- All pages are **public** (no auth); reuse `listPublishedSales`/`getPublishedSale` semantics → **no draft-sale leakage**.
- Unknown department slug → `notFound()` (no arbitrary-slug pages).
- No money, no buyer/seller data — purely presentational. No new server actions.

## Testing

- **TDD (unit, `@auction/core`):** every `DEPARTMENTS` entry now has a non-empty `blurb` + `description`; `getDepartment` returns the entry for a known slug and `null` otherwise (extend the existing `departments.test.ts`).
- **Build + manual:** `/departments` directory + `/departments/[slug]` landing (live/upcoming/past sections, empty state, unknown-slug 404) + the nav change — realtime/visual, built via `frontend-design`, verified by build + review.
- Suites stay green: core (45→), db (85), web (35→), live-runner (7).

## Global Constraints

- **Node.js >= 20**, **pnpm only**; commit directly to `main`.
- **All UI via the `frontend-design` skill**; tokens-only (no hex); no new UI deps. Christie's-grade — these are the editorial front doors.
- **No draft-sale leakage** (`listPublishedSales`); unknown slug → `notFound()`.
- **Reuse, don't fork:** `partitionSalesByLifecycle`, `SaleCard`, the `/auctions?department=` browse; `DEPARTMENTS` stays the single source of department truth.
- **Next.js 15** Server Component patterns; money via `formatRupiah` where shown (through `SaleCard`).
- **TDD** for the `@auction/core` data/helper; pages by build + review.

## Decomposition (for writing-plans)

One plan, ~4 tasks:
1. `@auction/core` — `Department.blurb`/`description` (populate all 8) + `getDepartment` (+ tests).
2. `apps/web` — `/departments` editorial directory. (frontend-design)
3. `apps/web` — `/departments/[slug]` landing (hero + live/upcoming/past + empty/404). (frontend-design)
4. `apps/web` — nav: **Departments** → `/departments`. (frontend-design)

## Deferred (a later sub-project, not this one)

A full **editorial / stories CMS** (articles, featured-lot editorial, author/landing content beyond department descriptions) is a much larger content system. Deferred — the department landing pages are the high-value editorial layer; articles can be their own sub-project after **3C (consignor KYC/AML)**.

## After this sub-project

**3C — Consignor KYC/AML** (seller identity verification + sanctions/PEP screening) remains the last planned Phase 3 piece; then optionally the editorial/stories CMS.
