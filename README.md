# Balai — auction house

A Christie's-style commercial auction platform: catalogue, timed + live bidding,
public prices realized, payments (Xendit, IDR), and the full seller lifecycle
(consign → KYC/AML → settle → payout). Monorepo (pnpm): `apps/web` (Next.js 15),
`packages/core` (pure engine), `packages/db` (Prisma/Postgres), `services/live-runner`.

## Prerequisites

- **Node 20+**, **pnpm** (`corepack enable`)
- **Docker** (the domain Postgres runs in a container)
- **Supabase CLI** (`supabase`) — local auth backend

## Quick start

```bash
pnpm install
pnpm setup     # Postgres + Supabase + migrate + seed + default users (idempotent)
pnpm dev       # → http://localhost:3000
```

`pnpm setup` brings up the Docker Postgres (port 5434), starts local Supabase
(API 54321 · Studio 54323 · mail 54324), applies migrations, seeds the demo
dataset, and creates the default logins below. Supabase's local keys are
already in `apps/web/.env.local`.

The demo dataset (`pnpm db:seed`) builds a presentable catalogue: a **live**
sale, two **scheduled** sales, and two **closed** sales whose realized prices
come from the real bidding engine — across Paintings, Watches, Jewellery, Asian
Art and Wine, each lot with a themed local image. It also seeds a consignor with
settled **payouts** and a few **Sell-with-us** requests, so every queue has
something to show. Re-running it resets the catalogue (your login users stay).

For **live auctions** (so a Live-mode sale auto-advances lot-by-lot), run the
runner in a second terminal:

```bash
pnpm live
```

## Default logins

`pnpm setup` (or `pnpm seed:admin`) creates these — sign in at `/sign-in`:

| Email | Role | Can do |
| --- | --- | --- |
| `admin@balai.test` | **staff** | everything: `/admin`, all `/staff` queues, payouts |
| `consignor@balai.test` | **consignor** | self-verify (`/account/verification`), get paid |
| `buyer@balai.test` | **buyer** | register, bid, save lots, pay |

Password for all: **`password123`**.

## The tour

- **Visitor:** home · `/auctions` · `/departments` · search (top bar) · a lot page · `/sell`.
- **Buyer:** Save a lot → `/account/saved`; register for a sale (staff approve in `/staff/registrations`) → bid; watch a live sale at `/live/[saleId]`; see prices realized after close.
- **Staff (`admin@balai.test`):** `/admin` create a sale + lots (Mode=Live, department, seller commission, consignor); queues `/staff/registrations`, `/staff/consignor-kyc` (try the sample name "Ivan Sample Sanctioned"), `/staff/consignment-requests`, `/admin/payouts`.
- **Seller:** as the consignor, self-submit KYC + bank at `/account/verification` → staff approve → settle in `/admin/payouts`.

## Useful scripts (root)

| Command | What |
| --- | --- |
| `pnpm setup` | one-shot local environment (idempotent) |
| `pnpm dev` | run the web app |
| `pnpm live` | run the live-auction runner |
| `pnpm db:seed` | (re)build the demo dataset — resets the catalogue |
| `pnpm seed:admin` | (re)create the default users |
| `pnpm db:studio` | open Prisma Studio (DB editor) |
| `pnpm test` | run all test suites |

## External integrations (need real keys to fully fire)

The app runs entirely on local Postgres + Supabase. **Xendit** (payment
checkout + payouts) and **Resend** (emails) use placeholder keys in
`apps/web/.env.local`, so those specific actions won't actually charge / disburse
/ email — everything else works. To exercise buyer-pay → seller-settlement
without real Xendit, simulate the webhook with `curl` (see
[`docs/operations/xendit-payments.md`](docs/operations/xendit-payments.md)).
Production setup for all integrations is in [`docs/operations/`](docs/operations/).
