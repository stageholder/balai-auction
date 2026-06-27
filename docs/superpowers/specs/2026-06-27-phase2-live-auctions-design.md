# Phase 2 Design — Live Real-Time Auctions

**Date:** 2026-06-27
**Status:** Approved design, pending spec review
**Builds on:** Phase 1 (complete). Reuses `@auction/core`, `@auction/db`, `apps/web`, Supabase Auth + Broadcast, the append-only Bid ledger, and the `closeLot` engine.

---

## 0. Decisions (from brainstorming)

- **Model B — automated live-ascending.** No human auctioneer, no floor bids. A live sale runs its lots **sequentially** (one active lot at a time) on a short auto-advancing timer with anti-snipe. It is a turbo, real-time version of the Phase 1 timed model.
- **Architecture A — reuse + one stateful "live-runner" service.** The only new runtime piece is a stateful Node sequencer. Bids reuse `placeBid`; live updates reuse Supabase Broadcast; settlement reuses `closeLot`. No custom WebSocket server.
- Nothing in Phase 1 is replaced. Timed sales continue to work exactly as before.

---

## 1. Scope

A **live sale** opens its lots one at a time, each biddable for `liveLotSeconds` (default **45s**); a bid in the final **12s** (the live anti-snipe window) extends the active lot's close. When the active lot's timer expires it settles (sold/unsold + invoice) and the next queued lot opens automatically. When no queued lots remain the sale closes. Online bidders watch the current lot update in real time and place proxy/max bids exactly as in Phase 1.

**Out of scope (unchanged from the roadmap):** human auctioneer console, floor/phone bids, live video/audio feed (these were Model A, not chosen). Phase 3 remains consignment/settlement/content.

---

## 2. Data model additions (forward-compatible)

- **`Sale.mode: "timed" | "live"`** (default `"timed"`). The live-runner only processes `live`-mode sales; the existing close-lots cron only processes `timed`-mode sales. No behavior change for Phase 1 sales.
- **New `LotStatus` value `queued`** — a lot in a live sale that has not been opened yet. Live-lot lifecycle: `queued → live (active, has closesAt) → sold | unsold → paid`. Timed lots are unchanged (`live` with a fixed `closesAt`).
- **`Sale.liveLotSeconds: Int`** (default 45) — the per-lot live timer, configurable per sale. The **live anti-snipe window is a constant** `LIVE_SOFT_CLOSE_MS = 12000` in `@auction/core` (not a column — keeps the schema minimal; a per-sale override is a future enhancement).

All additions are nullable/defaulted Prisma migrations; existing rows and the Phase 1 close-lots cron are unaffected.

---

## 3. The live-runner service (the sequencer)

A new monorepo package **`services/live-runner`** — a small Node process (tsx in dev, Docker in prod) connected to the same Postgres (`DATABASE_URL`). It loops on a short interval (~1s) and, for each started, non-closed `live`-mode sale, drives the sequence:

- **No active lot** → open the lowest-`lotNumber` `queued` lot: set status `live`, `closesAt = now + liveLotSeconds`; broadcast `lot-opened`.
- **Active lot, `closesAt` passed** → call the existing **`closeLot`** (settle + invoice atomically); broadcast `lot-closed` (outcome, hammer); then open the next `queued` lot (or finish).
- **No queued lots remain** → set the sale `status = "closed"`; broadcast `sale-ended`.

**The advance decision is a pure function** — `advanceLiveSale(sale, lots, now): { kind: "open"; lotId } | { kind: "close"; lotId } | { kind: "finish" } | { kind: "wait" }` — with no I/O, unit-tested across all states (queued/active/expired/empty, anti-snipe not-yet-expired). The runner loop is thin glue: call the decision, execute via `@auction/db` (`updateLot*`/`closeLot`) + broadcast.

**Concurrency:** the runner is expected to be a single instance. `closeLot` is already atomic + idempotent (conditional claim), so even a duplicated runner cannot double-settle. Opening a lot uses a guarded update (`where status:"queued"`).

---

## 4. Bidding in live mode (reuse `placeBid`)

Bids go through the **existing `placeBid` server action**, which already enforces lot-`live` + `now < closesAt` + approved registration + `nextBidFloor`, appends to the append-only ledger, applies soft-close, and broadcasts on `lot:{lotId}`. The **only change**: the soft-close window becomes **mode-aware** — live sales use the short window (~12s) so a last-second bid nudges the timer rather than extending 2 minutes. `placeBid` reads the window from the lot's sale (`mode`/`liveSoftCloseMs`). When the live anti-snipe extends `closesAt`, the runner observes the new `closesAt` on its next tick and waits accordingly.

---

## 5. Realtime + the live UI

- The runner broadcasts **sale-level** events on a `sale:{saleId}` channel: `lot-opened` (`lotId`, `closesAt`), `lot-closed` (`lotId`, outcome, hammer), `sale-ended`. Per-lot **price** continues to ride the `lot:{lotId}` channel from `placeBid`. Both reuse Supabase Broadcast — no custom WS server.
- A new **`/live/[saleId]`** page renders the current active lot large (image, current bid, ticking countdown, bid box), a "just sold" ticker and an "up next" preview, and **auto-advances** when the sale channel pushes a transition. It is built on the existing `LotLive` client component (current price + countdown + gated bid box), extended to subscribe to the sale channel and swap the active lot.

---

## 6. Admin

Small additions to the Plan 7 admin: the sale form gains a **mode** selector (`timed`/`live`) and `liveLotSeconds`. Lots in a `live`-mode sale are created/normalized with status **`queued`** (rather than `live`). Everything else — lot CRUD, image upload, publish status — reuses Plan 7 unchanged. A staff "go live" is simply setting the sale `status = "live"` (the runner picks it up at `startsAt`).

---

## 7. Deployment

`docker-compose.yml` gains a **`live-runner`** service (depends on `postgres`; env `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). The Next.js app stays on Vercel; the runner runs in Docker Compose (or any always-on host) — the stateful path Vercel's serverless model can't host. Dev: `pnpm --filter @auction/live-runner dev` (tsx watch) alongside `pnpm --filter @auction/web dev`.

---

## 8. Testing

- **`advanceLiveSale`** pure decision function → hard unit tests (open lowest queued, close on expiry, wait during anti-snipe, finish when empty, ignore timed-mode sales).
- **`closeLot`** is already unit-tested (Plan 5); the runner reuses it.
- Mode-aware soft-close window → unit-tested in the engine/`placeBid` boundary.
- Runner loop + live UI → integration (a seeded live sale advancing through lots) + manual run against the local stack.

---

## 9. Decomposition into plans

1. **Schema + sequencing core** — `Sale.mode`/`liveLotSeconds`, `queued` `LotStatus`, mode-aware soft-close (`LIVE_SOFT_CLOSE_MS` constant), the pure `advanceLiveSale` decision function, and the `@auction/db` helpers the runner needs (open-queued-lot guarded update). All TDD.
2. **Live-runner service** — `services/live-runner` package + the loop + sale-channel broadcast + docker-compose wiring + dev script.
3. **Live bidder UI** — `/live/[saleId]` + sale-channel auto-advance, built on `LotLive`.
4. **Admin live controls** — sale mode/timer in the admin sale form + queued-lot creation for live sales.

Each plan: bite-sized TDD, executed via subagent-driven development, reviewed, merged — same rhythm as Phase 1.

---

## Forward-compatibility note

Live sales write to the **same Bid ledger and money ledger** as timed sales and settle through the **same `closeLot`/`computeInvoice`** path, so payments (Plan 6), notifications (Plan 8), and admin results (Plan 7) all work for live sales with no changes. Phase 3 (consignment, seller settlement) sits on top unchanged — the `consignor` role + seller/house ledger seams already exist.
