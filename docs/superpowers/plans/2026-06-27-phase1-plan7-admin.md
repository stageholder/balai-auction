# Phase 1 — Plan 7: Admin (Staff Console) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff-only admin console that makes the house operable without psql — create/edit & publish sales, catalog lots with Supabase Storage image uploads, manage users (promote/demote staff), and view per-sale results & payment status.

**Architecture:** A `requireStaff`-gated `/admin` area in `apps/web`. New `@auction/db` admin repos (update sale/lot, set status/role, list users, sale results) extend the existing ones. Lot images upload **server-side via a service-role Supabase client** to a public `lots` bucket; the returned public URL is stored in `Lot.images`. Pages are Server Components; forms are thin Client Components posting to server actions, each re-gated with `requireStaff`.

**Tech Stack:** Next.js 15 server actions + route segments, `@auction/db` (Prisma), Supabase Storage (`@supabase/supabase-js` admin client), Vitest.

## Global Constraints

- **Node.js >= 20**, **pnpm only**.
- **Every admin page and every admin server action calls `requireStaff()` first** — identity from the session, never client input. `requireStaff` `notFound()`s non-staff (no existence leak).
- **Server/client boundary:** the admin Supabase client (service role) + all `@auction/db` access live in server-only modules; form components are Client Components that call server actions and never import `@auction/db`/the service key.
- **Money is integer rupiah** end-to-end; admin money inputs are whole rupiah, converted to `BigInt` at the DB boundary (`toDbMoney`).
- **Image uploads** go to the public `lots` Supabase Storage bucket via the **service-role** key (server-only); only `image/png|jpeg|webp`, size-limited. The stored value is the public URL.
- **Sale visibility:** publishing a sale = setting its status off `draft` (the catalog already hides `draft`). Staff see all sales (`listSales`); the public sees only published ones.
- **No hard deletes in Phase 1** — sales/lots are created and edited; status drives lifecycle. (A lot with bids must never be silently removed.)
- **TDD** for the DB admin repos; the Supabase Storage upload + admin pages/forms are verified by build + documented manual steps.
- Suites must stay green: `@auction/core` (28), `@auction/db` (48→ grows), `@auction/web` (19→ grows).

---

### Task 1: DB admin repositories

**Files:**
- Modify: `packages/db/src/types.ts` (add `UpdateSale`, `UpdateLot`, `SaleResultRow`)
- Modify: `packages/db/src/repositories/sales.ts` (add `updateSale`, `updateSaleStatus`)
- Modify: `packages/db/src/repositories/lots.ts` (add `updateLot`)
- Modify: `packages/db/src/repositories/users.ts` (add `listUsers`, `setUserRole`)
- Create: `packages/db/src/repositories/results.ts` (`getSaleResults`)
- Modify: `packages/db/src/index.ts` (export results)
- Modify: `packages/db/src/repositories/sales.test.ts`, `lots.test.ts`, `users.test.ts`; Create `results.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, the mappers + `toDbMoney` (Plan 2), `Prisma` type (for Json), record/role types.
- Produces:
  - `UpdateSale` = partial of `{ title; description: string | null; startsAt: Date; endsAt: Date; buyersPremiumPct: number; taxPct: number; incrementTable: IncrementTable }`
  - `UpdateLot` = partial of `{ lotNumber; title; description: string | null; images: string[]; estimateLow; estimateHigh; startingPrice; reserve: number | null; closesAt: Date }`
  - `SaleResultRow` = `{ lotId; lotNumber; title; status; hammer: number | null; invoiceStatus: "pending" | "paid" | "refunded" | null; buyerEmail: string | null }`
  - `updateSale(db, id, fields: UpdateSale): Promise<SaleRecord>`
  - `updateSaleStatus(db, id, status: SaleStatus): Promise<SaleRecord>`
  - `updateLot(db, id, fields: UpdateLot): Promise<LotRecord>`
  - `listUsers(db): Promise<UserRecord[]>` (newest first)
  - `setUserRole(db, id, role: UserRole): Promise<UserRecord>`
  - `getSaleResults(db, saleId): Promise<SaleResultRow[]>` (ascending lotNumber)

- [ ] **Step 1: Write the failing tests**

Append to `packages/db/src/repositories/sales.test.ts`:
```ts
import { updateSale, updateSaleStatus } from "./sales";

describe("updateSale / updateSaleStatus", () => {
  it("updates provided fields and leaves others unchanged", async () => {
    const sale = await createSale(db, sampleSale("Original"));
    const updated = await updateSale(db, sale.id, {
      title: "Renamed",
      taxPct: 5,
    });
    expect(updated.title).toBe("Renamed");
    expect(updated.taxPct).toBe(5);
    expect(updated.buyersPremiumPct).toBe(sale.buyersPremiumPct);
    expect(updated.incrementTable).toEqual(sale.incrementTable);
  });

  it("publishes a sale by setting its status", async () => {
    const sale = await createSale(db, sampleSale("Draft"));
    expect(sale.status).toBe("draft");
    const live = await updateSaleStatus(db, sale.id, "live");
    expect(live.status).toBe("live");
  });
});
```

Append to `packages/db/src/repositories/lots.test.ts`:
```ts
import { updateLot } from "./lots";

describe("updateLot", () => {
  it("updates fields incl. money + images, leaving others unchanged", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const updated = await updateLot(db, lot.id, {
      title: "Updated Title",
      reserve: 2_000_000,
      images: ["https://example.com/a.jpg"],
    });
    expect(updated.title).toBe("Updated Title");
    expect(updated.reserve).toBe(2_000_000);
    expect(updated.images).toEqual(["https://example.com/a.jpg"]);
    expect(updated.startingPrice).toBe(lot.startingPrice);
  });

  it("can clear the reserve", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const updated = await updateLot(db, lot.id, { reserve: null });
    expect(updated.reserve).toBeNull();
  });
});
```

Append to `packages/db/src/repositories/users.test.ts`:
```ts
import { listUsers, setUserRole } from "./users";

describe("listUsers / setUserRole", () => {
  it("lists users and promotes one to staff", async () => {
    const a = await createUser(db, { email: "a@example.com" });
    await createUser(db, { email: "b@example.com" });
    expect((await listUsers(db)).length).toBe(2);

    const promoted = await setUserRole(db, a.id, "staff");
    expect(promoted.role).toBe("staff");
  });
});
```

Create `packages/db/src/repositories/results.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale } from "./sales";
import { createLot, updateLotStatus } from "./lots";
import { createUser } from "./users";
import { createInvoiceWithLedger } from "./invoices";
import { getSaleResults } from "./results";

const db = testDb();
const incrementTable: IncrementTable = [{ upTo: null, step: 100_000 }];

beforeEach(async () => {
  await resetDb(db);
});

describe("getSaleResults", () => {
  it("reports lots with sold/invoice info in lot-number order", async () => {
    const sale = await createSale(db, {
      title: "Sale",
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-08T00:00:00.000Z"),
      buyersPremiumPct: 20,
      taxPct: 11,
      incrementTable,
    });
    const buyer = await createUser(db, { email: "buyer@example.com" });
    const close = new Date("2026-07-08T00:00:00.000Z");
    const sold = await createLot(db, {
      saleId: sale.id, lotNumber: 1, title: "Sold Lot",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: null, closesAt: close,
    });
    await createLot(db, {
      saleId: sale.id, lotNumber: 2, title: "Live Lot",
      estimateLow: 1_000_000, estimateHigh: 2_000_000, startingPrice: 1_000_000,
      reserve: null, closesAt: close,
    });
    await updateLotStatus(db, sold.id, "sold");
    await createInvoiceWithLedger(db, {
      lotId: sold.id,
      buyerId: buyer.id,
      invoice: {
        hammer: 1_500_000, premium: 300_000, tax: 33_000, total: 1_833_000,
        entries: [{ party: "buyer", kind: "hammer", amount: 1_500_000 }],
      },
    });

    const rows = await getSaleResults(db, sale.id);
    expect(rows.map((r) => r.lotNumber)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      title: "Sold Lot",
      status: "sold",
      hammer: 1_500_000,
      invoiceStatus: "pending",
      buyerEmail: "buyer@example.com",
    });
    expect(rows[1]).toMatchObject({
      title: "Live Lot",
      status: "live",
      hammer: null,
      invoiceStatus: null,
      buyerEmail: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @auction/db test`
Expected: FAIL — the new functions/`./results` are not defined.

- [ ] **Step 3: Add the types**

In `packages/db/src/types.ts` add:
```ts
export interface UpdateSale {
  title?: string;
  description?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  buyersPremiumPct?: number;
  taxPct?: number;
  incrementTable?: import("@auction/core").IncrementTable;
}

export interface UpdateLot {
  lotNumber?: number;
  title?: string;
  description?: string | null;
  images?: string[];
  estimateLow?: number;
  estimateHigh?: number;
  startingPrice?: number;
  reserve?: number | null;
  closesAt?: Date;
}

export interface SaleResultRow {
  lotId: string;
  lotNumber: number;
  title: string;
  status: LotStatus;
  hammer: number | null;
  invoiceStatus: "pending" | "paid" | "refunded" | null;
  buyerEmail: string | null;
}
```

- [ ] **Step 4: Implement sales updates**

Append to `packages/db/src/repositories/sales.ts`:
```ts
import type { SaleStatus, UpdateSale } from "../types";

export async function updateSale(
  db: PrismaClient,
  id: string,
  fields: UpdateSale
): Promise<SaleRecord> {
  const row = await db.sale.update({
    where: { id },
    data: {
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      ...(fields.startsAt !== undefined ? { startsAt: fields.startsAt } : {}),
      ...(fields.endsAt !== undefined ? { endsAt: fields.endsAt } : {}),
      ...(fields.buyersPremiumPct !== undefined ? { buyersPremiumPct: fields.buyersPremiumPct } : {}),
      ...(fields.taxPct !== undefined ? { taxPct: fields.taxPct } : {}),
      ...(fields.incrementTable !== undefined
        ? { incrementTable: fields.incrementTable as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });
  return saleRowToRecord(row);
}

export async function updateSaleStatus(
  db: PrismaClient,
  id: string,
  status: SaleStatus
): Promise<SaleRecord> {
  const row = await db.sale.update({ where: { id }, data: { status } });
  return saleRowToRecord(row);
}
```
(`Prisma` is already imported in sales.ts from Plan 3's cast; if not, add `import type { Prisma } from "@prisma/client"`.)

- [ ] **Step 5: Implement lot update**

Append to `packages/db/src/repositories/lots.ts`:
```ts
import type { UpdateLot } from "../types";

export async function updateLot(
  db: PrismaClient,
  id: string,
  fields: UpdateLot
): Promise<LotRecord> {
  const row = await db.lot.update({
    where: { id },
    data: {
      ...(fields.lotNumber !== undefined ? { lotNumber: fields.lotNumber } : {}),
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      ...(fields.images !== undefined ? { images: fields.images } : {}),
      ...(fields.estimateLow !== undefined ? { estimateLow: toDbMoney(fields.estimateLow) } : {}),
      ...(fields.estimateHigh !== undefined ? { estimateHigh: toDbMoney(fields.estimateHigh) } : {}),
      ...(fields.startingPrice !== undefined ? { startingPrice: toDbMoney(fields.startingPrice) } : {}),
      ...(fields.reserve !== undefined
        ? { reserve: fields.reserve === null ? null : toDbMoney(fields.reserve) }
        : {}),
      ...(fields.closesAt !== undefined ? { closesAt: fields.closesAt } : {}),
    },
  });
  return lotRowToRecord(row);
}
```

- [ ] **Step 6: Implement user admin**

Append to `packages/db/src/repositories/users.ts`:
```ts
import type { UserRole } from "../types";

export async function listUsers(db: PrismaClient): Promise<UserRecord[]> {
  const rows = await db.user.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(userRowToRecord);
}

export async function setUserRole(
  db: PrismaClient,
  id: string,
  role: UserRole
): Promise<UserRecord> {
  const row = await db.user.update({ where: { id }, data: { role } });
  return userRowToRecord(row);
}
```

- [ ] **Step 7: Implement the results query**

`packages/db/src/repositories/results.ts`:
```ts
import type { PrismaClient } from "@prisma/client";
import type { SaleResultRow } from "../types";

export async function getSaleResults(
  db: PrismaClient,
  saleId: string
): Promise<SaleResultRow[]> {
  const rows = await db.lot.findMany({
    where: { saleId },
    orderBy: { lotNumber: "asc" },
    include: {
      invoice: { include: { buyer: { select: { email: true } } } },
    },
  });
  return rows.map((lot) => ({
    lotId: lot.id,
    lotNumber: lot.lotNumber,
    title: lot.title,
    status: lot.status as SaleResultRow["status"],
    hammer: lot.invoice ? Number(lot.invoice.hammer) : null,
    invoiceStatus: lot.invoice
      ? (lot.invoice.status as SaleResultRow["invoiceStatus"])
      : null,
    buyerEmail: lot.invoice ? lot.invoice.buyer.email : null,
  }));
}
```

- [ ] **Step 8: Export, run, commit**

Append to `packages/db/src/index.ts`:
```ts
export * from "./repositories/results";
```
Run: `pnpm --filter @auction/db test` → all pass (report count). Then:
```bash
git add packages/db/src
git commit -m "feat(db): admin repos (update sale/lot, status/role, users, sale results)"
```

---

### Task 2: Supabase Storage bucket + image upload

**Files:**
- Modify: `supabase/config.toml` (declare the `lots` bucket)
- Create: `apps/web/src/lib/supabase/admin.ts`
- Create: `apps/web/src/lib/storage.ts`
- Modify: `apps/web/next.config.ts` (Storage `remotePatterns`)

**Interfaces:**
- Consumes: `@supabase/supabase-js`; `requireStaff` (Plan 4).
- Produces:
  - `createAdminClient()` — a service-role Supabase client (server-only).
  - `uploadLotImage(file: File): Promise<string>` — uploads to the `lots` bucket, returns the public URL (server-only; re-gates with `requireStaff`).

- [ ] **Step 1: Declare the bucket**

In `supabase/config.toml`, add:
```toml
[storage.buckets.lots]
public = true
file_size_limit = "10MiB"
allowed_mime_types = ["image/png", "image/jpeg", "image/webp"]
```
Apply it:
```bash
supabase stop && supabase start
```
(The `lots` bucket now exists locally; in production create the same bucket in the Supabase dashboard.)

- [ ] **Step 2: Write the admin Supabase client**

`apps/web/src/lib/supabase/admin.ts`:
```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

/** A service-role Supabase client for privileged server operations (e.g.
 *  Storage uploads). Never import from a Client Component. */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

- [ ] **Step 3: Write the upload helper**

`apps/web/src/lib/storage.ts`:
```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "lots";
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Upload a lot image to Storage and return its public URL. Staff only. */
export async function uploadLotImage(file: File): Promise<string> {
  await requireStaff();
  if (!ALLOWED.has(file.type)) {
    throw new Error("Unsupported image type.");
  }
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
```

- [ ] **Step 4: Allow the Storage host in next/image**

In `apps/web/next.config.ts`, extend `images.remotePatterns` (keep the existing `picsum.photos`):
```ts
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      // Local Supabase Storage
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      // Hosted Supabase Storage (prod)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
```

- [ ] **Step 5: Build and commit**

```bash
pnpm --filter @auction/web build
```
Expected: build succeeds. Then:
```bash
git add supabase/config.toml apps/web/src/lib/supabase/admin.ts apps/web/src/lib/storage.ts apps/web/next.config.ts
git commit -m "feat(web): Supabase Storage lots bucket + server-side image upload"
```

---

### Task 3: Admin shell + Sales management

**Files:**
- Create: `apps/web/src/app/admin/layout.tsx`
- Create: `apps/web/src/app/admin/page.tsx`
- Create: `apps/web/src/app/admin/sales/page.tsx`
- Create: `apps/web/src/app/admin/sales/sale-form.tsx` (client)
- Create: `apps/web/src/app/admin/sales/actions.ts`
- Create: `apps/web/src/app/admin/sales/[id]/page.tsx` (edit)

**Interfaces:**
- Consumes: `requireStaff` (Plan 4); `prisma`, `listSales`, `getSale`, `createSale`, `updateSale`, `updateSaleStatus` (`@/lib/db`); `Button` (Plan 3).
- Produces: server actions `createSaleAction(formData)` / `updateSaleAction(id, formData)` / `setSaleStatusAction(id, status)`; the `SaleForm` client component; `/admin`, `/admin/sales`, `/admin/sales/[id]` routes.

- [ ] **Step 1: Admin layout (staff gate) + index**

`apps/web/src/app/admin/layout.tsx`:
```tsx
import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff();
  return (
    <div className="grid gap-10 lg:grid-cols-[180px_1fr]">
      <nav className="flex flex-col gap-2 text-sm">
        <Link href="/admin" className="font-serif text-lg">Admin</Link>
        <Link href="/admin/sales" className="text-muted hover:text-ink">Sales</Link>
        <Link href="/admin/users" className="text-muted hover:text-ink">Users</Link>
        <Link href="/staff/registrations" className="text-muted hover:text-ink">Registrations</Link>
      </nav>
      <div>{children}</div>
    </div>
  );
}
```

`apps/web/src/app/admin/page.tsx`:
```tsx
import Link from "next/link";

export default function AdminHome() {
  return (
    <div>
      <h1 className="mb-6 text-3xl">Admin</h1>
      <ul className="space-y-2 text-muted">
        <li><Link href="/admin/sales" className="text-ink underline">Sales &amp; lots</Link></li>
        <li><Link href="/admin/users" className="text-ink underline">Users</Link></li>
        <li><Link href="/staff/registrations" className="text-ink underline">Registrations</Link></li>
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Sales server actions**

`apps/web/src/app/admin/sales/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { IncrementTable } from "@auction/core";
import type { SaleStatus } from "@auction/db";
import { prisma, createSale, updateSale, updateSaleStatus } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

const DEFAULT_INCREMENTS: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

function parseIncrements(raw: string): IncrementTable {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("increment table must be an array");
  return parsed as IncrementTable;
}

function readForm(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    startsAt: new Date(String(formData.get("startsAt"))),
    endsAt: new Date(String(formData.get("endsAt"))),
    buyersPremiumPct: Number(formData.get("buyersPremiumPct")),
    taxPct: Number(formData.get("taxPct")),
    incrementTable: parseIncrements(
      String(formData.get("incrementTable") || JSON.stringify(DEFAULT_INCREMENTS))
    ),
  };
}

export async function createSaleAction(formData: FormData): Promise<void> {
  await requireStaff();
  const fields = readForm(formData);
  const sale = await createSale(prisma, fields);
  revalidatePath("/admin/sales");
  redirect(`/admin/sales/${sale.id}`);
}

export async function updateSaleAction(
  id: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  await updateSale(prisma, id, readForm(formData));
  revalidatePath(`/admin/sales/${id}`);
}

export async function setSaleStatusAction(
  id: string,
  status: SaleStatus
): Promise<void> {
  await requireStaff();
  await updateSaleStatus(prisma, id, status);
  revalidatePath(`/admin/sales/${id}`);
  revalidatePath("/admin/sales");
}
```

- [ ] **Step 3: Sale form (client)**

`apps/web/src/app/admin/sales/sale-form.tsx`:
```tsx
"use client";

import type { SaleRecord } from "@auction/db";
import { Button } from "@/components/ui/button";

const FIELD =
  "mt-1 w-full border border-line bg-paper px-3 py-2 focus:border-ink focus:outline-none";
const LABEL = "block text-xs uppercase tracking-[0.15em] text-muted";

function toLocalInput(d: Date): string {
  // yyyy-MM-ddThh:mm for <input type="datetime-local">
  return new Date(d).toISOString().slice(0, 16);
}

export function SaleForm({
  sale,
  action,
}: {
  sale?: SaleRecord;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="max-w-xl space-y-4">
      <div>
        <label htmlFor="title" className={LABEL}>Title</label>
        <input id="title" name="title" required defaultValue={sale?.title} className={FIELD} />
      </div>
      <div>
        <label htmlFor="description" className={LABEL}>Description</label>
        <textarea id="description" name="description" rows={3} defaultValue={sale?.description ?? ""} className={FIELD} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="startsAt" className={LABEL}>Starts at</label>
          <input id="startsAt" name="startsAt" type="datetime-local" required defaultValue={sale ? toLocalInput(sale.startsAt) : ""} className={FIELD} />
        </div>
        <div>
          <label htmlFor="endsAt" className={LABEL}>Ends at</label>
          <input id="endsAt" name="endsAt" type="datetime-local" required defaultValue={sale ? toLocalInput(sale.endsAt) : ""} className={FIELD} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="buyersPremiumPct" className={LABEL}>Buyer&apos;s premium %</label>
          <input id="buyersPremiumPct" name="buyersPremiumPct" type="number" min={0} required defaultValue={sale?.buyersPremiumPct ?? 20} className={FIELD} />
        </div>
        <div>
          <label htmlFor="taxPct" className={LABEL}>Tax (PPN) %</label>
          <input id="taxPct" name="taxPct" type="number" min={0} required defaultValue={sale?.taxPct ?? 11} className={FIELD} />
        </div>
      </div>
      <div>
        <label htmlFor="incrementTable" className={LABEL}>Increment table (JSON)</label>
        <textarea
          id="incrementTable"
          name="incrementTable"
          rows={3}
          defaultValue={JSON.stringify(
            sale?.incrementTable ?? [
              { upTo: 1_000_000, step: 50_000 },
              { upTo: 5_000_000, step: 100_000 },
              { upTo: null, step: 250_000 },
            ]
          )}
          className={`${FIELD} font-mono text-xs`}
        />
      </div>
      <Button type="submit">{sale ? "Save changes" : "Create sale"}</Button>
    </form>
  );
}
```

- [ ] **Step 4: Sales list + new + edit pages**

`apps/web/src/app/admin/sales/page.tsx`:
```tsx
import Link from "next/link";
import { prisma, listSales } from "@/lib/db";
import { SaleForm } from "./sale-form";
import { createSaleAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSalesPage() {
  const sales = await listSales(prisma);
  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl">Sales</h1>
        <ul className="divide-y divide-line border-y border-line">
          {sales.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3">
              <Link href={`/admin/sales/${s.id}`} className="text-ink hover:underline">
                {s.title}
              </Link>
              <span className="text-xs uppercase tracking-[0.15em] text-muted">{s.status}</span>
            </li>
          ))}
          {sales.length === 0 ? <li className="py-3 text-muted">No sales yet.</li> : null}
        </ul>
      </section>
      <section>
        <h2 className="mb-4 text-xl">New sale</h2>
        <SaleForm action={createSaleAction} />
      </section>
    </div>
  );
}
```

`apps/web/src/app/admin/sales/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, getSale } from "@/lib/db";
import { SaleForm } from "../sale-form";
import { updateSaleAction, setSaleStatusAction } from "../actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "scheduled", "live", "closed"] as const;

export default async function EditSalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getSale(prisma, id);
  if (!sale) notFound();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">{sale.title}</h1>
        <Link href={`/admin/sales/${id}/lots`} className="text-sm text-ink underline">
          Manage lots →
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-sm uppercase tracking-[0.15em] text-muted">Status: {sale.status}</h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <form key={status} action={setSaleStatusAction.bind(null, id, status)}>
              <Button type="submit" size="sm" variant={status === sale.status ? "solid" : "outline"}>
                {status}
              </Button>
            </form>
          ))}
        </div>
        <Link href={`/admin/sales/${id}/results`} className="mt-3 inline-block text-sm text-ink underline">
          View results &amp; payments →
        </Link>
      </section>

      <section>
        <h2 className="mb-4 text-xl">Edit details</h2>
        <SaleForm sale={sale} action={updateSaleAction.bind(null, id)} />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Build, test, commit**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; existing tests pass. Then:
```bash
git add apps/web/src/app/admin
git commit -m "feat(web): admin shell + sales management (create/edit/publish)"
```

---

### Task 4: Lots management + image upload

**Files:**
- Create: `apps/web/src/app/admin/sales/[id]/lots/page.tsx`
- Create: `apps/web/src/app/admin/sales/[id]/lots/lot-form.tsx` (client)
- Create: `apps/web/src/app/admin/sales/[id]/lots/actions.ts`

**Interfaces:**
- Consumes: `requireStaff`; `prisma`, `getSale`, `listLotsForSale`, `getLot`, `createLot`, `updateLot` (`@/lib/db`); `uploadLotImage` (Task 2); `formatRupiah`, `Button`.
- Produces: server actions `createLotAction(saleId, formData)` / `updateLotAction(saleId, lotId, formData)`; `LotForm`; the lots route.

**Note (visual craft):** Use the frontend-design skill to make the lot list read like a catalogue worksheet (thumbnail, lot number, title, estimate), tokens-only.

- [ ] **Step 1: Lots server actions (with image upload)**

`apps/web/src/app/admin/sales/[id]/lots/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, createLot, updateLot, getLot } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { uploadLotImage } from "@/lib/storage";

async function readImages(
  formData: FormData,
  existing: string[]
): Promise<string[]> {
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const url = await uploadLotImage(file);
    return [url, ...existing];
  }
  return existing;
}

function readFields(formData: FormData) {
  return {
    lotNumber: Number(formData.get("lotNumber")),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    estimateLow: Number(formData.get("estimateLow")),
    estimateHigh: Number(formData.get("estimateHigh")),
    startingPrice: Number(formData.get("startingPrice")),
    reserve: formData.get("reserve") ? Number(formData.get("reserve")) : null,
    closesAt: new Date(String(formData.get("closesAt"))),
  };
}

export async function createLotAction(
  saleId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const images = await readImages(formData, []);
  await createLot(prisma, { saleId, ...readFields(formData), images });
  revalidatePath(`/admin/sales/${saleId}/lots`);
  redirect(`/admin/sales/${saleId}/lots`);
}

export async function updateLotAction(
  saleId: string,
  lotId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const lot = await getLot(prisma, lotId);
  const images = await readImages(formData, lot?.images ?? []);
  await updateLot(prisma, lotId, { ...readFields(formData), images });
  revalidatePath(`/admin/sales/${saleId}/lots`);
  redirect(`/admin/sales/${saleId}/lots`);
}
```

- [ ] **Step 2: Lot form (client)**

`apps/web/src/app/admin/sales/[id]/lots/lot-form.tsx`:
```tsx
"use client";

import type { LotRecord } from "@auction/db";
import { Button } from "@/components/ui/button";

const FIELD =
  "mt-1 w-full border border-line bg-paper px-3 py-2 focus:border-ink focus:outline-none";
const LABEL = "block text-xs uppercase tracking-[0.15em] text-muted";

function toLocalInput(d: Date): string {
  return new Date(d).toISOString().slice(0, 16);
}

export function LotForm({
  lot,
  action,
}: {
  lot?: LotRecord;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="max-w-xl space-y-4">
      <div className="grid grid-cols-[120px_1fr] gap-4">
        <div>
          <label htmlFor="lotNumber" className={LABEL}>Lot #</label>
          <input id="lotNumber" name="lotNumber" type="number" min={1} required defaultValue={lot?.lotNumber ?? ""} className={FIELD} />
        </div>
        <div>
          <label htmlFor="title" className={LABEL}>Title</label>
          <input id="title" name="title" required defaultValue={lot?.title} className={FIELD} />
        </div>
      </div>
      <div>
        <label htmlFor="description" className={LABEL}>Description</label>
        <textarea id="description" name="description" rows={3} defaultValue={lot?.description ?? ""} className={FIELD} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="estimateLow" className={LABEL}>Est. low (Rp)</label>
          <input id="estimateLow" name="estimateLow" type="number" min={0} required defaultValue={lot?.estimateLow ?? ""} className={FIELD} />
        </div>
        <div>
          <label htmlFor="estimateHigh" className={LABEL}>Est. high (Rp)</label>
          <input id="estimateHigh" name="estimateHigh" type="number" min={0} required defaultValue={lot?.estimateHigh ?? ""} className={FIELD} />
        </div>
        <div>
          <label htmlFor="reserve" className={LABEL}>Reserve (Rp)</label>
          <input id="reserve" name="reserve" type="number" min={0} defaultValue={lot?.reserve ?? ""} className={FIELD} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="startingPrice" className={LABEL}>Starting price (Rp)</label>
          <input id="startingPrice" name="startingPrice" type="number" min={0} required defaultValue={lot?.startingPrice ?? ""} className={FIELD} />
        </div>
        <div>
          <label htmlFor="closesAt" className={LABEL}>Closes at</label>
          <input id="closesAt" name="closesAt" type="datetime-local" required defaultValue={lot ? toLocalInput(lot.closesAt) : ""} className={FIELD} />
        </div>
      </div>
      <div>
        <label htmlFor="image" className={LABEL}>Image (png/jpeg/webp)</label>
        <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full text-sm" />
      </div>
      <Button type="submit">{lot ? "Save lot" : "Add lot"}</Button>
    </form>
  );
}
```

- [ ] **Step 3: Lots list page**

`apps/web/src/app/admin/sales/[id]/lots/page.tsx`:
```tsx
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma, getSale, listLotsForSale } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { LotForm } from "./lot-form";
import { createLotAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminLotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getSale(prisma, id);
  if (!sale) notFound();
  const lots = await listLotsForSale(prisma, id);

  return (
    <div className="space-y-10">
      <h1 className="text-2xl">{sale.title} — lots</h1>

      <ul className="divide-y divide-line border-y border-line">
        {lots.map((lot) => (
          <li key={lot.id} className="flex items-center gap-4 py-3">
            <div className="relative h-14 w-12 shrink-0 bg-line">
              {lot.images[0] ? (
                <Image src={lot.images[0]} alt={lot.title} fill sizes="48px" className="object-cover" />
              ) : null}
            </div>
            <div className="flex-1">
              <p className="text-ink">Lot {lot.lotNumber} · {lot.title}</p>
              <p className="tnum text-xs text-muted">
                Est. {formatRupiah(lot.estimateLow)} – {formatRupiah(lot.estimateHigh)} · {lot.status}
              </p>
            </div>
          </li>
        ))}
        {lots.length === 0 ? <li className="py-3 text-muted">No lots yet.</li> : null}
      </ul>

      <section>
        <h2 className="mb-4 text-xl">Add lot</h2>
        <LotForm action={createLotAction.bind(null, id)} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Build, test, commit**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Manual (local Supabase running, signed in as staff): create a sale → Manage lots → add a lot with a PNG → the thumbnail renders from Supabase Storage. Then:
```bash
git add "apps/web/src/app/admin/sales/[id]/lots"
git commit -m "feat(web): admin lots management with Supabase Storage image upload"
```

---

### Task 5: Users management

**Files:**
- Create: `apps/web/src/app/admin/users/page.tsx`
- Create: `apps/web/src/app/admin/users/actions.ts`
- Create: `apps/web/src/app/admin/users/role-toggle.tsx` (client)

**Interfaces:**
- Consumes: `requireStaff`, `getCurrentUser`; `prisma`, `listUsers`, `setUserRole` (`@/lib/db`); `Button`.
- Produces: server action `setRoleAction(userId, role)`; `RoleToggle`; the `/admin/users` route.

- [ ] **Step 1: Users server action**

`apps/web/src/app/admin/users/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import type { UserRole } from "@auction/db";
import { prisma, setUserRole } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function setRoleAction(
  userId: string,
  role: UserRole
): Promise<void> {
  const staff = await requireStaff();
  // A staff member cannot change their own role (avoid self-lockout).
  if (staff.id === userId) return;
  await setUserRole(prisma, userId, role);
  revalidatePath("/admin/users");
}
```

- [ ] **Step 2: Role toggle (client)**

`apps/web/src/app/admin/users/role-toggle.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setRoleAction } from "./actions";

export function RoleToggle({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: "buyer" | "staff" | "consignor";
  disabled?: boolean;
}) {
  const router = useRouter();
  const next = role === "staff" ? "buyer" : "staff";
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={async () => {
        await setRoleAction(userId, next);
        router.refresh();
      }}
    >
      {role === "staff" ? "Revoke staff" : "Make staff"}
    </Button>
  );
}
```

- [ ] **Step 3: Users page**

`apps/web/src/app/admin/users/page.tsx`:
```tsx
import { prisma, listUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { RoleToggle } from "./role-toggle";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  const users = await listUsers(prisma);

  return (
    <div>
      <h1 className="mb-6 text-2xl">Users</h1>
      <ul className="divide-y divide-line border-y border-line">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-ink">{u.email}</p>
              <p className="text-xs uppercase tracking-[0.15em] text-muted">{u.role}</p>
            </div>
            <RoleToggle userId={u.id} role={u.role} disabled={u.id === me?.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Build, test, commit**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; tests pass. Then:
```bash
git add apps/web/src/app/admin/users
git commit -m "feat(web): admin user management (promote/demote staff)"
```

---

### Task 6: Sale results & payment view

**Files:**
- Create: `apps/web/src/app/admin/sales/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `requireStaff` (via layout); `prisma`, `getSale`, `getSaleResults` (`@/lib/db`); `formatRupiah`.
- Produces: the `/admin/sales/[id]/results` route.

- [ ] **Step 1: Results page**

`apps/web/src/app/admin/sales/[id]/results/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { prisma, getSale, getSaleResults } from "@/lib/db";
import { formatRupiah } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SaleResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getSale(prisma, id);
  if (!sale) notFound();
  const rows = await getSaleResults(prisma, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl">{sale.title} — results</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-[0.15em] text-muted">
            <th className="py-2">Lot</th>
            <th className="py-2">Title</th>
            <th className="py-2">Status</th>
            <th className="py-2 text-right">Hammer</th>
            <th className="py-2">Buyer</th>
            <th className="py-2">Payment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lotId} className="border-b border-line">
              <td className="py-2">{r.lotNumber}</td>
              <td className="py-2">{r.title}</td>
              <td className="py-2">{r.status}</td>
              <td className="tnum py-2 text-right">{r.hammer === null ? "—" : formatRupiah(r.hammer)}</td>
              <td className="py-2">{r.buyerEmail ?? "—"}</td>
              <td className="py-2">{r.invoiceStatus ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="mt-4 text-muted">No lots in this sale.</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Build, test, commit**

```bash
pnpm --filter @auction/web build
pnpm --filter @auction/web test
```
Expected: build succeeds; all tests pass. Manual: `/admin/sales/<id>/results` shows each lot with hammer, buyer, and payment status. Then:
```bash
git add "apps/web/src/app/admin/sales/[id]/results"
git commit -m "feat(web): admin sale results & payment-status view"
```

---

## Self-Review

**Spec coverage (against the Phase 1 design doc §5 "Admin"):**
- "create departments/sales/lots (images, estimates, reserves, increments)" → sales create/edit (Task 3) + lots create/edit with Supabase Storage image upload (Tasks 2, 4). (Departments remain out of scope — no Department entity in Phase 1, as noted since Plan 3.)
- "open/close sales" → status transitions (Task 3, `setSaleStatusAction`); publishing = off-`draft`.
- "approve registrations" → already at `/staff/registrations` (Plan 4), linked from the admin nav.
- "watch live bids / mark invoices paid/fulfilled" → results & payment view (Task 6) is read-only; manual mark-paid/refund controls are a deferred follow-up (payment is normally driven by the Xendit webhook). User management (promote staff) replaces the psql workaround (Task 5).
- Storage host added to `next.config` (Task 2) — resolves the Plan 3 handoff note.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step has complete code. Admin pages/forms + the Storage upload are verified by build + documented manual steps (Supabase running); the DB admin repos are unit-tested.

**Type consistency:** `UpdateSale`/`UpdateLot`/`SaleResultRow` defined once (Task 1) and consumed by the actions/pages. `updateSale`/`updateSaleStatus`/`updateLot`/`listUsers`/`setUserRole`/`getSaleResults` names stable across tasks. `uploadLotImage(file)` signature matches between Task 2 and Task 4. Server actions all re-gate with `requireStaff`. `SaleStatus`/`UserRole`/`SaleRecord`/`LotRecord`/`UserRecord` imported from `@auction/db` (type-only in client forms). `.bind(null, id)` is used to pass route ids into `action`-prop server actions.

---

## Handoff notes for later plans

- **Manual mark-paid / refund controls** in the results view (the Plan 6 deferred hardening: webhook amount-assertion + raw receipt persistence pairs with this).
- **Departments** + search/filter (deferred since Plan 3) — a dedicated later plan.
- **Image management:** the lot form prepends one new image; reorder/remove and multi-upload are a follow-up.
- **Consignment intake / seller settlement** — Phase 3 (the `consignor` role + seller ledger entries already exist).
- **Prod:** create the `lots` Storage bucket in the hosted Supabase project; the `*.supabase.co` `remotePattern` already covers its public URLs.

---

## Next Plan (Phase 1 finale)

8. **Notifications** — Resend transactional emails: registration approved/rejected, outbid, sale ending soon, won/lost, payment receipt. Completes Phase 1.
