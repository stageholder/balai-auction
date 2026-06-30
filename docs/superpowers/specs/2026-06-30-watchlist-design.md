# Save / Watchlist — Design

**Status:** pending spec review.
**Part of:** the Christie's-completeness pass (sub-project 2 of 4: Search ✅ → **Watchlist** → Sell-with-us → Layout pass). Built directly on `main` (pre-production). See [[dx-no-overengineering]], [[workflow-main-branch]].

## Problem

A visitor who likes a lot has no way to keep it. Christie's lets a signed-in user **save** (follow) a lot and revisit their saved lots. We have none.

## Goal

A signed-in user can **save/unsave a lot** from the lot page and see their **saved lots** in their account. Lean — a join table, a toggle, a list page.

## Architecture

### `@auction/db` — `Watchlist` join table + repos

```prisma
model Watchlist {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  lotId     String
  lot       Lot      @relation(fields: [lotId], references: [id])
  createdAt DateTime @default(now())
  @@unique([userId, lotId])
  @@index([userId])
}
```
(+ back-relations `watchlist Watchlist[]` on `User`, `watchers Watchlist[]` on `Lot`.)

- `toggleWatchlist(db, userId, lotId): Promise<{ watched: boolean }>` — deletes the row if present (→ `false`), else creates it (→ `true`). The `@@unique` makes it idempotent.
- `isWatched(db, userId, lotId): Promise<boolean>`.
- `listWatchlist(db, userId): Promise<WatchlistItem[]>` — the user's saved lots, newest-saved first, with sale title + image + estimate. `WatchlistItem = { id; lotNumber; title; saleId; saleTitle; image: string | null; status: LotStatus; estimateLow; estimateHigh }` (same shape as `SearchLotItem` — render with the same lot card).

### `apps/web` — save toggle + saved page (all via `frontend-design`)

- **Lot page (`/lots/[id]`):** a **Save / Saved** toggle. For a signed-in user, `isWatched` sets the initial state; a small client component calls `toggleWatchlistAction(lotId)`. For an anonymous visitor, the control is a **"Sign in to save"** link to `/sign-in` (no toggle). The toggle sits near the lot title/estimate, not disturbing the bid box.
- **`toggleWatchlistAction(lotId)`** (`"use server"`): `requireUser()`; toggles for the **session** user (`user.id`, never client input); returns `{ watched }`; the client updates optimistically/from the result.
- **`/account/saved`** (`requireUser`): the user's saved lots via `listWatchlist`, rendered with the shared lot card (link `/lots/[id]`); empty → a calm "You haven't saved any lots yet." with a link to `/auctions`.
- **Account nav:** a **Saved** link → `/account/saved` for any signed-in user (alongside Invoices / Verification).

## Access & security

- Save/unsave is **own-record-only**: the action derives `userId` from `requireUser()`, never from the form/client. A user can only toggle/list **their own** watchlist.
- Anonymous users can't save (the control is a sign-in link); no mutation without a session.
- No PII, no money. `@@unique([userId, lotId])` prevents duplicates.

## Testing

- **TDD (db):** `toggleWatchlist` adds then removes (idempotent via the unique constraint); `isWatched` reflects state; `listWatchlist` returns only the given user's saved lots, newest first, with `saleTitle`/`image`/estimates.
- **Build + manual:** the lot-page Save toggle (signed-in toggles; anonymous sees "Sign in to save"); `/account/saved` lists saved lots + empty state; the nav link. `frontend-design`, verified by build + review.
- Suites stay green: db (94→), web (35→), core (55), live-runner (7).

## Global Constraints

- **Node.js >= 20**, **pnpm only**; commit directly to `main`.
- **All UI via `frontend-design`**; tokens-only; no new UI deps.
- **Own-record-only** (session-derived userId); anonymous → sign-in link, no mutation.
- **Reuse** the lot card visual language (the `/search` lot result / sale-page lot card), `formatRupiah`.
- **Next.js 15** patterns; `requireUser` for the action + saved page. **TDD** for the repos; UI by build + review.

## Decomposition (for writing-plans)

One plan, 3 tasks:
1. `@auction/db` — `Watchlist` model (migration) + `toggleWatchlist`/`isWatched`/`listWatchlist` + `WatchlistItem` (+ tests).
2. `apps/web` — lot-page Save toggle (client) + `toggleWatchlistAction` (own-record) + anonymous "Sign in to save". (frontend-design)
3. `apps/web` — `/account/saved` page + account-nav **Saved** link. (frontend-design)

## After this sub-project

Sell-with-us → the layout/Christie's consistency pass.
