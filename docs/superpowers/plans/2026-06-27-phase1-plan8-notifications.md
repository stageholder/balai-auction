# Phase 1 — Plan 8: Notifications (Resend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send transactional emails on the key auction events — registration approved/rejected, outbid, won, and payment receipt — via Resend, hooked into the existing state transitions.

**Architecture:** A server-only email layer: `sendEmail` posts to the Resend REST API; pure `build*Email` content functions (unit-tested) produce subject + HTML; thin `notify*` wrappers call them. Each notification fires off an existing idempotent transition point — registration decision (staff action), outbid (placeBid), won (close-lots cron, per sold lot), receipt (Xendit webhook, on the paid transition). Email failures are logged and never thrown into the triggering action.

**Tech Stack:** Resend REST API (raw `fetch`, no SDK), Next.js 15 server code, `@auction/db`, Vitest.

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **Emails never break the triggering action.** `sendEmail` swallows + logs all errors and is a no-op (with a warning) when Resend is unconfigured. A failed/declined email must not roll back a bid, payment, or approval.
- **Server-only:** `@/lib/email.ts` and `@/lib/notifications.ts` are `import "server-only"`; the Resend key is `RESEND_API_KEY` (never `NEXT_PUBLIC_`), never logged.
- **Sends are tied to idempotent transitions** so an email isn't sent twice: registration decision fires from the staff action; outbid only when the displaced leader changes; won from the cron per newly-sold lot; receipt only when `markInvoicePaid` actually transitioned (returned `true`).
- **Recipient identity** comes from the domain `User` (looked up server-side), never from client input.
- **Money in emails** is rendered via `formatRupiah`.
- **TDD** for the pure `build*Email` content functions; the Resend send + the wiring are verified by build + documented manual steps (need `RESEND_API_KEY` + a verified from-address).
- **Out of scope (deferred):** "sale ending soon" reminders (needs a dedicated scheduled job + send-once tracking) and per-loser "lost" emails (the outbid email already covers the competitive signal; a close-time loser sweep needs bidder enumeration). Noted in the handoff.
- Suites must stay green: `@auction/core` (28), `@auction/db` (54), `@auction/web` (19→ grows).

---

### Task 1: Email layer + content builders

**Files:**
- Create: `apps/web/src/lib/email.ts`
- Create: `apps/web/src/lib/notifications.ts`
- Create: `apps/web/src/lib/notifications.test.ts`
- Modify: `apps/web/.env.local.example`, `apps/web/.env.local`

**Interfaces:**
- Consumes: `formatRupiah` (Plan 3).
- Produces:
  - `sendEmail(msg: { to: string; subject: string; html: string }): Promise<void>`
  - Pure builders returning `{ subject: string; html: string }`:
    - `buildRegistrationDecisionEmail(saleTitle: string, approved: boolean)`
    - `buildOutbidEmail(lotTitle: string, lotUrl: string)`
    - `buildWonEmail(lotTitle: string, lotUrl: string)`
    - `buildReceiptEmail(lotTitle: string, total: number)`
  - `notify*` wrappers: `notifyRegistrationDecision(to, saleTitle, approved)`, `notifyOutbid(to, lotTitle, lotId)`, `notifyWon(to, lotTitle, lotId)`, `notifyReceipt(to, lotTitle, total)`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/notifications.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  buildRegistrationDecisionEmail,
  buildOutbidEmail,
  buildWonEmail,
  buildReceiptEmail,
} from "./notifications";

describe("buildRegistrationDecisionEmail", () => {
  it("approved mentions the sale and approval", () => {
    const { subject, html } = buildRegistrationDecisionEmail("Modern Art", true);
    expect(subject).toMatch(/approved/i);
    expect(html).toContain("Modern Art");
  });
  it("rejected mentions the sale and rejection", () => {
    const { subject, html } = buildRegistrationDecisionEmail("Modern Art", false);
    expect(subject).toMatch(/not approved|declined|rejected/i);
    expect(html).toContain("Modern Art");
  });
});

describe("buildOutbidEmail", () => {
  it("names the lot and links to it", () => {
    const { subject, html } = buildOutbidEmail("Coastal Morning", "https://x/lots/1");
    expect(subject).toMatch(/outbid/i);
    expect(html).toContain("Coastal Morning");
    expect(html).toContain("https://x/lots/1");
  });
});

describe("buildWonEmail", () => {
  it("congratulates and links to the lot", () => {
    const { subject, html } = buildWonEmail("Coastal Morning", "https://x/lots/1");
    expect(subject).toMatch(/won|congratulations/i);
    expect(html).toContain("Coastal Morning");
    expect(html).toContain("https://x/lots/1");
  });
});

describe("buildReceiptEmail", () => {
  it("shows the lot and the formatted total", () => {
    const { subject, html } = buildReceiptEmail("Coastal Morning", 3_788_200);
    expect(subject).toMatch(/payment|receipt/i);
    expect(html).toContain("Coastal Morning");
    expect(html).toMatch(/Rp\s?3\.788\.200/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/web test src/lib/notifications.test.ts`
Expected: FAIL — cannot resolve `./notifications`.

- [ ] **Step 3: Write the email sender**

`apps/web/src/lib/email.ts`:
```ts
import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

/** Send a transactional email via Resend. Never throws into the caller: a
 *  failed or unconfigured email must not break the action that triggered it. */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) {
    console.warn(
      `Resend not configured (RESEND_API_KEY/RESEND_FROM); skipping email to ${msg.to}`
    );
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Resend send failed (${res.status}) to ${msg.to}: ${detail}`);
    }
  } catch (err) {
    console.error(`Resend send error to ${msg.to}:`, err);
  }
}
```

- [ ] **Step 4: Write the content builders + notify wrappers**

`apps/web/src/lib/notifications.ts`:
```ts
import "server-only";
import { formatRupiah } from "@/lib/format";
import { sendEmail } from "@/lib/email";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function wrap(heading: string, body: string): string {
  return `<div style="font-family:Georgia,serif;color:#1a1a1a;max-width:480px">
  <h1 style="font-size:20px;font-weight:500">${heading}</h1>
  <div style="font-size:14px;line-height:1.6;color:#3a3a3a">${body}</div>
  <p style="margin-top:24px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#9a9a9a">BALAI — Lelang Seni &amp; Koleksi</p>
</div>`;
}

export function buildRegistrationDecisionEmail(
  saleTitle: string,
  approved: boolean
): { subject: string; html: string } {
  if (approved) {
    return {
      subject: `You're approved to bid — ${saleTitle}`,
      html: wrap(
        "Registration approved",
        `<p>You are now approved to bid in <strong>${saleTitle}</strong>. We wish you the best of luck.</p>`
      ),
    };
  }
  return {
    subject: `Registration not approved — ${saleTitle}`,
    html: wrap(
      "Registration not approved",
      `<p>Unfortunately your registration for <strong>${saleTitle}</strong> was not approved. Please contact us if you have questions.</p>`
    ),
  };
}

export function buildOutbidEmail(
  lotTitle: string,
  lotUrl: string
): { subject: string; html: string } {
  return {
    subject: `You've been outbid — ${lotTitle}`,
    html: wrap(
      "You've been outbid",
      `<p>Another bidder has surpassed your maximum on <strong>${lotTitle}</strong>.</p>
       <p><a href="${lotUrl}">View the lot and raise your bid →</a></p>`
    ),
  };
}

export function buildWonEmail(
  lotTitle: string,
  lotUrl: string
): { subject: string; html: string } {
  return {
    subject: `Congratulations — you won ${lotTitle}`,
    html: wrap(
      "Congratulations",
      `<p>You are the winning bidder for <strong>${lotTitle}</strong>.</p>
       <p><a href="${lotUrl}">View the lot →</a> An invoice is now available under <a href="${appUrl()}/invoices">Your invoices</a>.</p>`
    ),
  };
}

export function buildReceiptEmail(
  lotTitle: string,
  total: number
): { subject: string; html: string } {
  return {
    subject: `Payment received — ${lotTitle}`,
    html: wrap(
      "Payment received",
      `<p>We have received your payment of <strong>${formatRupiah(total)}</strong> for <strong>${lotTitle}</strong>. Thank you.</p>`
    ),
  };
}

export async function notifyRegistrationDecision(
  to: string,
  saleTitle: string,
  approved: boolean
): Promise<void> {
  await sendEmail({ to, ...buildRegistrationDecisionEmail(saleTitle, approved) });
}

export async function notifyOutbid(
  to: string,
  lotTitle: string,
  lotId: string
): Promise<void> {
  await sendEmail({ to, ...buildOutbidEmail(lotTitle, `${appUrl()}/lots/${lotId}`) });
}

export async function notifyWon(
  to: string,
  lotTitle: string,
  lotId: string
): Promise<void> {
  await sendEmail({ to, ...buildWonEmail(lotTitle, `${appUrl()}/lots/${lotId}`) });
}

export async function notifyReceipt(
  to: string,
  lotTitle: string,
  total: number
): Promise<void> {
  await sendEmail({ to, ...buildReceiptEmail(lotTitle, total) });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @auction/web test src/lib/notifications.test.ts`
Expected: PASS — the four content-builder groups (the send path is not exercised here).

- [ ] **Step 6: Add env**

Append to `apps/web/.env.local.example`:
```
# Resend transactional email (use a test key + verified from-address).
RESEND_API_KEY="re_..."
RESEND_FROM="BALAI <noreply@yourdomain.com>"
```
Add real values to `apps/web/.env.local` if you have them; if absent, emails are skipped with a warning (flows still work).

- [ ] **Step 7: Commit**

```bash
pnpm --filter @auction/web build
git add apps/web/src/lib/email.ts apps/web/src/lib/notifications.ts apps/web/src/lib/notifications.test.ts apps/web/.env.local.example
git commit -m "feat(web): Resend email layer + transactional content builders"
```

---

### Task 2: Registration decision emails

**Files:**
- Modify: `apps/web/src/app/staff/registrations/actions.ts`

**Interfaces:**
- Consumes: `prisma`, `getUser`, `getSale`, `setRegistrationKyc` (`@/lib/db`); `requireStaff`; `notifyRegistrationDecision` (Task 1).
- Produces: approve/reject actions now email the bidder.

- [ ] **Step 1: Wire the emails**

In `apps/web/src/app/staff/registrations/actions.ts`, the existing `approveRegistration`/`rejectRegistration` call `setRegistrationKyc`. `setRegistrationKyc` returns the updated `RegistrationRecord` (with `userId`, `saleId`). Update both to look up the recipient + sale and notify. Add imports:
```ts
import { prisma, setRegistrationKyc, getUser, getSale } from "@/lib/db";
import { notifyRegistrationDecision } from "@/lib/notifications";
```
Replace the two action bodies with:
```ts
export async function approveRegistration(id: string): Promise<void> {
  await requireStaff();
  const reg = await setRegistrationKyc(prisma, id, "approved");
  const [user, sale] = await Promise.all([
    getUser(prisma, reg.userId),
    getSale(prisma, reg.saleId),
  ]);
  if (user && sale) {
    await notifyRegistrationDecision(user.email, sale.title, true);
  }
  revalidatePath("/staff/registrations");
}

export async function rejectRegistration(id: string): Promise<void> {
  await requireStaff();
  const reg = await setRegistrationKyc(prisma, id, "rejected");
  const [user, sale] = await Promise.all([
    getUser(prisma, reg.userId),
    getSale(prisma, reg.saleId),
  ]);
  if (user && sale) {
    await notifyRegistrationDecision(user.email, sale.title, false);
  }
  revalidatePath("/staff/registrations");
}
```
(Keep the existing `"use server"` and `revalidatePath` import. If the file imported `setRegistrationKyc`/`prisma` already, merge the import rather than duplicating.)

- [ ] **Step 2: Build, test, commit**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; existing tests pass. Then:
```bash
git add apps/web/src/app/staff/registrations/actions.ts
git commit -m "feat(web): email bidders on registration approve/reject"
```

---

### Task 3: Outbid email

**Files:**
- Modify: `apps/web/src/app/lots/[id]/actions.ts` (`placeBid`)

**Interfaces:**
- Consumes: `resolveBids` (`@auction/core`); `getUser` (`@/lib/db`); `notifyOutbid` (Task 1).
- Produces: when a new bid displaces a different prior leader, that leader is emailed.

- [ ] **Step 1: Wire the outbid email into `placeBid`**

In `apps/web/src/app/lots/[id]/actions.ts`, `placeBid` already loads `events` and computes the post-bid `resolution`. Determine the prior leader from the existing events and, if the new bid displaces a *different* user, notify them. Add to the imports:
```ts
import { getUser } from "@/lib/db"; // merge into the existing "@/lib/db" import
import { notifyOutbid } from "@/lib/notifications";
```
Just before the `appendBid` call (where `events` is already in scope), capture the prior leader:
```ts
  const priorLeaderId = resolveBids(
    lot.startingPrice,
    events,
    sale.incrementTable
  ).winnerId;
```
After the bid is appended and the broadcast is sent (just before `revalidatePath`), email the displaced leader:
```ts
  if (
    priorLeaderId &&
    priorLeaderId !== user.id &&
    resolution.winnerId !== priorLeaderId
  ) {
    const outbid = await getUser(prisma, priorLeaderId);
    if (outbid) await notifyOutbid(outbid.email, lot.title, lotId);
  }
```
(`resolution` is the post-bid resolution already computed in `placeBid`. The guard: there was a prior leader, it wasn't this bidder, and they are no longer the leader.)

- [ ] **Step 2: Build, test, commit**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Then:
```bash
git add "apps/web/src/app/lots/[id]/actions.ts"
git commit -m "feat(web): email the displaced leader when outbid"
```

---

### Task 4: Won + payment-receipt emails

**Files:**
- Modify: `apps/web/src/app/api/cron/close-lots/route.ts` (won emails)
- Modify: `apps/web/src/app/api/webhooks/xendit/route.ts` (receipt email)

**Interfaces:**
- Consumes: `prisma`, `getUser`, `getLot`, `getInvoiceById` (`@/lib/db`); `notifyWon`, `notifyReceipt` (Task 1).
- Produces: a "won" email per newly-sold lot at close; a "payment received" email when an invoice transitions to paid.

- [ ] **Step 1: Won emails in the close-lots cron**

In `apps/web/src/app/api/cron/close-lots/route.ts`, after `closeDueLots` returns `results`, email each winner. Add imports:
```ts
import { prisma, closeDueLots, getUser, getLot } from "@/lib/db"; // merge with existing
import { notifyWon } from "@/lib/notifications";
```
After the existing broadcast loop (and before the JSON response), add:
```ts
  await Promise.allSettled(
    results
      .filter((r) => r.outcome === "sold" && r.winnerId)
      .map(async (r) => {
        const [winner, lot] = await Promise.all([
          getUser(prisma, r.winnerId as string),
          getLot(prisma, r.lotId),
        ]);
        if (winner && lot) await notifyWon(winner.email, lot.title, lot.id);
      })
  );
```
(`closeLot` only returns `outcome: "sold"` once per lot — idempotent — so a winner is emailed exactly once.)

- [ ] **Step 2: Receipt email in the Xendit webhook**

In `apps/web/src/app/api/webhooks/xendit/route.ts`, the paid branch calls `markInvoicePaid(prisma, external_id)` which returns `transitioned: boolean`. Email the buyer only when it actually transitioned. Add imports:
```ts
import { prisma, markInvoicePaid, getInvoiceById, getUser, getLot } from "@/lib/db"; // merge
import { notifyReceipt } from "@/lib/notifications";
```
Replace the paid branch:
```ts
  if (isPaidXenditStatus(status)) {
    const transitioned = await markInvoicePaid(prisma, external_id);
    if (transitioned) {
      const invoice = await getInvoiceById(prisma, external_id);
      if (invoice) {
        const [buyer, lot] = await Promise.all([
          getUser(prisma, invoice.buyerId),
          getLot(prisma, invoice.lotId),
        ]);
        if (buyer && lot) {
          await notifyReceipt(buyer.email, lot.title, invoice.total);
        }
      }
    }
    return NextResponse.json({ ok: true, transitioned });
  }
```
(Emailing only on `transitioned === true` makes the receipt idempotent against duplicate webhook deliveries.)

- [ ] **Step 3: Build, test, commit**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual (with `RESEND_API_KEY`/`RESEND_FROM` set + a verified from-address): trigger each path (approve a registration; place a displacing bid; run the close-lots cron on a sold lot; POST a PAID webhook) and confirm the emails arrive (or, without keys, confirm the "Resend not configured" warning and that the actions still succeed). Then:
```bash
git add "apps/web/src/app/api/cron/close-lots/route.ts" "apps/web/src/app/api/webhooks/xendit/route.ts"
git commit -m "feat(web): won + payment-receipt emails on close and payment"
```

---

## Self-Review

**Spec coverage (against the Phase 1 design doc §4 notifications):**
- "registration approved" (+ rejected) → Task 2.
- "outbid" → Task 3 (the displaced prior leader).
- "won" → Task 4 (close-lots cron, per sold lot).
- "payment receipt" → Task 4 (Xendit webhook, on the paid transition).
- "sale ending soon" + per-loser "lost" → **deferred** (Global Constraints + handoff): the former needs a dedicated scheduled job + send-once tracking; the latter is largely covered by the outbid email. Noted, not silently dropped.
- All sends are off idempotent transitions and never break the triggering action.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step has complete code. The Resend send + wiring are verified by build + documented manual steps; the pure content builders are unit-tested.

**Type consistency:** `sendEmail`/`build*Email`/`notify*` names stable across tasks. `setRegistrationKyc` returns a `RegistrationRecord` (Plan 2) with `userId`/`saleId`; `getUser`/`getSale`/`getLot`/`getInvoiceById` signatures match Plans 2/6. `markInvoicePaid` returns `boolean` (Plan 6) — the receipt fires on `true`. `CloseResult` has `outcome`/`winnerId`/`lotId` (Plan 5). `resolveBids` returns `{ winnerId }` (Plan 1). `formatRupiah` (Plan 3) renders the receipt total. `notifyOutbid`/`notifyWon` build the lot URL from `NEXT_PUBLIC_APP_URL`.

---

## Handoff notes (post-Phase-1)

- **Sale-ending-soon reminders:** a scheduled job (Vercel Cron) that finds sales/lots closing within N hours and emails approved registrants, with a `sent_notifications` record (or similar) for send-once dedup.
- **Per-loser "lost" emails:** at close, enumerate distinct non-winning bidders per lot and notify (the outbid email covers the live signal; this is the post-close courtesy).
- **Email hardening:** React Email / templated layouts, unsubscribe handling, retries/queue, and per-user notification preferences.
- **Prod:** set `RESEND_API_KEY` + a verified `RESEND_FROM` domain in the hosted environment.

---

## Phase 1 complete

With Plan 8, Phase 1 (timed-auction house) is feature-complete: catalog → accounts & register-to-bid → live bidding → close & settle → payments → admin → notifications. Next: **Phase 2** (live real-time auctions — auctioneer console + WebSockets, reusing `@auction/core`) and **Phase 3** (consignment intake, seller settlement, deeper KYC/AML, editorial content).
