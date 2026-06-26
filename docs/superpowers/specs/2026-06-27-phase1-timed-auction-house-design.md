# Phase 1 Design — Timed-Auction House (MVP)

**Date:** 2026-06-27
**Status:** Approved design, pending spec review
**Project:** Auction bidding platform (Christie's-style auction *house* model)

---

## 0. Context & Roadmap

This is a real, commercial single-auction-house platform (the operator is the
house and sole seller, on a consignment model — buyers are vetted, sellers are
the house/its consignors). It launches Indonesia-based, settles in **IDR via
Xendit**, and accepts global card payments plus Indonesian local methods.

The full product (the eventual Phase 3 presentation) is built in three phases.
**Every phase is built to survive to Phase 3 — no throwaway scaffolding.** Phase 1
designs the data model and architecture for the Phase 3 destination but only
*builds* the Phase 1 slice.

| Phase | Scope | Deploy target |
|---|---|---|
| **1 (this doc)** | Timed online auctions: catalog, accounts, register-to-bid, proxy bidding, soft-close, winning-invoice payment via Xendit, staff admin, email notifications | Vercel **or** Docker Compose |
| **2** | Live real-time auctions: auctioneer console, second-by-second bidding, online-vs-floor, WebSockets | Docker Compose (stateful server) |
| **3** | Consignment intake, seller settlement/payouts, deeper KYC/AML, tiered premium, editorial content, results archive | Either |

Phases 2 and 3 **extend** Phase 1's catalog, accounts, ledgers, and payment core.
Nothing is deleted.

---

## 1. What Phase 1 Is

A complete, money-taking auction house running **timed online auctions**.
Buyers browse a catalog, register to bid on a sale, place proxy (max) bids, win
lots, and pay an invoice. Staff catalog lots, run sales, approve bidders, and
reconcile payments.

---

## 2. Architecture (forward-compatible bones)

```
apps/web        → Next.js (App Router, TypeScript) — UI + API routes
                  Runs unchanged on Vercel and in Docker Compose.
packages/core   → Pure-TypeScript domain layer.
                  Auction engine, ledgers, money math. NO framework deps.
                  Phase 2's live WebSocket server imports this verbatim.
packages/db     → Prisma schema + migrations. The single Postgres (Supabase).
```

**Supabase** provides three things, all of which carry to Phase 3:
- **Postgres** — the one database; Prisma owns the schema/migrations.
- **Auth** — accounts, email/social login, sessions. "Register-to-bid" approval
  and KYC status are layered on top.
- **Storage** — lot images, condition reports, catalog PDFs.

**Live price updates without a stateful server:** Phase 1 uses **Supabase
Realtime**. The lot page subscribes to bid-ledger inserts and updates instantly.
This keeps Phase 1 fully Vercel-friendly. Phase 2's dedicated WebSocket
auctioneer engine is added later and reuses `packages/core` — it does not
replace Realtime, it supplements it for sub-second auctioneer control.

**Lot closing:** a `close-due-lots` job (Vercel Cron on Vercel; a small Node
worker process in Docker Compose) calls the *same* domain function
`closeLot()`. Soft-close simply recomputes `closesAt`. The trigger differs per
deploy target; the logic is identical and lives in `packages/core`.

**Deployment parity:** both targets run the same Next.js app against the same
Supabase project. Docker Compose path may additionally self-host Supabase for a
fully-local stack; the app code does not change.

---

## 3. Data Model (seams that carry to Phase 3)

Stored in Postgres, managed by Prisma. Key entities:

- **User** — backed by Supabase Auth; adds `role: buyer | staff | consignor`.
  `consignor` exists from day one but is unused until Phase 3.
- **Sale** — title, start/end dates, `buyersPremiumPct`, `taxPct`,
  increment-table reference, status.
- **Lot** — sale ref, title, description, images, `estimateLow`/`estimateHigh`,
  **`reserve` (hidden from buyers)**, `closesAt`, status
  (`live | sold | unsold | paid | fulfilled`), `consignorId` (nullable; Phase 3).
- **Bid** — **append-only event ledger.** Fields: lot, bidder, `maxAmount`
  (the proxy/max), `amount` (the revealed bid), `type`
  (`bid | proxy_auto | reserve_check`), `createdAt`. **Rows are never updated,
  only inserted.** Both the Phase 1 proxy engine and the Phase 2 live engine
  write to this same table.
- **Registration** — user ↔ sale approval, `kycStatus`, Xendit card-on-file
  token.
- **LedgerEntry** — **money ledger** with `party: buyer | seller | house` and
  `kind: premium | hammer | tax | deposit | payout | refund`. Phase 1 writes
  only buyer/house entries; Phase 3 settlement adds seller entries — no rebuild.
- **Invoice** — generated on win: hammer + premium + tax; Xendit payment status.

The append-only **Bid** ledger and the party-aware **LedgerEntry** are the two
critical forward-compatible seams. Get these right and Phases 2–3 are additive.

---

## 4. Core Flows

- **Browse** — departments → sale → lot detail (estimate, current bid, time
  left, bid history). Public, no login required.
- **Register to bid** — sign up (Supabase Auth) → submit ID + card-on-file
  (Xendit) → staff approves. Card-on-file is the Phase 1 trust anchor; full AML
  is Phase 3.
- **Bid** — enter a max → engine runs proxy logic against the bid ledger + the
  sale's increment table → soft-close check (a bid within the final window
  extends `closesAt`) → Supabase Realtime pushes the new price to all viewers.
- **Close & settle** — the `close-due-lots` job closes due lots → reserve check
  (below reserve ⇒ `unsold`) → winner determined → invoice generated (hammer +
  premium + tax) → buyer pays via Xendit → lot marked `paid`.
- **Notify (email via Resend)** — registration approved, outbid, sale ending
  soon, won/lost, invoice + payment receipt.

### Bidding ruleset (timed auctions)
1. **English ascending** — price only rises; highest bid at close wins.
2. **Proxy/max bidding** — bidder enters a maximum; the system bids on their
   behalf one increment at a time, revealing only as much as needed to stay
   ahead.
3. **Increment table** — minimum raise scales with price; configurable per sale.
4. **Reserve price** — hidden per-lot minimum; below it the lot is `unsold`.
5. **Low/high estimate** — displayed publicly; display-only, no logic.
6. **Soft-close / anti-snipe** — a bid in the final **2 minutes** extends that
   lot's close by 2 minutes.
7. **Buyer's premium** — **20%** default (configurable per sale), added to the
   hammer price to form the invoice.

---

## 5. Admin (staff)

A plain authenticated staff UI (no separate CMS): create departments/sales/lots
(images, estimates, reserves, increments), open/close sales, approve
registrations, watch live bids, mark invoices paid/fulfilled.

---

## 6. Money & Compliance (honest Phase 1 scope)

- Settle in **IDR**; accept **global cards + Indonesian methods** via Xendit.
- **Buyer's premium 20%** default + **PPN tax %** configurable per sale, applied
  on the invoice.
- **In scope:** card-on-file, winning-invoice payment, receipts, refunds via
  Xendit, Xendit webhook handling (sandbox-tested).
- **Deferred to Phase 3 (explicitly):** seller payouts/consignment settlement,
  tiered buyer's premium, full KYC/AML, multi-currency display. The *schema*
  already supports them; the *workflows* come later.

---

## 7. Design Language (Christie's-like)

The look is half the product. Foundation is **shadcn/ui** (accessible Radix
primitives copied into the repo, fully restyled — no framework lock-in) on
**Tailwind**, with a custom luxury design language on top:

- **Editorial restraint** — generous whitespace; lot photography is the hero;
  minimal UI chrome. No gradients, glassmorphism, or generic-AI tells.
- **Typography as identity** — an elegant high-contrast **serif** for
  display/headings paired with a clean neutral **sans** for UI/body;
  **tabular numerals** for prices and bid amounts.
- **Paper-and-ink palette** — near-black ink on warm off-white; a single
  restrained accent (Christie's-style red) used only for live/bid states.
- **Gallery catalog** — large full-bleed lot imagery, zoomable condition views,
  "est. Rp X–Y" set in the display serif.
- **Quiet, precise micro-interactions** — countdown timers, live-bid pulses via
  Supabase Realtime, deliberate soft-close extensions.

Pixel-level craft is executed during the build via the frontend-design skill;
this section fixes the *direction* so the frontend setup is not throwaway.

---

## 8. Testing

- `packages/core` is pure TypeScript → unit-tested hard: proxy-bid resolution,
  increment math, soft-close extension, reserve logic, money/ledger math. This
  is where bugs cost real money, so it gets the most coverage.
- Integration tests on the close-and-settle flow and Xendit webhook handling
  against the Xendit sandbox.

---

## 9. Explicitly NOT in Phase 1

Live real-time auctioneer console (Phase 2); consignment intake and seller
settlement (Phase 3); editorial content; tiered premiums; multi-currency
display. None are blocked by Phase 1 — all extend it.

---

## 10. Tech Stack Summary

| Concern | Choice |
|---|---|
| App framework | Next.js (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind, custom luxury design language |
| Domain core | `packages/core` — pure TypeScript, framework-free |
| Database | Supabase Postgres + Prisma |
| Auth | Supabase Auth |
| File storage | Supabase Storage |
| Realtime | Supabase Realtime (Phase 1 live price updates) |
| Payments | Xendit (IDR settlement; global cards + Indonesian methods) |
| Email | Resend (transactional) |
| Scheduled close | Vercel Cron (Vercel) / Node worker (Docker Compose) |
| Deploy | Vercel **or** Docker Compose |
