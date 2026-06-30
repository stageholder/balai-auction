# Layout / Christie's Consistency Pass — Design

**Status:** pending spec review.
**Part of:** the Christie's-completeness pass (sub-project 4 of 4: Search ✅ → Watchlist ✅ → Sell-with-us ✅ → **Layout pass**). Built directly on `main` (pre-production). See [[dx-no-overengineering]], [[public-experience-progress]], [[workflow-main-branch]].

## Problem

The app's chrome is mostly there — a consistent `max-w-6xl` page container (root `layout.tsx`), an organised header (wordmark + Auctions · Results · Departments · Sell + search + account), and pages built in one editorial language. Two gaps keep it from reading like christies.com:

1. **The footer is a single copyright line.** Christie's has a structured, navigable footer (browse, sell, account, legal). Ours is `© Balai — tagline`.
2. **The header's responsive behaviour is just flex-wrap.** On a phone the nav + search reflow rather than collapsing into a tidy menu, which feels unfinished next to the rest.

## Goal

Harmonise the **shared chrome** to the house standard: a proper multi-section footer and a clean responsive header — so every page (which already shares the editorial body language) sits in a consistent, Christie's-grade frame. Purely presentational; no data/logic changes. Lean — two components.

## Architecture

Two `frontend-design` passes over existing components; the root layout's container + the page bodies are already consistent and stay as-is.

### `SiteFooter` — a structured footer

Replace the one-line footer with columns of links to routes that exist, in the paper-and-ink language:
- **Browse:** Auctions (`/auctions`) · Results (`/auctions?lifecycle=past`) · Departments (`/departments`)
- **Sell:** Sell with us (`/sell`)
- **Account:** Sign in (`/sign-in`) · Saved (`/account/saved`) — auth-gated pages redirect to sign-in for anonymous users, which is acceptable; the footer stays public/server-rendered and is **not** auth-aware (lean).
- A bottom **legal row:** `© {SITE.name}`, the tagline, and a short note (e.g. an Indonesia / IDR line). No fabricated legal pages — link only to routes that exist.

### `SiteHeader` — responsive polish

Keep the existing structure (wordmark left; primary nav Auctions · Results · Departments · Sell; search; account right) and tokens. Improve small-viewport behaviour so it reads as one coherent bar rather than a wrap pile:
- On desktop: unchanged in spirit (wordmark · nav · search · account).
- On mobile: a clean collapse — the primary nav behind a compact menu affordance (a native `<details>` disclosure or a small focused client toggle — minimal JS, tokens-only), with the wordmark + a search affordance always reachable. No new dependency, no redesign of the desktop layout.

## Access & security

- Presentational only. No auth, no data, no mutations. Footer links to existing routes (auth-gated ones redirect to sign-in when anonymous — standard).

## Testing

- **Build + manual:** the footer renders its sections + legal row, all links resolve to existing routes; the header collapses cleanly on mobile and is unchanged on desktop; the existing `site-header.test.tsx` stays green (update it if the markup changes). `frontend-design`, verified by build + review. No new repos/units.
- Suites stay green: web (35), core (55), db (99), live-runner (7).

## Global Constraints

- **Node.js >= 20**, **pnpm only**; commit directly to `main`.
- **Both components via the `frontend-design` skill**; tokens-only (no hex); no new UI deps. A small `<details>`/client toggle for the mobile menu is acceptable if `frontend-design` calls for it — minimal, tokens-only.
- **Link only to routes that exist** (no fabricated About/Help/legal pages). Footer is not auth-aware (lean; gated links redirect to sign-in).
- Don't restructure the root layout container or the page bodies — they're already consistent. Keep the desktop header layout in spirit.
- **No TDD** (pure presentational chrome) — build + review; keep `site-header.test.tsx` green.

## Decomposition (for writing-plans)

One plan, 2 tasks:
1. `apps/web` — `SiteFooter`: structured multi-section footer (Browse / Sell / Account + legal row), existing routes only. (frontend-design)
2. `apps/web` — `SiteHeader`: responsive/mobile polish (collapse the nav cleanly on small viewports), desktop unchanged in spirit; keep `site-header.test.tsx` green. (frontend-design)

## After this sub-project

The Christie's-completeness pass is done (Search · Watchlist · Sell-with-us · Layout). Remaining work is the documented **production-readiness** items (real keys: Xendit invoice + disbursement, Supabase, Resend; real sanctions feed; rate-limit on `/sell`; audit trail) — not feature work.
