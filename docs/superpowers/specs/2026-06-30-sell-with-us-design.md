# Public "Sell with us" — Design

**Status:** pending spec review.
**Part of:** the Christie's-completeness pass (sub-project 3 of 4: Search ✅ → Watchlist ✅ → **Sell-with-us** → Layout pass). Built directly on `main` (pre-production). See [[dx-no-overengineering]], [[phase3-progress]], [[workflow-main-branch]].

## Problem

3A's consignment intake is **operator-entered** (staff create lots + assign consignors) — there is no way for a member of the public to *offer* an item. Christie's leads with "Sell with us": anyone can submit an item for appraisal/consignment, and a specialist follows up. We have no public entry point.

## Goal

A public **`/sell`** form where anyone submits an item (no account) → a `ConsignmentRequest` that staff triage in a review queue. Lean — a request table, a public form, a staff queue. (This is the inquiry funnel; turning an accepted request into a lot stays the operator-entered 3A flow.)

## Architecture

### `@auction/db` — `ConsignmentRequest` + repos

```prisma
enum ConsignmentRequestStatus { pending reviewing accepted declined }

model ConsignmentRequest {
  id              String                   @id @default(uuid())
  name            String
  email           String
  phone           String?
  category        String?                  // department slug
  itemTitle       String
  itemDescription String
  sellerEstimate  BigInt?                  // optional asking estimate (rupiah)
  status          ConsignmentRequestStatus @default(pending)
  createdAt       DateTime                 @default(now())
  @@index([status])
}
```
- `createConsignmentRequest(db, input): Promise<ConsignmentRequestRecord>` — input already validated at the action boundary.
- `listConsignmentRequests(db): Promise<ConsignmentRequestRecord[]>` — newest first (the staff queue, all statuses).
- `setConsignmentRequestStatus(db, id, status): Promise<ConsignmentRequestRecord>`.
- `ConsignmentRequestRecord = { id; name; email; phone: string | null; category: string | null; itemTitle; itemDescription; sellerEstimate: number | null; status: ConsignmentRequestStatus; createdAt: Date }`.

### `apps/web` — public form + staff queue (all via `frontend-design`)

- **`/sell`** (public, no auth): an inviting "Sell with us" page + a form — **name, email** (required), phone (optional), **department** (`DEPARTMENTS` select + None), **item title, item description** (required), optional **asking estimate**. Submit → `submitConsignmentRequestAction`. On success → a calm confirmation ("Thank you — a specialist will be in touch."); the form resets/hides.
- **`submitConsignmentRequestAction`** (`"use server"`): **server-side validation** — name/email/itemTitle/itemDescription required + trimmed + length-capped; a basic email shape check; `category` validated via `isDepartmentSlug` (else `null`); `sellerEstimate` optional non-negative integer (else `null`). Then `createConsignmentRequest`. Returns a typed result. (Public endpoint — see security.)
- **Header "Sell" link** → `/sell` (public).
- **`/staff/consignment-requests`** (`requireStaff`): the queue from `listConsignmentRequests` — each request's contact (name/email/phone), department label, item title/description, asking estimate (`formatRupiah`), status + the submission date; status controls **Reviewing / Accepted / Declined** (`setConsignmentRequestStatusAction`, `requireStaff` + validated enum). A staff/admin nav link. (Accepted requests are then turned into lots via the existing 3A operator flow — no automation here.)

## Access & security

- **`/sell` is public** (no auth — like a Christie's inquiry). The action **validates + length-caps all fields server-side** and stores them; it performs no privileged action. The submitter's contact details (name/email/phone) are **PII shown only on the `requireStaff` queue**, never public, never logged.
- **No spam hardening this phase** (no captcha/rate-limit) — documented as a production follow-up (alongside the other real-launch items). Length caps bound abuse.
- Staff status changes are `requireStaff` + enum-validated. `category` is validated to a known department slug or `null` (the public filter can't be poisoned).

## Testing

- **TDD (db):** `createConsignmentRequest` round-trips all fields (incl. null phone/category/estimate, default `pending`); `setConsignmentRequestStatus` transitions; `listConsignmentRequests` newest-first.
- **Build + manual:** the `/sell` form (valid submit → confirmation; missing required → inline error; bad email → error) + the staff queue (lists requests, status transitions) + the header link. `frontend-design`, verified by build + review.
- Suites stay green: db (96→), web (35→), core (55), live-runner (7).

## Global Constraints

- **Node.js >= 20**, **pnpm only**; commit directly to `main`.
- **All UI via `frontend-design`**; tokens-only; no new UI deps.
- **`/sell` public, server-validated + length-capped**; contact PII staff-only, never logged/public; staff actions `requireStaff` + enum-validated; `category` validated to a known slug or null.
- **Reuse** `DEPARTMENTS`/`departmentLabel`, `formatRupiah`, the `/staff/registrations` review shape, `requireStaff`. No image upload (lean).
- **Next.js 15** patterns. **TDD** for the repos; UI by build + review.

## Decomposition (for writing-plans)

One plan, 3 tasks:
1. `@auction/db` — `ConsignmentRequest` model + enum (migration) + `createConsignmentRequest`/`listConsignmentRequests`/`setConsignmentRequestStatus` + `ConsignmentRequestRecord` (+ tests).
2. `apps/web` — public `/sell` form + `submitConsignmentRequestAction` (server-validated) + header **Sell** link. (frontend-design)
3. `apps/web` — staff `/staff/consignment-requests` queue + `setConsignmentRequestStatusAction` + nav link. (frontend-design)

## After this sub-project

The layout/Christie's consistency pass — which harmonises the header now carrying Auctions · Results · Departments · **Sell** · search · account.
