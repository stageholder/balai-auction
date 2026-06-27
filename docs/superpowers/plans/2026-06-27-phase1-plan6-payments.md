# Phase 1 — Plan 6: Payments (Xendit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a winning buyer pay their invoice through Xendit's hosted checkout, and reconcile payment via a verified webhook that marks the invoice (and its lot) paid.

**Architecture:** The `pending` invoices that the Plan 5 close engine already writes become payable: a `startInvoicePayment` server action creates a **Xendit hosted Invoice** (REST `POST /v2/invoices`, HTTP Basic auth) for the buyer's own invoice and redirects them to Xendit's payment page (global cards + Indonesian VA/e-wallet/QRIS). A **webhook** (`/api/webhooks/xendit`) verifies the `x-callback-token`, maps the Xendit `external_id` back to our `Invoice.id`, and idempotently flips `Invoice.status → paid` and `Lot.status → paid` in one transaction. Card-on-file is out of scope (later follow-up).

**Tech Stack:** Xendit Invoice REST API (raw `fetch`, no SDK), Next.js 15 server actions + route handler, `@auction/db` (Prisma), Vitest.

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **Payment authorization:** a buyer may only pay an invoice where `invoice.buyerId === session user id` and `invoice.status === "pending"`. Identity from `requireUser`, never client input.
- **Webhook security:** the webhook rejects (401) unless the `x-callback-token` header equals `XENDIT_CALLBACK_TOKEN`. It maps Xendit `external_id` → our `Invoice.id`; an unknown id is a safe no-op (still 200, so Xendit stops retrying).
- **Reconciliation is idempotent & atomic:** `markInvoicePaid` flips `Invoice.status` pending→paid via a conditional `updateMany(where status:"pending")` AND sets `Lot.status → paid` in one `$transaction`; a duplicate webhook delivery is a no-op.
- **Money is integer rupiah** end-to-end; the Xendit `amount` is the invoice `total` (integer IDR).
- **Xendit secret key + callback token are server-only** (`XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN`), never `NEXT_PUBLIC_*`, never logged.
- **TDD** for the DB reconciliation repos and the pure Xendit helpers (`isPaidXenditStatus`, `verifyCallbackToken`). The live Xendit create-invoice call + the webhook route are verified by build + documented manual steps (they need real Xendit test keys + a tunnel, like Plan 4's hosted-Supabase path).
- Suites must stay green: `@auction/core` (28), `@auction/db` (44→ grows), `@auction/web` (14→ grows).

---

### Task 1: Invoice payment repositories (`@auction/db`)

**Files:**
- Modify: `packages/db/src/types.ts` (add `BuyerInvoiceView`)
- Modify: `packages/db/src/repositories/invoices.ts` (add `getInvoiceById`, `setInvoiceXenditId`, `markInvoicePaid`, `listInvoicesForBuyer`)
- Modify: `packages/db/src/repositories/invoices.test.ts` (add tests)

**Interfaces:**
- Consumes: `PrismaClient`, `invoiceRowToRecord` (Plan 2), `InvoiceRecord` (Plan 2); in tests `createUser`/`createSale`/`createLot`/`updateLotStatus`/`createInvoiceWithLedger`.
- Produces:
  - `getInvoiceById(db: PrismaClient, id: string): Promise<InvoiceRecord | null>`
  - `setInvoiceXenditId(db: PrismaClient, id: string, xenditInvoiceId: string): Promise<InvoiceRecord>`
  - `markInvoicePaid(db: PrismaClient, id: string): Promise<boolean>` — true iff it transitioned pending→paid (and set the lot paid); false if not found or already non-pending.
  - `interface BuyerInvoiceView { id: string; lotId: string; lotTitle: string; total: number; status: "pending" | "paid" | "refunded"; createdAt: Date }`
  - `listInvoicesForBuyer(db: PrismaClient, buyerId: string): Promise<BuyerInvoiceView[]>` (newest first)

- [ ] **Step 1: Write the failing test**

Append to `packages/db/src/repositories/invoices.test.ts`:
```ts
import {
  getInvoiceById,
  setInvoiceXenditId,
  markInvoicePaid,
  listInvoicesForBuyer,
} from "./invoices";
import { updateLotStatus } from "./lots";

async function soldLotWithInvoice() {
  const sale = await createSale(db, {
    title: "Sale",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });
  const lot = await createLot(db, {
    saleId: sale.id,
    lotNumber: 1,
    title: "Lot 1",
    estimateLow: 1_000_000,
    estimateHigh: 2_000_000,
    startingPrice: 1_000_000,
    reserve: null,
    closesAt: new Date("2026-07-08T00:00:00.000Z"),
  });
  const buyer = await createUser(db, { email: "buyer@example.com" });
  await updateLotStatus(db, lot.id, "sold");
  const invoice = await createInvoiceWithLedger(db, {
    lotId: lot.id,
    buyerId: buyer.id,
    invoice: {
      hammer: 3_100_000,
      premium: 620_000,
      tax: 68_200,
      total: 3_788_200,
      entries: [
        { party: "buyer", kind: "hammer", amount: 3_100_000 },
        { party: "buyer", kind: "premium", amount: 620_000 },
        { party: "buyer", kind: "tax", amount: 68_200 },
      ],
    },
  });
  return { lot, buyer, invoice };
}

describe("invoice payment repositories", () => {
  it("gets an invoice by id and stores the Xendit id", async () => {
    const { invoice } = await soldLotWithInvoice();
    expect((await getInvoiceById(db, invoice.id))?.id).toBe(invoice.id);

    const updated = await setInvoiceXenditId(db, invoice.id, "xnd-inv-123");
    expect(updated.xenditInvoiceId).toBe("xnd-inv-123");
  });

  it("marks an invoice paid and flips the lot to paid (idempotently)", async () => {
    const { lot, invoice } = await soldLotWithInvoice();

    const first = await markInvoicePaid(db, invoice.id);
    expect(first).toBe(true);
    expect((await getInvoiceById(db, invoice.id))?.status).toBe("paid");
    const { getLot } = await import("./lots");
    expect((await getLot(db, lot.id))?.status).toBe("paid");

    // Duplicate webhook delivery is a no-op.
    const second = await markInvoicePaid(db, invoice.id);
    expect(second).toBe(false);
    expect((await getInvoiceById(db, invoice.id))?.status).toBe("paid");
  });

  it("returns false when marking an unknown invoice id", async () => {
    expect(
      await markInvoicePaid(db, "00000000-0000-0000-0000-000000000000")
    ).toBe(false);
  });

  it("lists a buyer's invoices with the lot title, newest first", async () => {
    const { buyer } = await soldLotWithInvoice();
    const list = await listInvoicesForBuyer(db, buyer.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.lotTitle).toBe("Lot 1");
    expect(list[0]?.total).toBe(3_788_200);
    expect(list[0]?.status).toBe("pending");
  });
});
```
(The file already imports `createSale`/`createLot`/`createUser`/`createInvoiceWithLedger` and defines `incrementTable` + `db`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/invoices.test.ts`
Expected: FAIL — the new functions are not exported.

- [ ] **Step 3: Add the view type**

In `packages/db/src/types.ts` add:
```ts
export interface BuyerInvoiceView {
  id: string;
  lotId: string;
  lotTitle: string;
  total: number;
  status: "pending" | "paid" | "refunded";
  createdAt: Date;
}
```

- [ ] **Step 4: Implement the repositories**

Append to `packages/db/src/repositories/invoices.ts`:
```ts
import type { BuyerInvoiceView } from "../types";

export async function getInvoiceById(
  db: PrismaClient,
  id: string
): Promise<InvoiceRecord | null> {
  const row = await db.invoice.findUnique({ where: { id } });
  return row ? invoiceRowToRecord(row) : null;
}

export async function setInvoiceXenditId(
  db: PrismaClient,
  id: string,
  xenditInvoiceId: string
): Promise<InvoiceRecord> {
  const row = await db.invoice.update({
    where: { id },
    data: { xenditInvoiceId },
  });
  return invoiceRowToRecord(row);
}

/** Idempotently mark an invoice paid and flip its lot to paid, in one
 *  transaction. Returns true only if this call performed the transition. */
export async function markInvoicePaid(
  db: PrismaClient,
  id: string
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id } });
    if (!invoice) return false;
    const claim = await tx.invoice.updateMany({
      where: { id, status: "pending" },
      data: { status: "paid" },
    });
    if (claim.count === 0) return false; // already paid/refunded
    await tx.lot.update({
      where: { id: invoice.lotId },
      data: { status: "paid" },
    });
    return true;
  });
}

export async function listInvoicesForBuyer(
  db: PrismaClient,
  buyerId: string
): Promise<BuyerInvoiceView[]> {
  const rows = await db.invoice.findMany({
    where: { buyerId },
    orderBy: { createdAt: "desc" },
    include: { lot: { select: { title: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    lotId: r.lotId,
    lotTitle: r.lot.title,
    total: Number(r.total),
    status: r.status as BuyerInvoiceView["status"],
    createdAt: r.createdAt,
  }));
}
```
(`Number(r.total)` converts the BigInt money column; the value is well below `Number.MAX_SAFE_INTEGER` — consistent with the `toMoney` boundary used elsewhere.)

- [ ] **Step 5: Run the db suite to verify it passes**

Run: `pnpm --filter @auction/db test`
Expected: PASS — new invoice payment tests plus all prior db tests.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): invoice payment repos (get-by-id, set Xendit id, mark paid, list for buyer)"
```

---

### Task 2: Xendit client helper + env

**Files:**
- Create: `apps/web/src/lib/xendit.ts`
- Create: `apps/web/src/lib/xendit.test.ts`
- Modify: `apps/web/.env.local.example`
- Modify: `apps/web/.env.local`

**Interfaces:**
- Consumes: nothing internal.
- Produces:
  - `isPaidXenditStatus(status: string): boolean` (true for `PAID`/`SETTLED`)
  - `verifyCallbackToken(header: string | null): boolean`
  - `createXenditInvoice(params: { externalId: string; amount: number; payerEmail: string; description: string; successRedirectUrl: string; failureRedirectUrl: string }): Promise<{ id: string; invoiceUrl: string }>`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/xendit.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { isPaidXenditStatus, verifyCallbackToken } from "./xendit";

describe("isPaidXenditStatus", () => {
  it("is true for PAID and SETTLED", () => {
    expect(isPaidXenditStatus("PAID")).toBe(true);
    expect(isPaidXenditStatus("SETTLED")).toBe(true);
  });
  it("is false for other statuses", () => {
    expect(isPaidXenditStatus("PENDING")).toBe(false);
    expect(isPaidXenditStatus("EXPIRED")).toBe(false);
  });
});

describe("verifyCallbackToken", () => {
  beforeEach(() => {
    process.env.XENDIT_CALLBACK_TOKEN = "secret-token";
  });
  it("accepts the matching token", () => {
    expect(verifyCallbackToken("secret-token")).toBe(true);
  });
  it("rejects a wrong or missing token", () => {
    expect(verifyCallbackToken("nope")).toBe(false);
    expect(verifyCallbackToken(null)).toBe(false);
  });
  it("rejects when no token is configured", () => {
    delete process.env.XENDIT_CALLBACK_TOKEN;
    expect(verifyCallbackToken("anything")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/web test src/lib/xendit.test.ts`
Expected: FAIL — cannot resolve `./xendit`.

- [ ] **Step 3: Write the helper**

`apps/web/src/lib/xendit.ts`:
```ts
import "server-only";

const XENDIT_API = "https://api.xendit.co";

/** Xendit invoice statuses that mean the buyer has paid. */
export function isPaidXenditStatus(status: string): boolean {
  return status === "PAID" || status === "SETTLED";
}

/** True when the webhook's x-callback-token matches our configured token. */
export function verifyCallbackToken(header: string | null): boolean {
  const token = process.env.XENDIT_CALLBACK_TOKEN;
  return !!token && header === token;
}

/** Create a Xendit hosted invoice and return its id + payment page URL. */
export async function createXenditInvoice(params: {
  externalId: string;
  amount: number;
  payerEmail: string;
  description: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
}): Promise<{ id: string; invoiceUrl: string }> {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new Error("XENDIT_SECRET_KEY is not set");

  const auth = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(`${XENDIT_API}/v2/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      external_id: params.externalId,
      amount: params.amount,
      payer_email: params.payerEmail,
      description: params.description,
      currency: "IDR",
      success_redirect_url: params.successRedirectUrl,
      failure_redirect_url: params.failureRedirectUrl,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Xendit createInvoice failed: ${res.status} ${detail}`);
  }
  const data = (await res.json()) as { id: string; invoice_url: string };
  return { id: data.id, invoiceUrl: data.invoice_url };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @auction/web test src/lib/xendit.test.ts`
Expected: PASS — the pure helpers (the create call is not exercised here).

- [ ] **Step 5: Add env**

Append to `apps/web/.env.local.example`:
```
# Xendit payments (use TEST/sandbox keys for development).
XENDIT_SECRET_KEY="xnd_development_..."
# The webhook verification token from the Xendit dashboard (Settings → Webhooks).
XENDIT_CALLBACK_TOKEN="your-xendit-callback-token"
# Absolute base URL used for Xendit success/failure redirects.
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```
Add real local values to `apps/web/.env.local` (your Xendit **test** secret key + a callback token you choose and also paste into the Xendit dashboard; `NEXT_PUBLIC_APP_URL=http://localhost:3000`). These are required to exercise payments live but not for the unit tests above.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/xendit.ts apps/web/src/lib/xendit.test.ts apps/web/.env.local.example
git commit -m "feat(web): Xendit client helper (create invoice, status + token helpers)"
```

---

### Task 3: Pay flow — action, My Invoices page, Pay button

**Files:**
- Create: `apps/web/src/app/invoices/actions.ts`
- Create: `apps/web/src/app/invoices/pay-button.tsx` (client)
- Create: `apps/web/src/app/invoices/page.tsx`
- Modify: `apps/web/src/components/account-nav.tsx` (add an "Invoices" link for signed-in users)

**Interfaces:**
- Consumes: `requireUser`, `getCurrentUser` (Plan 4); `prisma`, `getInvoiceById`, `setInvoiceXenditId`, `listInvoicesForBuyer` (`@/lib/db`); `createXenditInvoice` (Task 2); `formatRupiah`, `Button` (Plan 3).
- Produces:
  - server action `startInvoicePayment(invoiceId: string): Promise<{ ok: boolean; url?: string; error?: string }>`
  - `PayButton({ invoiceId })` (client); the `/invoices` page.

**Note (visual craft):** Use the frontend-design skill to present the invoices list cleanly (lot, amount in tabular numerals, status, Pay action) in the paper-and-ink language, tokens-only.

- [ ] **Step 1: Write the server action**

`apps/web/src/app/invoices/actions.ts`:
```ts
"use server";

import { prisma, getInvoiceById, setInvoiceXenditId } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createXenditInvoice } from "@/lib/xendit";

export async function startInvoicePayment(
  invoiceId: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const user = await requireUser();

  const invoice = await getInvoiceById(prisma, invoiceId);
  if (!invoice || invoice.buyerId !== user.id) {
    return { ok: false, error: "Invoice not found." };
  }
  if (invoice.status !== "pending") {
    return { ok: false, error: "This invoice is not awaiting payment." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const xendit = await createXenditInvoice({
      externalId: invoice.id,
      amount: invoice.total,
      payerEmail: user.email,
      description: `Payment for lot ${invoice.lotId}`,
      successRedirectUrl: `${appUrl}/invoices?paid=1`,
      failureRedirectUrl: `${appUrl}/invoices?failed=1`,
    });
    await setInvoiceXenditId(prisma, invoice.id, xendit.id);
    return { ok: true, url: xendit.invoiceUrl };
  } catch {
    return { ok: false, error: "Could not start payment. Please try again." };
  }
}
```

- [ ] **Step 2: Write the pay button (client)**

`apps/web/src/app/invoices/pay-button.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startInvoicePayment } from "./actions";

export function PayButton({ invoiceId }: { invoiceId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPay() {
    setError(null);
    setPending(true);
    try {
      const result = await startInvoicePayment(invoiceId);
      if (result.ok && result.url) {
        window.location.href = result.url;
        return;
      }
      setError(result.error ?? "Could not start payment.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="accent" onClick={onPay} disabled={pending}>
        Pay now
      </Button>
      {error ? <span className="text-xs text-accent">{error}</span> : null}
    </div>
  );
}
```

- [ ] **Step 3: Write the My Invoices page**

`apps/web/src/app/invoices/page.tsx`:
```tsx
import { prisma, listInvoicesForBuyer } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatRupiah } from "@/lib/format";
import { PayButton } from "./pay-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  refunded: "Refunded",
};

export default async function InvoicesPage() {
  const user = await requireUser();
  const invoices = await listInvoicesForBuyer(prisma, user.id);

  return (
    <div>
      <h1 className="mb-8 text-3xl">Your invoices</h1>
      {invoices.length === 0 ? (
        <p className="text-muted">You have no invoices yet.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="text-ink">{inv.lotTitle}</p>
                <p className="tnum text-sm text-muted">
                  {formatRupiah(inv.total)} · {STATUS_LABEL[inv.status] ?? inv.status}
                </p>
              </div>
              {inv.status === "pending" ? <PayButton invoiceId={inv.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add an Invoices link to the account nav**

In `apps/web/src/components/account-nav.tsx`, inside the signed-in branch (the `<div className="flex items-center gap-4">` that shows email + SignOutButton), add an Invoices link before the email span:
```tsx
      <Link
        href="/invoices"
        className="text-xs uppercase tracking-[0.15em] text-muted hover:text-ink"
      >
        Invoices
      </Link>
```
(`Link` is already imported in that file.)

- [ ] **Step 5: Build and verify**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; existing tests still pass (the xendit unit tests from Task 2 included). Manual (with Xendit **test** keys in `.env.local`, signed in as a buyer who won a lot — set a paid-eligible invoice by closing a sold lot via the cron): open `/invoices` → "Pay now" → redirected to the Xendit test checkout.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/invoices apps/web/src/components/account-nav.tsx
git commit -m "feat(web): invoice payment flow (My Invoices + Pay now via Xendit)"
```

---

### Task 4: Xendit webhook route + reconciliation + ops doc

**Files:**
- Create: `apps/web/src/app/api/webhooks/xendit/route.ts`
- Create: `docs/operations/xendit-payments.md`

**Interfaces:**
- Consumes: `prisma`, `markInvoicePaid` (`@/lib/db`); `verifyCallbackToken`, `isPaidXenditStatus` (Task 2).
- Produces: `POST /api/webhooks/xendit`.

- [ ] **Step 1: Write the webhook route**

`apps/web/src/app/api/webhooks/xendit/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { prisma, markInvoicePaid } from "@/lib/db";
import { verifyCallbackToken, isPaidXenditStatus } from "@/lib/xendit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyCallbackToken(request.headers.get("x-callback-token"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: { external_id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const { external_id, status } = body;
  if (!external_id || !status) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
  }

  // external_id is our Invoice.id. Acknowledge (200) regardless so Xendit
  // stops retrying; only paid statuses transition the invoice.
  if (isPaidXenditStatus(status)) {
    const transitioned = await markInvoicePaid(prisma, external_id);
    return NextResponse.json({ ok: true, transitioned });
  }
  return NextResponse.json({ ok: true, ignored: status });
}
```

- [ ] **Step 2: Write the operations doc**

`docs/operations/xendit-payments.md`:
```markdown
# Xendit payments

Buyers pay won-lot invoices via Xendit hosted checkout; a webhook reconciles
payment.

## Env (apps/web/.env.local)
- `XENDIT_SECRET_KEY` — Xendit **test** secret key for development.
- `XENDIT_CALLBACK_TOKEN` — a token you set; paste the same value into the
  Xendit dashboard webhook settings.
- `NEXT_PUBLIC_APP_URL` — absolute base URL for success/failure redirects.

## Flow
1. A lot closes `sold` (Plan 5 cron) → `Invoice` row written `status: pending`.
2. Buyer opens `/invoices` → **Pay now** → `startInvoicePayment` creates a
   Xendit invoice (`external_id` = our `Invoice.id`) and redirects to
   `invoice_url`.
3. Buyer pays on Xendit's page (cards / VA / e-wallet / QRIS).
4. Xendit POSTs the invoice webhook to `/api/webhooks/xendit` with header
   `x-callback-token`. We verify it, then `markInvoicePaid` flips
   `Invoice.status → paid` and `Lot.status → paid` (idempotent).

## Webhook setup (Xendit dashboard)
Set the **Invoices** callback URL to `https://<your-app>/api/webhooks/xendit`
and the callback token to `XENDIT_CALLBACK_TOKEN`.

## Local testing
Expose localhost with a tunnel (e.g. `ngrok http 3000`) and point the Xendit
dashboard webhook at the tunnel URL. Simulate a paid event:

    curl -X POST http://localhost:3000/api/webhooks/xendit \
      -H "x-callback-token: $XENDIT_CALLBACK_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"external_id":"<our-invoice-id>","status":"PAID"}'

A wrong/absent token returns 401; a paid status flips the invoice + lot; a
non-paid status is acknowledged (200) and ignored.
```

- [ ] **Step 3: Build and verify the gate**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; all tests pass. Manual (app running, a pending invoice id from the DB):
- `curl -i -X POST localhost:3000/api/webhooks/xendit -H "Content-Type: application/json" -d '{"external_id":"x","status":"PAID"}'` → `401` (no token).
- with `-H "x-callback-token: $XENDIT_CALLBACK_TOKEN"` and a real pending invoice id → `200 {"ok":true,"transitioned":true}`; the invoice + lot are now `paid`. A second identical call → `{"ok":true,"transitioned":false}` (idempotent).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/webhooks docs/operations/xendit-payments.md
git commit -m "feat(web): Xendit payment webhook with token verification and reconciliation"
```

---

## Self-Review

**Spec coverage (against the Phase 1 design doc §6):**
- "winning-invoice payment paid via Xendit" → Task 3 (hosted checkout) + Task 1 (`markInvoicePaid`). Settles in IDR; Xendit's hosted page provides global cards + Indonesian methods.
- "Xendit webhook handling (sandbox-tested)" → Task 4 (token-verified webhook) + the documented manual flow; reconciliation logic (`markInvoicePaid`) is unit-tested at the DB layer (idempotent + atomic).
- Buyer's premium + tax were already computed into the invoice at close (Plan 5); Plan 6 only collects it.
- **Card-on-file deferred** (per the user's Plan 6 decision) — `Registration.xenditCardToken` stays nullable; refunds (the `refund` ledger kind exists) are a later follow-up.
- Authorization: pay action requires the invoice to belong to the session user and be pending; webhook requires the callback token.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step has complete code. The live Xendit create-invoice call + webhook route are verified by build + documented manual steps (stated), with the money-transition logic (`markInvoicePaid`) and the pure helpers under automated test.

**Type consistency:** `markInvoicePaid`/`getInvoiceById`/`setInvoiceXenditId`/`listInvoicesForBuyer`/`BuyerInvoiceView` defined once (Task 1) and consumed in Tasks 3–4. `isPaidXenditStatus`/`verifyCallbackToken`/`createXenditInvoice` signatures match between Task 2 and Tasks 3–4. `external_id` ↔ our `Invoice.id` mapping is consistent between `startInvoicePayment` (sets `externalId: invoice.id`) and the webhook (`markInvoicePaid(prisma, external_id)`). Repo calls match Plan 2 (`createInvoiceWithLedger`, `updateLotStatus`, `getLot`).

---

## Handoff notes for later plans

- **Refunds:** the `refund` ledger kind + `Invoice.status "refunded"` exist; a refund flow (Xendit refund API + ledger entries + `Lot.status` handling) is a follow-up.
- **Card-on-file:** the deferred registration trust-anchor (Xendit tokenization → `Registration.xenditCardToken`) — a later task.
- **Webhook hardening:** consider `crypto.timingSafeEqual` for the callback token and idempotency keys/audit logging of raw webhook deliveries before high volume.
- **Plan 7 (Admin):** a staff view of invoice/payment status per lot; manual mark-paid / refund controls.
- **Prod:** set `XENDIT_SECRET_KEY` (live), `XENDIT_CALLBACK_TOKEN`, `NEXT_PUBLIC_APP_URL`, and the Xendit dashboard webhook URL in the hosted environment.

---

## Next Plans (Phase 1 continuation)

7. **Admin** — staff console (sales/lots CRUD, Supabase Storage image uploads, user management to promote staff, registration review, results + payment status).
8. **Notifications** — Resend transactional emails (registration approved, outbid, sale ending, won/lost, payment receipt).
