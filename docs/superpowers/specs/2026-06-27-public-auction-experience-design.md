# Public Auction Experience — Design

**Status:** Approved (design); pending spec review.
**Sub-project of:** the road to the Phase 3 presentation. This is the **public-facing layer** — built before the Phase 3 seller-side work (consignment intake, settlement, KYC/AML, editorial). It makes the whole product legible to anyone *without an account*.

## Problem

Today the catalogue is technically public (home, sale, lot, live pages are anonymous-viewable with a "Sign in to bid" prompt), but it does not read like a real auction house to a visitor:

- **No prices realized.** When a sale closes, the public sees only a "closed" label. Hammer prices and sold/unsold outcomes exist but are locked to the staff-only admin results page. Christie's makes *prices realized* a headline public feature.
- **No discovery structure.** The home page lumps upcoming + live + finished sales together with a tiny status word. There is no "Live now / Upcoming / Past results" framing, no real top navigation, and no way to browse by department.
- **Closed lots don't show outcomes.** A sold lot still shows its estimate and a dead bid box rather than "Sold for X".
- **No departments.** There is no Christie's-style department/category to browse by.

## Goal

A complete, Christie's-grade **public browsing + results experience**: anyone can discover what's **upcoming**, watch what's **live now**, browse **by department**, and look back at **finished sales and their prices realized** — all without an account. Bidding stays gated exactly as today (sign-in → register → bid).

## Christie's-like UX bar (the experience target)

Every surface in this sub-project is judged against how christies.com actually feels:

- **Auctions = a calendar of events.** Upcoming sales lead with the date and a clear **"Register to bid"** affordance; live sales show a **"Live now"** state; past sales lead with **"Browse results / Prices realized"**.
- **Prices realized are a destination,** not a footnote — a clean per-lot table (lot no., title, sold/unsold, hammer) and a sale-level results header. Never any buyer identity.
- **Department browse** like Christie's left-nav departments — a visitor can enter through a department and see its sales/lots.
- **Editorial restraint:** the existing paper-and-ink token language, generous whitespace, large imagery, serif display type, calm hairlines. The live room and lot pages already set this tone; the new surfaces match it.
- **Lifecycle is always legible:** a visitor can tell at a glance whether a sale is upcoming, happening now, or finished — and what to do next in each state.

**All UI in this sub-project is built via the `frontend-design` skill** (see Global Constraints). Functional-but-plain pages are not acceptable here; this is the face of the product.

## Architecture & routes

All routes are **public** and reuse the existing visibility rules — `getPublishedSale` / `listPublishedSales` hide `draft` sales; the public results path never touches buyer or invoice data.

| Route | Purpose | State-awareness |
| --- | --- | --- |
| `/` | Curated landing: **Live now**, **Upcoming**, **Recent results**, **Browse by department** | sections driven by sale lifecycle |
| `/auctions` | Browse all published sales; filter by lifecycle (upcoming/live/past) and department | filter via query params |
| `/auctions?department=<slug>` | Browse-by-department | filtered listing |
| `/sales/[id]` | Sale page — **status-aware**: scheduled/live → catalogue + registration/bidding (as today); **closed → prices realized header + results** | adapts on `SaleStatus` |
| `/sales/[id]/results` | Public per-lot results table (sold/unsold + hammer); **no buyer identity** | closed sales |
| `/lots/[id]` | Lot page — **status-aware**: live → bidding (as today); **sold → "Sold for X"; unsold → "Unsold"** | adapts on `LotStatus` |

Nav (site header) gains real primary navigation: **Auctions · Results · Departments · Sign in** (account menu unchanged for signed-in users).

## Data model — lightweight departments

- Add `Sale.category: String?` — a **department slug** (nullable; existing sales are simply "uncategorised").
- A curated, pure constant in `@auction/core`:
  ```ts
  export interface Department { slug: string; label: string }
  export const DEPARTMENTS: Department[] = [
    { slug: "paintings",        label: "Paintings & Fine Art" },
    { slug: "asian-art",        label: "Asian Art" },
    { slug: "watches",          label: "Watches" },
    { slug: "jewellery",        label: "Jewellery" },
    { slug: "wine",             label: "Wine & Spirits" },
    { slug: "books",            label: "Books & Manuscripts" },
    { slug: "design",           label: "Design & Decorative Arts" },
    { slug: "collectibles",     label: "Collectibles" },
  ];
  export function departmentLabel(slug: string | null): string | null;
  export function isDepartmentSlug(slug: string): boolean;
  ```
- Department is **sale-level** (each sale belongs to a department; its lots inherit it) — matches the auction-house model and stays forward-compatible to a real `Department` table in Phase 3.
- Admin sale form gains a **Department** dropdown (the curated list); the create/update action **validates** the submitted slug against `isDepartmentSlug` (rejects/ignores unknown values), so the public browse filter only ever sees known slugs.

## Public results — never leak buyer identity

- A dedicated repo function `getPublicSaleResults(db, saleId): PublicLotResult[]` selecting **only** public-safe fields:
  ```ts
  export interface PublicLotResult {
    lotId: string; lotNumber: number; title: string;
    status: LotStatus;            // sold | unsold | paid | fulfilled | …
    hammer: number | null;        // hammer price for sold lots (rupiah)
  }
  ```
  This is **distinct** from the staff `getSaleResults` (which includes `buyerEmail`/`invoiceStatus`). The public path never *fetches* buyer or invoice data — defense-in-depth, not just omission at render.
- **Sale page (closed):** a "Prices realized" header (sale title, date, department, totals such as lots sold / total realized) + the results table, instead of the live catalogue/registration block.
- **Lot page (closed):** for `sold` (incl. `paid`/`fulfilled`) show **"Sold for {hammer}"**; for `unsold` show **"Unsold"** — replacing the bid box. Estimate still shown. No buyer.

## Discovery

- A pure helper `partitionSalesByLifecycle(sales, now): { liveNow, upcoming, past }`:
  - `liveNow` = `status === "live"`.
  - `upcoming` = `status === "scheduled"` (ordered by `startsAt` ascending — soonest first).
  - `past` = `status === "closed"` (ordered by `endsAt` descending — most recent first).
  - Pure, unit-tested; drives the home sections and the `/auctions` lifecycle filter.
- **Home** becomes a curated landing built from these partitions + a department rail. **`/auctions`** is the full browse with lifecycle + department filters (query-param driven, server-rendered). A **Results** entry surfaces past sales (prices realized).

## Access & security

- Everything is additive and public; no new auth gating. Bidding/registration paths are untouched (sign-in → register → bid; live soft-close 12s).
- **Draft sales never leak:** every new public surface goes through `getPublishedSale`/`listPublishedSales`.
- **Buyer identity never leaks:** the public results path uses `getPublicSaleResults`, which does not query buyer/invoice fields. The staff results page keeps using `getSaleResults`.
- Department slugs are validated on write, so the public filter cannot be poisoned with arbitrary values.

## Testing

- **TDD (unit):** `partitionSalesByLifecycle`; `isDepartmentSlug`/`departmentLabel`; the public-results mapping (a `sold` lot yields its hammer, an `unsold` lot yields `null`, buyer/invoice fields absent).
- **TDD (DB):** `getPublicSaleResults` against the test DB — returns the safe shape, correct hammer per outcome, and never selects buyer/invoice columns; `Sale.category` create/update round-trip + unknown-slug rejection at the action boundary.
- **Build + manual:** the status-aware sale/lot pages, the home landing, `/auctions` browse, and `/sales/[id]/results` (realtime/interactive and visual — built via `frontend-design`, verified by build + the established review pattern).
- Suites stay green; public-results tests assert buyer identity is **absent** from the public payload.

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **All UI is built via the `frontend-design` skill** — every task that creates or substantially changes a page/component invokes it. Christie's-grade UX is a requirement, not a nice-to-have. Tokens-only (paper-and-ink); no hard-coded hex; no new UI dependencies.
- **No draft-sale leakage** — public surfaces use `getPublishedSale`/`listPublishedSales`.
- **No buyer-identity leakage** — public results use `getPublicSaleResults` (buyer/invoice never queried on the public path).
- **Money** via integer rupiah + `formatRupiah` at render.
- **Reuse, don't fork:** the live room (`LotLive`/`LiveSale`), `placeBid`, registration/bid gates, and the existing sale/lot pages are extended in place (status-aware), not duplicated.
- **Next.js 15 App Router** patterns (async `params`, Server Components default); browser Supabase only in client components.
- **TDD** for pure helpers + repos; UI verified by build + review.

## Decomposition (for writing-plans)

Three focused plans, each independently shippable:

1. **Departments + discovery core + navigation** — `@auction/core` `DEPARTMENTS`/helpers + `Sale.category` (schema/types/admin form/validation) + `partitionSalesByLifecycle` + the curated **home landing** and real site **nav**. (frontend-design for home + nav.)
2. **Public results** — `getPublicSaleResults` + status-aware **sale page** (closed → prices realized) + `/sales/[id]/results` + status-aware **lot page** (sold/unsold). (frontend-design for results surfaces + lot states.)
3. **Browse `/auctions`** — the full browse page with lifecycle + department filters, and a **Results** index of past sales. (frontend-design for the browse experience.)

After this sub-project ships, proceed to **Phase 3 seller-side** (consignment intake, seller settlement/payouts, deeper KYC/AML, editorial/department landing pages — where departments may graduate to a real table).
