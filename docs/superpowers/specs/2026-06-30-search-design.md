# Site Search — Design

**Status:** pending spec review.
**Part of:** the Christie's-completeness pass (sub-project 1 of 4: **Search** → Watchlist → Sell-with-us → Layout pass). Built directly on `main` (pre-production). See [[dx-no-overengineering]], [[public-experience-progress]], [[workflow-main-branch]].

## Problem

There is no way to search the catalogue. A visitor who knows what they want (an artist, a maker, a category) has to browse department-by-department. Christie's puts search at the top of every page.

## Goal

A header search box → a `/search?q=…` results page that finds **published** sales and lots by text, grouped and reusing the existing cards. Lean — Postgres `ILIKE` (case-insensitive substring), no full-text engine.

## Architecture

### `@auction/db` — two read repos (no draft leakage)

- `searchSales(db, q, limit?): Promise<SaleRecord[]>` — published sales (`status notIn ["draft"]`) where `title`/`description`/`category` `ILIKE %q%`, newest first, capped (default 50).
- `searchLots(db, q, limit?): Promise<SearchLotItem[]>` — lots whose parent sale is published, where lot `title`/`description` `ILIKE %q%`, capped. `SearchLotItem = { id; lotNumber; title; saleId; saleTitle; image: string | null; status: LotStatus; estimateLow; estimateHigh }` (enough to render a result card + link to `/lots/[id]`).
- Both use Prisma `mode: "insensitive"` `contains`. A blank/whitespace `q` returns `[]` (the page guards too).

### `apps/web` — results page + header input (all via `frontend-design`)

- **`/search`** (`page.tsx`, Server Component, `force-dynamic`): read `searchParams.q`; trim; if empty → a calm "Search the catalogue" prompt (no query). Else run `searchSales` + `searchLots` and render two sections — **Sales** (reuse `SaleCard`) and **Lots** (a compact lot result card linking `/lots/[id]`) — each with a count, each only when non-empty; an overall "No results for '<q>'" when both empty. Echo the query in the heading.
- **Header search** — a small `GET` form (`action="/search"`, `name="q"`) in the site header, so it works without client JS. Pre-fill from the current `q` on the results page.

## Access & security

- Public; **no draft leakage** — both repos filter to published sales (lots join their sale's status). No auth, no mutations.
- `q` is a Prisma parameter (`contains`), not raw SQL — no injection. Capped result sets.

## Testing

- **TDD (db):** `searchSales`/`searchLots` — match on title + description (+ category for sales); case-insensitive; exclude lots/sales of **draft** sales; blank `q` → `[]`; respect the cap.
- **Build + manual:** the `/search` page (sales + lots sections, empty + no-query states) + the header input — `frontend-design`, verified by build + review.
- Suites stay green: db (90→), web (35→), core (55), live-runner (7).

## Global Constraints

- **Node.js >= 20**, **pnpm only**; commit directly to `main`.
- **All UI via `frontend-design`**; tokens-only; no new UI deps; **no search-engine dependency** (Postgres `ILIKE` only — lean).
- **No draft leakage**; capped results; `q` parameterised.
- **Reuse:** `SaleRecord`/`SaleCard`, the existing lot-card visual language, `formatRupiah`.
- **Next.js 15** Server Component patterns. **TDD** for the repos; UI by build + review.

## Decomposition (for writing-plans)

One plan, 3 tasks:
1. `@auction/db` — `searchSales` + `searchLots` + `SearchLotItem` (+ tests).
2. `apps/web` — `/search` results page. (frontend-design)
3. `apps/web` — header search input (GET form). (frontend-design)

## After this sub-project

Watchlist → Sell-with-us → the layout/Christie's consistency pass (which harmonises the header that now carries search).
