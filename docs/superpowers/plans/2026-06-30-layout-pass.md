# Layout / Christie's Consistency Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A structured Christie's-style footer + a responsive header polish — harmonising the shared chrome. Purely presentational, lean, two components.

**Tech Stack:** Next.js 15, `frontend-design`.

## Global Constraints
- **pnpm only**; **commit directly to `main`**. Both components via the **`frontend-design` skill**; tokens-only (no hex); no new UI deps.
- **Link only to routes that EXIST** (/auctions, /auctions?lifecycle=past, /departments, /sell, /search, /sign-in, /account/saved). No fabricated About/Help/legal pages. Footer is NOT auth-aware (gated links redirect to sign-in — fine).
- Don't restructure the root layout container or page bodies. Keep the desktop header layout in spirit. No new repos/units — build + review. Keep `site-header.test.tsx` green.
- Suites green: web (35), core (55), db (99), live-runner (7).

---

### Task 1: Structured SiteFooter (frontend-design)

**Files:** Modify `apps/web/src/components/site-footer.tsx`.

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Read** `apps/web/src/components/site-footer.tsx` (current one-liner), `@/lib/site` (SITE.name/tagline), the design tokens, and the root `layout.tsx` (the footer sits below `main`).
- [ ] **Step 2: Replace** the footer with a structured multi-column footer in the paper-and-ink language:
  - **Browse** column: Auctions (`/auctions`), Results (`/auctions?lifecycle=past`), Departments (`/departments`).
  - **Sell** column: Sell with us (`/sell`).
  - **Account** column: Sign in (`/sign-in`), Saved (`/account/saved`).
  - A bottom **legal row**: `© {SITE.name}`, the tagline, and a short Indonesia/IDR note. Link only to existing routes.
  - Responsive (columns stack on mobile). Tokens-only (no hex/new deps). Keep it within the `max-w-6xl` container idiom.
- [ ] **Step 3: Build + verify** — `pnpm --filter @auction/web build` + `pnpm --filter @auction/web test` (35 green). Manual: footer shows the sections + legal row; every link resolves.
- [ ] **Step 4: Commit** — `git add apps/web/src/components/site-footer.tsx` + `git commit -m "feat(web): structured site footer (browse/sell/account)"`.

---

### Task 2: Responsive SiteHeader polish (frontend-design)

**Files:** Modify `apps/web/src/components/site-header.tsx`; update `apps/web/src/components/site-header.test.tsx` if markup changes (keep it green).

**REQUIRED:** Build with the **`frontend-design` skill**.

- [ ] **Step 1: Read** `apps/web/src/components/site-header.tsx` (current: wordmark + nav Auctions/Results/Departments/Sell + search form + accountSlot) + its test + tokens.
- [ ] **Step 2: Improve responsive behaviour** — desktop layout unchanged in spirit (wordmark · nav · search · account). On small viewports, collapse the primary nav cleanly behind a compact menu affordance (a native `<details>` disclosure or a small focused client toggle — minimal JS, tokens-only, no new deps), keeping the wordmark + a search affordance reachable. Keep all existing links/targets + the search GET form + `accountSlot`. Tokens-only.
- [ ] **Step 3: Build + verify** — build + test (35 green; update `site-header.test.tsx` to match new markup if needed, keep it asserting the wordmark + key nav). Manual: desktop unchanged; mobile collapses cleanly; search + nav reachable.
- [ ] **Step 4: Commit** — `git add apps/web/src/components/site-header.tsx apps/web/src/components/site-header.test.tsx` + `git commit -m "feat(web): responsive header polish (mobile nav collapse)"`.

---

## Self-Review
- Spec coverage: structured footer → Task 1; responsive header → Task 2. Existing routes only; tokens-only; `frontend-design`; no layout-container/page-body changes; tests stay green — Global Constraints + per-task contracts.
- Placeholder scan: no TBD. UI tasks carry complete contracts + the `frontend-design` mandate (visual specifics produced by that skill).
- Type consistency: n/a (presentational). Footer/header link targets all exist.
