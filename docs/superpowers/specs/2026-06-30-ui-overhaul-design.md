# UI/UX Overhaul — Design

**Status:** approved direction (user: "shadcn everywhere with customization that becomes our identity" + "full overhaul"). Built on `main`. Supersedes the over-minimal text-only direction. See [[christies-completeness-progress]], [[dx-no-overengineering]].

## Problem (verified)

The current UI under-built the visual layer:
- The home page and `SaleCard` render **zero images**; seeded imagery only shows on lot-detail + search/saved. The browse experience is text-only.
- The hero is pure type on cream — no imagery, no slideshow.
- Everything is locked to `max-w-6xl` centered — no full-bleed hero/sections.
- **shadcn was never set up** (no `components.json`, no Radix) — components are hand-rolled.
- Admin reuses the public chrome + a 180px text sidebar — it doesn't feel like a product.
- No route loading indicator.

Net: it reads as a quiet wireframe, not the image-led, full-canvas experience christies.com is.

## Goal

A cohesive overhaul built on **shadcn/ui themed to the Balai identity** — image-forward public pages, a distinct admin dashboard, and a global loading bar. Consistent primitives, bespoke skin.

## The Balai identity (the shadcn theme)

Codify the existing palette as shadcn's CSS-variable theme so every shadcn component inherits it:
- **Surfaces:** paper `#faf8f4` (background), white/`#fffdf9` cards, ink `#1a1a1a` (foreground), muted `#6f6a60`, hairline `#e4ded3` (border/input).
- **Primary/accent:** crimson `#9b1b30` (`--primary`, `--ring`, `--accent` emphasis). Destructive = a deeper red.
- **Type:** Cormorant Garamond for display/headings, Inter for UI/body. Ultra-wide tracking on eyebrows/nav (existing motif).
- **Radius:** small (2–4px) — editorial, not bubbly. **Density:** generous on public, compact on admin.
- These map to `--background/--foreground/--card/--popover/--primary/--secondary/--muted/--accent/--destructive/--border/--input/--ring/--radius`. The existing `paper/ink/muted/line/accent` aliases stay (so current code keeps working) and point at the same values.

## Architecture / sub-projects

### 0. Foundation (enables everything)
- Set up shadcn/ui for Tailwind v3 + Next 15: `components.json`, `tailwindcss-animate`, themed `globals.css` (the identity variables above, in shadcn's token names) + `tailwind.config` extension (semantic colors, radius), keep `cn` (`@/lib/utils`).
- Install the base component set we'll use: `button, card, input, label, textarea, select, table, dialog, dropdown-menu, badge, sheet, tabs, skeleton, sonner (toast), avatar, separator, tooltip, breadcrumb, pagination`. Restyle the two existing hand-rolled `ui/` components (button, card) to the shadcn versions (or replace).
- **Global route loading bar:** a thin crimson top-progress indicator on every navigation (in the root layout), plus `loading.tsx` Suspense skeletons for the heavier routes.

### 1. Public — image-forward, full-bleed
- **Hero/slideshow:** a full-bleed hero featuring real lot imagery from the live/featured sale — a rotating/auto-advancing showcase (a few featured lots), wordmark + headline overlaid, a clear "Browse the sale" CTA. (Sales derive a cover image from their first lot until/unless a `heroImage` field is added.)
- **`SaleCard` with cover image** + image-led grids on `/`, `/auctions`, `/departments`, sale detail (lot grid with pictures), search/saved (already image-cards — align to the new card), results (with thumbnails).
- **Full-width sections** where it serves the content (hero, featured strips, department bands) while keeping comfortable reading measure for text blocks. Not everything caps at `max-w-6xl`.
- Restyle public pages on shadcn primitives (Card, Badge, Button, Tabs) without losing the editorial type.

### 2. Admin — a real dashboard app
- A **distinct admin shell** (separate from the public `SiteHeader`): a shadcn **Sidebar** (collapsible, sectioned: Overview · Sales · Lots · Users · Payouts · Registrations · Consignor KYC · Consignment requests) + an admin **topbar** (page title, user menu, a "view site" link). Visibly "you are in the operator console."
- **Dashboard overview** with stat cards (active sales, lots live, pending payouts, KYC queue, new inquiries) + recent activity.
- **Data tables** (shadcn Table) for sales/lots/users/payouts/queues — sortable/filterable where it helps; row actions via DropdownMenu; mutations via Dialog/Sheet + Sonner toasts on success/error (replacing bare server-action forms).

### 3. Polish
- Skeletons on load, toasts on actions, empty states with imagery, hover/focus states, responsive (sidebar → Sheet on mobile), consistency sweep.

## Constraints

- **shadcn/ui** (Radix) themed to the identity; Tailwind v3; `frontend-design` skill for every surface. Keep the serif/ink/crimson identity — shadcn is the skeleton, the skin stays bespoke.
- Reuse the seeded local images (`/seed/*.jpg`); `next/image` with the `remotePatterns` already set. Sales get a cover from their first lot (helper) — no schema change required for v1.
- Don't break existing routes/data/server actions; this is a presentation-layer overhaul. Suites stay green (core 55 · db 99 · web 38 · live-runner 7).
- On `main`; lean where it counts but **visually rich** is the point here (the prior "minimal" steer does not mean text-only).

## Decomposition (plans, in order)

1. **Foundation** — shadcn init + Balai theme + base components + global loading bar. (do first; everything depends on it)
2. **Public image-forward** — hero/slideshow, SaleCard cover images, image grids, full-bleed, restyle public pages.
3. **Admin dashboard** — sidebar+topbar shell, overview stat cards, data tables, dialog/toast mutations.
4. **Polish** — skeletons, toasts, empty states, responsive, consistency sweep.

Each plan: `frontend-design` per surface, build + visual/HTTP smoke verification, per-task review, on `main`.
