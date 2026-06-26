# Phase 1 — Plan 2: Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `@auction/db` package — a Prisma schema over Postgres for every Phase 1/3 entity, plus repository functions that persist data and map rows to/from the `@auction/core` domain types — verified with real-database integration tests.

**Architecture:** A new workspace package `packages/db`. A single Prisma schema models User/Sale/Lot/Bid/Registration/Invoice/LedgerEntry with the Phase 3 seams already present (consignor, seller/house ledger parties). Money is stored as Postgres `BigInt` (int8) and converted to/from the core `Money` (JS `number`) at the mapper boundary. Repository functions take a `PrismaClient` as their first argument (dependency injection) so app code uses the singleton and tests use a throwaway test database. Tests are real integration tests against a Postgres started via `docker-compose`, truncated between tests.

**Tech Stack:** Prisma 6 + PostgreSQL 16 (Docker), Vitest, dotenv, `@auction/core` (workspace dependency).

## Global Constraints

- **Node.js >= 20**, **pnpm only** (no npm/yarn lockfiles).
- **Money discipline:** the core `Money` type is an integer JS `number` (rupiah). Postgres columns holding money are **`BigInt`** (int8). Convert at the mapper boundary only: `toMoney(bigint): number` and `toDbMoney(number): bigint`. Every money value MUST stay below `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991 ≈ Rp 9 quadrillion); `toMoney` throws if a stored value exceeds it.
- **`@auction/db` depends on `@auction/core`** via `workspace:*`. It never reimplements engine logic; it persists and maps.
- **Repositories take `db: PrismaClient` as their first parameter** (DI). No repository imports the client singleton.
- **The `Bid` table is append-only** — repositories insert bids and never update/delete them.
- **Integration tests run against a real Postgres** at `TEST_DATABASE_URL`, with all tables truncated before each test. `docker-compose up -d postgres` is a prerequisite for running the `@auction/db` test suite.
- **TDD** — failing test first, then minimal implementation.
- **Buyer's premium default 20%, tax default 0%** are column defaults on `Sale` (`buyersPremiumPct`, `taxPct`), stored as whole-number percents (`Int`).

---

### Task 1: Database infrastructure, schema, client, and test harness

**Files:**
- Create: `docker-compose.yml` (repo root)
- Create: `packages/db/docker/init-test-db.sql`
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/.env.example`
- Create: `packages/db/.env.test`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/test/testDb.ts`
- Create: `packages/db/src/test/global-setup.ts`
- Create: `packages/db/src/connectivity.test.ts`
- Generated (by command): `packages/db/prisma/migrations/**` and the Prisma client
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Consumes: nothing from `@auction/core` yet.
- Produces:
  - The full Prisma schema (all models/enums) and an applied initial migration.
  - `prisma` — a `PrismaClient` singleton (from `src/client.ts`) for app use.
  - `testDb(): PrismaClient` and `resetDb(db: PrismaClient): Promise<void>` (from `src/test/testDb.ts`) for tests.
  - The package name `@auction/db` with a working `pnpm --filter @auction/db test`.

- [ ] **Step 1: Create the Docker Postgres service**

`docker-compose.yml` (repo root):
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: auction
      POSTGRES_PASSWORD: auction
      POSTGRES_DB: auction
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./packages/db/docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U auction"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

`packages/db/docker/init-test-db.sql`:
```sql
CREATE DATABASE auction_test;
```

Start it:
```bash
docker compose up -d postgres
```
Wait until healthy:
```bash
docker compose ps
```
Expected: the `postgres` service shows `healthy`. (If the volume already existed from a prior run without the init script, the test DB may be missing — create it with `docker compose exec postgres psql -U auction -c "CREATE DATABASE auction_test;"`.)

- [ ] **Step 2: Create the package manifest, tsconfig, env files**

`packages/db/package.json`:
```json
{
  "name": "@auction/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@auction/core": "workspace:*",
    "@prisma/client": "^6.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "dotenv": "^16.4.0",
    "prisma": "^6.2.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`packages/db/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "prisma"]
}
```

`packages/db/.env.example`:
```
# Dev database (app + prisma migrate dev). Copy to .env and adjust as needed.
DATABASE_URL="postgresql://auction:auction@localhost:5432/auction"
# Test database (integration tests). Already provided in .env.test for local docker.
TEST_DATABASE_URL="postgresql://auction:auction@localhost:5432/auction_test"
```

`packages/db/.env.test` (local-only docker credentials; committed for DX):
```
TEST_DATABASE_URL="postgresql://auction:auction@localhost:5432/auction_test"
```

- [ ] **Step 3: Write the Prisma schema**

`packages/db/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  buyer
  staff
  consignor
}

enum SaleStatus {
  draft
  scheduled
  live
  closed
}

enum LotStatus {
  live
  sold
  unsold
  paid
  fulfilled
}

enum BidType {
  bid
  proxy_auto
  reserve_check
}

enum KycStatus {
  pending
  approved
  rejected
}

enum LedgerParty {
  buyer
  seller
  house
}

enum LedgerKind {
  hammer
  premium
  tax
  deposit
  payout
  refund
}

enum InvoiceStatus {
  pending
  paid
  refunded
}

model User {
  id            String         @id @default(uuid())
  email         String         @unique
  role          UserRole       @default(buyer)
  createdAt     DateTime       @default(now())
  bids          Bid[]
  registrations Registration[]
  invoices      Invoice[]
  consignedLots Lot[]          @relation("ConsignorLots")
}

model Sale {
  id               String         @id @default(uuid())
  title            String
  description      String?
  startsAt         DateTime
  endsAt           DateTime
  buyersPremiumPct Int            @default(20)
  taxPct           Int            @default(0)
  incrementTable   Json
  status           SaleStatus     @default(draft)
  createdAt        DateTime       @default(now())
  lots             Lot[]
  registrations    Registration[]
}

model Lot {
  id            String        @id @default(uuid())
  saleId        String
  sale          Sale          @relation(fields: [saleId], references: [id], onDelete: Cascade)
  lotNumber     Int
  title         String
  description   String?
  images        Json          @default("[]")
  estimateLow   BigInt
  estimateHigh  BigInt
  startingPrice BigInt
  reserve       BigInt?
  closesAt      DateTime
  status        LotStatus     @default(live)
  consignorId   String?
  consignor     User?         @relation("ConsignorLots", fields: [consignorId], references: [id])
  createdAt     DateTime      @default(now())
  bids          Bid[]
  invoice       Invoice?
  ledgerEntries LedgerEntry[]

  @@unique([saleId, lotNumber])
  @@index([status, closesAt])
}

model Bid {
  id        String   @id @default(uuid())
  lotId     String
  lot       Lot      @relation(fields: [lotId], references: [id], onDelete: Cascade)
  bidderId  String
  bidder    User     @relation(fields: [bidderId], references: [id])
  maxAmount BigInt
  amount    BigInt
  type      BidType  @default(bid)
  createdAt DateTime @default(now())

  @@index([lotId, createdAt])
}

model Registration {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  saleId          String
  sale            Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)
  kycStatus       KycStatus @default(pending)
  xenditCardToken String?
  createdAt       DateTime  @default(now())

  @@unique([userId, saleId])
}

model Invoice {
  id              String        @id @default(uuid())
  lotId           String        @unique
  lot             Lot           @relation(fields: [lotId], references: [id])
  buyerId         String
  buyer           User          @relation(fields: [buyerId], references: [id])
  hammer          BigInt
  premium         BigInt
  tax             BigInt
  total           BigInt
  status          InvoiceStatus @default(pending)
  xenditInvoiceId String?
  createdAt       DateTime      @default(now())
  ledgerEntries   LedgerEntry[]
}

model LedgerEntry {
  id        String      @id @default(uuid())
  invoiceId String?
  invoice   Invoice?    @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  lotId     String?
  lot       Lot?        @relation(fields: [lotId], references: [id])
  party     LedgerParty
  kind      LedgerKind
  amount    BigInt
  createdAt DateTime    @default(now())

  @@index([lotId])
}
```

- [ ] **Step 4: Add migration + Prisma output to .gitignore and generate the client + migration**

Append to the repo-root `.gitignore`:
```
# Prisma generated client
packages/db/src/generated/
# local env (keep .env.test and .env.example committed)
packages/db/.env
```

Generate the client and create the initial migration (this also applies it to the dev DB). Run from `packages/db`:
```bash
cd packages/db
cp .env.example .env   # if .env does not exist yet
pnpm exec prisma migrate dev --name init
```
Expected: Prisma creates `prisma/migrations/<timestamp>_init/migration.sql`, applies it to `auction`, and generates the client. Commit the generated migration directory (it is the source of truth for `migrate deploy`).

- [ ] **Step 5: Write the client singleton and test helpers**

`packages/db/src/client.ts`:
```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

`packages/db/src/test/testDb.ts`:
```ts
import { PrismaClient } from "@prisma/client";

let client: PrismaClient | null = null;

/** A PrismaClient pinned to TEST_DATABASE_URL, shared across the test run. */
export function testDb(): PrismaClient {
  if (!client) {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
      throw new Error("TEST_DATABASE_URL not set (see packages/db/.env.test)");
    }
    client = new PrismaClient({ datasources: { db: { url } } });
  }
  return client;
}

/** Truncate every table so each test starts from an empty database. */
export async function resetDb(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "LedgerEntry","Invoice","Bid","Registration","Lot","Sale","User" RESTART IDENTITY CASCADE'
  );
}
```

`packages/db/src/test/global-setup.ts`:
```ts
import { execSync } from "node:child_process";

/** Apply migrations to the test database once before the suite runs. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL not set (see packages/db/.env.test)");
  }
  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
```

`packages/db/vitest.config.ts`:
```ts
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load TEST_DATABASE_URL before tests and global setup run.
config({ path: ".env.test" });

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    // Repositories share one Postgres; run files serially to avoid
    // truncation in one file wiping another file's rows mid-test.
    fileParallelism: false,
  },
});
```

- [ ] **Step 6: Write the connectivity test**

`packages/db/src/connectivity.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./test/testDb";

describe("database connectivity", () => {
  beforeEach(async () => {
    await resetDb(testDb());
  });

  it("connects and runs a trivial query", async () => {
    const rows = await testDb().$queryRawUnsafe<{ ok: number }[]>(
      "SELECT 1 as ok"
    );
    expect(rows[0]?.ok).toBe(1);
  });

  it("has the migrated tables and they start empty", async () => {
    expect(await testDb().user.count()).toBe(0);
    expect(await testDb().sale.count()).toBe(0);
    expect(await testDb().lot.count()).toBe(0);
  });
});
```

- [ ] **Step 7: Run the test suite**

Run (Postgres must be up from Step 1):
```bash
pnpm install
pnpm --filter @auction/db test
```
Expected: global setup runs `migrate deploy` against `auction_test`, then 2 connectivity tests PASS.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml packages/db .gitignore
git commit -m "feat(db): add Postgres infra, Prisma schema, and test harness"
```

---

### Task 2: Record types and row mappers

**Files:**
- Create: `packages/db/src/types.ts`
- Create: `packages/db/src/mappers.ts`
- Create: `packages/db/src/mappers.test.ts`
- Create: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `IncrementTable`, `BidEvent` from `@auction/core`.
- Produces:
  - Money helpers: `toMoney(v: bigint): number`, `toDbMoney(v: number): bigint`.
  - `toIncrementTable(json: unknown): IncrementTable`.
  - `bidRowToEvent(row: { bidderId: string; maxAmount: bigint; createdAt: Date }): BidEvent`.
  - Record types and input types used by every repository: `UserRecord`/`NewUser`, `SaleRecord`/`NewSale`, `LotRecord`/`NewLot`, `BidRecord`/`NewBid`, `RegistrationRecord`/`NewRegistration`, `InvoiceRecord`/`LedgerEntryRecord` (exact fields below).
  - Row→record mappers: `userRowToRecord`, `saleRowToRecord`, `lotRowToRecord`, `bidRowToRecord`, `registrationRowToRecord`, `invoiceRowToRecord`, `ledgerEntryRowToRecord`.

- [ ] **Step 1: Write the failing test**

`packages/db/src/mappers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  toMoney,
  toDbMoney,
  toIncrementTable,
  bidRowToEvent,
} from "./mappers";

describe("toMoney / toDbMoney", () => {
  it("round-trips an integer rupiah value", () => {
    expect(toMoney(2_000_000n)).toBe(2_000_000);
    expect(toDbMoney(2_000_000)).toBe(2_000_000n);
  });

  it("throws if a stored value exceeds the safe integer range", () => {
    const tooBig = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(() => toMoney(tooBig)).toThrow();
  });

  it("throws if asked to store a non-integer", () => {
    expect(() => toDbMoney(1.5)).toThrow();
  });
});

describe("toIncrementTable", () => {
  it("parses a JSON array of brackets into an IncrementTable", () => {
    const json = [
      { upTo: 1_000_000, step: 50_000 },
      { upTo: null, step: 250_000 },
    ];
    expect(toIncrementTable(json)).toEqual([
      { upTo: 1_000_000, step: 50_000 },
      { upTo: null, step: 250_000 },
    ]);
  });

  it("throws on a non-array value", () => {
    expect(() => toIncrementTable({ nope: true })).toThrow();
  });
});

describe("bidRowToEvent", () => {
  it("maps a Bid row to a core BidEvent (createdAt to epoch ms)", () => {
    const when = new Date("2026-06-27T00:00:00.000Z");
    expect(
      bidRowToEvent({ bidderId: "A", maxAmount: 3_000_000n, createdAt: when })
    ).toEqual({
      bidderId: "A",
      maxAmount: 3_000_000,
      createdAt: when.getTime(),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/mappers.test.ts`
Expected: FAIL — cannot resolve `./mappers`.

- [ ] **Step 3: Write the record/input types**

`packages/db/src/types.ts`:
```ts
import type { IncrementTable } from "@auction/core";

export type UserRole = "buyer" | "staff" | "consignor";
export type SaleStatus = "draft" | "scheduled" | "live" | "closed";
export type LotStatus = "live" | "sold" | "unsold" | "paid" | "fulfilled";
export type BidType = "bid" | "proxy_auto" | "reserve_check";
export type KycStatus = "pending" | "approved" | "rejected";
export type LedgerParty = "buyer" | "seller" | "house";
export type LedgerKind =
  | "hammer"
  | "premium"
  | "tax"
  | "deposit"
  | "payout"
  | "refund";
export type InvoiceStatus = "pending" | "paid" | "refunded";

export interface UserRecord {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}
export interface NewUser {
  email: string;
  role?: UserRole;
}

export interface SaleRecord {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  buyersPremiumPct: number;
  taxPct: number;
  incrementTable: IncrementTable;
  status: SaleStatus;
  createdAt: Date;
}
export interface NewSale {
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  buyersPremiumPct: number;
  taxPct: number;
  incrementTable: IncrementTable;
}

export interface LotRecord {
  id: string;
  saleId: string;
  lotNumber: number;
  title: string;
  description: string | null;
  images: string[];
  estimateLow: number;
  estimateHigh: number;
  startingPrice: number;
  reserve: number | null;
  closesAt: Date;
  status: LotStatus;
  consignorId: string | null;
  createdAt: Date;
}
export interface NewLot {
  saleId: string;
  lotNumber: number;
  title: string;
  description?: string;
  images?: string[];
  estimateLow: number;
  estimateHigh: number;
  startingPrice: number;
  reserve?: number | null;
  closesAt: Date;
  consignorId?: string | null;
}

export interface BidRecord {
  id: string;
  lotId: string;
  bidderId: string;
  maxAmount: number;
  amount: number;
  type: BidType;
  createdAt: Date;
}
export interface NewBid {
  lotId: string;
  bidderId: string;
  maxAmount: number;
  amount: number;
  type?: BidType;
}

export interface RegistrationRecord {
  id: string;
  userId: string;
  saleId: string;
  kycStatus: KycStatus;
  xenditCardToken: string | null;
  createdAt: Date;
}
export interface NewRegistration {
  userId: string;
  saleId: string;
  xenditCardToken?: string | null;
}

export interface InvoiceRecord {
  id: string;
  lotId: string;
  buyerId: string;
  hammer: number;
  premium: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  xenditInvoiceId: string | null;
  createdAt: Date;
}

export interface LedgerEntryRecord {
  id: string;
  invoiceId: string | null;
  lotId: string | null;
  party: LedgerParty;
  kind: LedgerKind;
  amount: number;
  createdAt: Date;
}
```

- [ ] **Step 4: Write the mappers**

`packages/db/src/mappers.ts`:
```ts
import type { BidEvent, IncrementTable } from "@auction/core";
import type {
  BidRecord,
  InvoiceRecord,
  LedgerEntryRecord,
  LotRecord,
  RegistrationRecord,
  SaleRecord,
  UserRecord,
} from "./types";

export function toMoney(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`money value ${v} exceeds the safe integer range`);
  }
  return n;
}

export function toDbMoney(v: number): bigint {
  if (!Number.isInteger(v)) {
    throw new Error(`money must be an integer rupiah amount, got ${v}`);
  }
  return BigInt(v);
}

export function toIncrementTable(json: unknown): IncrementTable {
  if (!Array.isArray(json)) {
    throw new Error("incrementTable must be a JSON array of brackets");
  }
  return json.map((raw) => {
    const b = raw as { upTo: number | null; step: number };
    return { upTo: b.upTo, step: b.step };
  });
}

export function bidRowToEvent(row: {
  bidderId: string;
  maxAmount: bigint;
  createdAt: Date;
}): BidEvent {
  return {
    bidderId: row.bidderId,
    maxAmount: toMoney(row.maxAmount),
    createdAt: row.createdAt.getTime(),
  };
}

// --- Row → Record mappers. Each accepts the matching Prisma model shape. ---

export function userRowToRecord(row: {
  id: string;
  email: string;
  role: UserRecord["role"];
  createdAt: Date;
}): UserRecord {
  return { id: row.id, email: row.email, role: row.role, createdAt: row.createdAt };
}

export function saleRowToRecord(row: {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  buyersPremiumPct: number;
  taxPct: number;
  incrementTable: unknown;
  status: SaleRecord["status"];
  createdAt: Date;
}): SaleRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    buyersPremiumPct: row.buyersPremiumPct,
    taxPct: row.taxPct,
    incrementTable: toIncrementTable(row.incrementTable),
    status: row.status,
    createdAt: row.createdAt,
  };
}

export function lotRowToRecord(row: {
  id: string;
  saleId: string;
  lotNumber: number;
  title: string;
  description: string | null;
  images: unknown;
  estimateLow: bigint;
  estimateHigh: bigint;
  startingPrice: bigint;
  reserve: bigint | null;
  closesAt: Date;
  status: LotRecord["status"];
  consignorId: string | null;
  createdAt: Date;
}): LotRecord {
  return {
    id: row.id,
    saleId: row.saleId,
    lotNumber: row.lotNumber,
    title: row.title,
    description: row.description,
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    estimateLow: toMoney(row.estimateLow),
    estimateHigh: toMoney(row.estimateHigh),
    startingPrice: toMoney(row.startingPrice),
    reserve: row.reserve === null ? null : toMoney(row.reserve),
    closesAt: row.closesAt,
    status: row.status,
    consignorId: row.consignorId,
    createdAt: row.createdAt,
  };
}

export function bidRowToRecord(row: {
  id: string;
  lotId: string;
  bidderId: string;
  maxAmount: bigint;
  amount: bigint;
  type: BidRecord["type"];
  createdAt: Date;
}): BidRecord {
  return {
    id: row.id,
    lotId: row.lotId,
    bidderId: row.bidderId,
    maxAmount: toMoney(row.maxAmount),
    amount: toMoney(row.amount),
    type: row.type,
    createdAt: row.createdAt,
  };
}

export function registrationRowToRecord(row: {
  id: string;
  userId: string;
  saleId: string;
  kycStatus: RegistrationRecord["kycStatus"];
  xenditCardToken: string | null;
  createdAt: Date;
}): RegistrationRecord {
  return {
    id: row.id,
    userId: row.userId,
    saleId: row.saleId,
    kycStatus: row.kycStatus,
    xenditCardToken: row.xenditCardToken,
    createdAt: row.createdAt,
  };
}

export function invoiceRowToRecord(row: {
  id: string;
  lotId: string;
  buyerId: string;
  hammer: bigint;
  premium: bigint;
  tax: bigint;
  total: bigint;
  status: InvoiceRecord["status"];
  xenditInvoiceId: string | null;
  createdAt: Date;
}): InvoiceRecord {
  return {
    id: row.id,
    lotId: row.lotId,
    buyerId: row.buyerId,
    hammer: toMoney(row.hammer),
    premium: toMoney(row.premium),
    tax: toMoney(row.tax),
    total: toMoney(row.total),
    status: row.status,
    xenditInvoiceId: row.xenditInvoiceId,
    createdAt: row.createdAt,
  };
}

export function ledgerEntryRowToRecord(row: {
  id: string;
  invoiceId: string | null;
  lotId: string | null;
  party: LedgerEntryRecord["party"];
  kind: LedgerEntryRecord["kind"];
  amount: bigint;
  createdAt: Date;
}): LedgerEntryRecord {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    lotId: row.lotId,
    party: row.party,
    kind: row.kind,
    amount: toMoney(row.amount),
    createdAt: row.createdAt,
  };
}
```

- [ ] **Step 5: Create the barrel**

`packages/db/src/index.ts`:
```ts
export * from "./types";
export * from "./mappers";
export { prisma } from "./client";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @auction/db test src/mappers.test.ts`
Expected: PASS — mapper unit tests green (these need no database).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): add record types and row mappers"
```

---

### Task 3: Users repository

**Files:**
- Create: `packages/db/src/repositories/users.ts`
- Create: `packages/db/src/repositories/users.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `PrismaClient` (Step 5 client), `NewUser`, `UserRecord` (Task 2), `userRowToRecord` (Task 2), `testDb`/`resetDb` (Task 1).
- Produces:
  - `createUser(db: PrismaClient, input: NewUser): Promise<UserRecord>`
  - `getUser(db: PrismaClient, id: string): Promise<UserRecord | null>`

- [ ] **Step 1: Write the failing test**

`packages/db/src/repositories/users.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../test/testDb";
import { createUser, getUser } from "./users";

const db = testDb();

beforeEach(async () => {
  await resetDb(db);
});

describe("users repository", () => {
  it("creates a buyer by default and reads it back", async () => {
    const created = await createUser(db, { email: "buyer@example.com" });
    expect(created.email).toBe("buyer@example.com");
    expect(created.role).toBe("buyer");
    expect(created.id).toMatch(/[0-9a-f-]{36}/);

    const fetched = await getUser(db, created.id);
    expect(fetched).toEqual(created);
  });

  it("creates a staff user when role is given", async () => {
    const created = await createUser(db, {
      email: "staff@example.com",
      role: "staff",
    });
    expect(created.role).toBe("staff");
  });

  it("returns null for an unknown id", async () => {
    expect(await getUser(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/users.test.ts`
Expected: FAIL — cannot resolve `./users`.

- [ ] **Step 3: Write the implementation**

`packages/db/src/repositories/users.ts`:
```ts
import type { PrismaClient } from "@prisma/client";
import { userRowToRecord } from "../mappers";
import type { NewUser, UserRecord } from "../types";

export async function createUser(
  db: PrismaClient,
  input: NewUser
): Promise<UserRecord> {
  const row = await db.user.create({
    data: { email: input.email, role: input.role ?? "buyer" },
  });
  return userRowToRecord(row);
}

export async function getUser(
  db: PrismaClient,
  id: string
): Promise<UserRecord | null> {
  const row = await db.user.findUnique({ where: { id } });
  return row ? userRowToRecord(row) : null;
}
```

- [ ] **Step 4: Re-export and run**

Append to `packages/db/src/index.ts`:
```ts
export * from "./repositories/users";
```

Run: `pnpm --filter @auction/db test src/repositories/users.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): add users repository"
```

---

### Task 4: Sales repository

**Files:**
- Create: `packages/db/src/repositories/sales.ts`
- Create: `packages/db/src/repositories/sales.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `NewSale`, `SaleRecord` (Task 2), `saleRowToRecord` (Task 2).
- Produces:
  - `createSale(db: PrismaClient, input: NewSale): Promise<SaleRecord>`
  - `getSale(db: PrismaClient, id: string): Promise<SaleRecord | null>`
  - `listSales(db: PrismaClient): Promise<SaleRecord[]>` (newest first by `createdAt`)

- [ ] **Step 1: Write the failing test**

`packages/db/src/repositories/sales.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale, getSale, listSales } from "./sales";

const db = testDb();

const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: null, step: 250_000 },
];

function sampleSale(title: string) {
  return {
    title,
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  };
}

beforeEach(async () => {
  await resetDb(db);
});

describe("sales repository", () => {
  it("creates a sale and round-trips the increment table", async () => {
    const created = await createSale(db, sampleSale("Modern Art"));
    expect(created.title).toBe("Modern Art");
    expect(created.buyersPremiumPct).toBe(20);
    expect(created.taxPct).toBe(11);
    expect(created.status).toBe("draft");
    expect(created.incrementTable).toEqual(incrementTable);

    const fetched = await getSale(db, created.id);
    expect(fetched?.incrementTable).toEqual(incrementTable);
  });

  it("returns null for an unknown id", async () => {
    expect(await getSale(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("lists sales newest first", async () => {
    const first = await createSale(db, sampleSale("First"));
    const second = await createSale(db, sampleSale("Second"));
    const all = await listSales(db);
    expect(all.map((s) => s.id)).toEqual([second.id, first.id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/sales.test.ts`
Expected: FAIL — cannot resolve `./sales`.

- [ ] **Step 3: Write the implementation**

`packages/db/src/repositories/sales.ts`:
```ts
import type { PrismaClient } from "@prisma/client";
import { saleRowToRecord } from "../mappers";
import type { NewSale, SaleRecord } from "../types";

export async function createSale(
  db: PrismaClient,
  input: NewSale
): Promise<SaleRecord> {
  const row = await db.sale.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      buyersPremiumPct: input.buyersPremiumPct,
      taxPct: input.taxPct,
      incrementTable: input.incrementTable,
    },
  });
  return saleRowToRecord(row);
}

export async function getSale(
  db: PrismaClient,
  id: string
): Promise<SaleRecord | null> {
  const row = await db.sale.findUnique({ where: { id } });
  return row ? saleRowToRecord(row) : null;
}

export async function listSales(db: PrismaClient): Promise<SaleRecord[]> {
  const rows = await db.sale.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(saleRowToRecord);
}
```

- [ ] **Step 4: Re-export and run**

Append to `packages/db/src/index.ts`:
```ts
export * from "./repositories/sales";
```

Run: `pnpm --filter @auction/db test src/repositories/sales.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): add sales repository"
```

---

### Task 5: Lots repository

**Files:**
- Create: `packages/db/src/repositories/lots.ts`
- Create: `packages/db/src/repositories/lots.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `NewLot`, `LotRecord`, `LotStatus` (Task 2), `lotRowToRecord`, `toDbMoney` (Task 2); `createSale` (Task 4) in tests.
- Produces:
  - `createLot(db: PrismaClient, input: NewLot): Promise<LotRecord>`
  - `getLot(db: PrismaClient, id: string): Promise<LotRecord | null>`
  - `listLotsForSale(db: PrismaClient, saleId: string): Promise<LotRecord[]>` (ascending `lotNumber`)
  - `getLotsDueToClose(db: PrismaClient, now: Date): Promise<LotRecord[]>` (status `live` and `closesAt <= now`)
  - `updateLotStatus(db: PrismaClient, id: string, status: LotStatus): Promise<LotRecord>`

- [ ] **Step 1: Write the failing test**

`packages/db/src/repositories/lots.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale } from "./sales";
import {
  createLot,
  getLot,
  listLotsForSale,
  getLotsDueToClose,
  updateLotStatus,
} from "./lots";

const db = testDb();
const incrementTable: IncrementTable = [{ upTo: null, step: 100_000 }];

async function makeSale() {
  return createSale(db, {
    title: "Sale",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });
}

function sampleLot(saleId: string, lotNumber: number, closesAt: Date) {
  return {
    saleId,
    lotNumber,
    title: `Lot ${lotNumber}`,
    estimateLow: 1_000_000,
    estimateHigh: 2_000_000,
    startingPrice: 1_000_000,
    reserve: 1_500_000,
    closesAt,
  };
}

beforeEach(async () => {
  await resetDb(db);
});

describe("lots repository", () => {
  it("creates a lot with money fields round-tripped and reads it back", async () => {
    const sale = await makeSale();
    const created = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    expect(created.startingPrice).toBe(1_000_000);
    expect(created.estimateHigh).toBe(2_000_000);
    expect(created.reserve).toBe(1_500_000);
    expect(created.images).toEqual([]);
    expect(created.status).toBe("live");

    const fetched = await getLot(db, created.id);
    expect(fetched).toEqual(created);
  });

  it("lists a sale's lots in ascending lot number", async () => {
    const sale = await makeSale();
    const close = new Date("2026-07-08T00:00:00.000Z");
    await createLot(db, sampleLot(sale.id, 2, close));
    await createLot(db, sampleLot(sale.id, 1, close));
    const lots = await listLotsForSale(db, sale.id);
    expect(lots.map((l) => l.lotNumber)).toEqual([1, 2]);
  });

  it("returns only live lots whose closesAt has passed", async () => {
    const sale = await makeSale();
    const past = new Date("2026-07-01T00:00:00.000Z");
    const future = new Date("2026-07-31T00:00:00.000Z");
    const due = await createLot(db, sampleLot(sale.id, 1, past));
    await createLot(db, sampleLot(sale.id, 2, future));
    const sold = await createLot(db, sampleLot(sale.id, 3, past));
    await updateLotStatus(db, sold.id, "sold");

    const now = new Date("2026-07-10T00:00:00.000Z");
    const dueLots = await getLotsDueToClose(db, now);
    expect(dueLots.map((l) => l.id)).toEqual([due.id]);
  });

  it("updates a lot's status", async () => {
    const sale = await makeSale();
    const lot = await createLot(
      db,
      sampleLot(sale.id, 1, new Date("2026-07-08T00:00:00.000Z"))
    );
    const updated = await updateLotStatus(db, lot.id, "sold");
    expect(updated.status).toBe("sold");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/lots.test.ts`
Expected: FAIL — cannot resolve `./lots`.

- [ ] **Step 3: Write the implementation**

`packages/db/src/repositories/lots.ts`:
```ts
import type { PrismaClient } from "@prisma/client";
import { lotRowToRecord, toDbMoney } from "../mappers";
import type { LotRecord, LotStatus, NewLot } from "../types";

export async function createLot(
  db: PrismaClient,
  input: NewLot
): Promise<LotRecord> {
  const row = await db.lot.create({
    data: {
      saleId: input.saleId,
      lotNumber: input.lotNumber,
      title: input.title,
      description: input.description ?? null,
      images: input.images ?? [],
      estimateLow: toDbMoney(input.estimateLow),
      estimateHigh: toDbMoney(input.estimateHigh),
      startingPrice: toDbMoney(input.startingPrice),
      reserve: input.reserve == null ? null : toDbMoney(input.reserve),
      closesAt: input.closesAt,
      consignorId: input.consignorId ?? null,
    },
  });
  return lotRowToRecord(row);
}

export async function getLot(
  db: PrismaClient,
  id: string
): Promise<LotRecord | null> {
  const row = await db.lot.findUnique({ where: { id } });
  return row ? lotRowToRecord(row) : null;
}

export async function listLotsForSale(
  db: PrismaClient,
  saleId: string
): Promise<LotRecord[]> {
  const rows = await db.lot.findMany({
    where: { saleId },
    orderBy: { lotNumber: "asc" },
  });
  return rows.map(lotRowToRecord);
}

export async function getLotsDueToClose(
  db: PrismaClient,
  now: Date
): Promise<LotRecord[]> {
  const rows = await db.lot.findMany({
    where: { status: "live", closesAt: { lte: now } },
    orderBy: { closesAt: "asc" },
  });
  return rows.map(lotRowToRecord);
}

export async function updateLotStatus(
  db: PrismaClient,
  id: string,
  status: LotStatus
): Promise<LotRecord> {
  const row = await db.lot.update({ where: { id }, data: { status } });
  return lotRowToRecord(row);
}
```

- [ ] **Step 4: Re-export and run**

Append to `packages/db/src/index.ts`:
```ts
export * from "./repositories/lots";
```

Run: `pnpm --filter @auction/db test src/repositories/lots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): add lots repository"
```

---

### Task 6: Bids repository (with core engine integration)

**Files:**
- Create: `packages/db/src/repositories/bids.ts`
- Create: `packages/db/src/repositories/bids.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `NewBid`, `BidRecord` (Task 2), `bidRowToRecord`, `bidRowToEvent` (Task 2); `BidEvent`, `resolveBids` from `@auction/core`; `createSale`/`createLot`/`createUser` in tests.
- Produces:
  - `appendBid(db: PrismaClient, input: NewBid): Promise<BidRecord>` (insert only — the table is append-only)
  - `getBidEventsForLot(db: PrismaClient, lotId: string): Promise<BidEvent[]>` (ordered by `createdAt` asc, mapped to core `BidEvent`)

- [ ] **Step 1: Write the failing test**

`packages/db/src/repositories/bids.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resolveBids, type IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createSale } from "./sales";
import { createLot } from "./lots";
import { createUser } from "./users";
import { appendBid, getBidEventsForLot } from "./bids";

const db = testDb();
const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

async function scaffold() {
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
  const a = await createUser(db, { email: "a@example.com" });
  const b = await createUser(db, { email: "b@example.com" });
  return { lot, a, b };
}

beforeEach(async () => {
  await resetDb(db);
});

describe("bids repository", () => {
  it("appends a bid and reads it back as a record", async () => {
    const { lot, a } = await scaffold();
    const bid = await appendBid(db, {
      lotId: lot.id,
      bidderId: a.id,
      maxAmount: 3_000_000,
      amount: 1_000_000,
    });
    expect(bid.maxAmount).toBe(3_000_000);
    expect(bid.amount).toBe(1_000_000);
    expect(bid.type).toBe("bid");
  });

  it("returns persisted bids as core BidEvents and resolves a winner", async () => {
    const { lot, a, b } = await scaffold();
    await appendBid(db, {
      lotId: lot.id,
      bidderId: a.id,
      maxAmount: 5_000_000,
      amount: 1_000_000,
    });
    await appendBid(db, {
      lotId: lot.id,
      bidderId: b.id,
      maxAmount: 3_000_000,
      amount: 1_100_000,
    });

    const events = await getBidEventsForLot(db, lot.id);
    expect(events).toHaveLength(2);
    expect(typeof events[0]?.createdAt).toBe("number");

    const resolution = resolveBids(1_000_000, events, incrementTable);
    expect(resolution.winnerId).toBe(a.id);
    expect(resolution.currentPrice).toBe(3_100_000);
    expect(resolution.contested).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/bids.test.ts`
Expected: FAIL — cannot resolve `./bids`.

- [ ] **Step 3: Write the implementation**

`packages/db/src/repositories/bids.ts`:
```ts
import type { BidEvent } from "@auction/core";
import type { PrismaClient } from "@prisma/client";
import { bidRowToEvent, bidRowToRecord, toDbMoney } from "../mappers";
import type { BidRecord, NewBid } from "../types";

export async function appendBid(
  db: PrismaClient,
  input: NewBid
): Promise<BidRecord> {
  const row = await db.bid.create({
    data: {
      lotId: input.lotId,
      bidderId: input.bidderId,
      maxAmount: toDbMoney(input.maxAmount),
      amount: toDbMoney(input.amount),
      type: input.type ?? "bid",
    },
  });
  return bidRowToRecord(row);
}

export async function getBidEventsForLot(
  db: PrismaClient,
  lotId: string
): Promise<BidEvent[]> {
  const rows = await db.bid.findMany({
    where: { lotId },
    orderBy: { createdAt: "asc" },
    select: { bidderId: true, maxAmount: true, createdAt: true },
  });
  return rows.map(bidRowToEvent);
}
```

- [ ] **Step 4: Re-export and run**

Append to `packages/db/src/index.ts`:
```ts
export * from "./repositories/bids";
```

Run: `pnpm --filter @auction/db test src/repositories/bids.test.ts`
Expected: PASS — including the end-to-end resolve over persisted bids.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): add append-only bids repository with core resolution"
```

---

### Task 7: Registrations repository

**Files:**
- Create: `packages/db/src/repositories/registrations.ts`
- Create: `packages/db/src/repositories/registrations.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `NewRegistration`, `RegistrationRecord`, `KycStatus` (Task 2), `registrationRowToRecord` (Task 2); `createUser`/`createSale` in tests.
- Produces:
  - `createRegistration(db: PrismaClient, input: NewRegistration): Promise<RegistrationRecord>` (default `kycStatus: "pending"`)
  - `getRegistration(db: PrismaClient, userId: string, saleId: string): Promise<RegistrationRecord | null>`
  - `setRegistrationKyc(db: PrismaClient, id: string, kycStatus: KycStatus): Promise<RegistrationRecord>`

- [ ] **Step 1: Write the failing test**

`packages/db/src/repositories/registrations.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { IncrementTable } from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createUser } from "./users";
import { createSale } from "./sales";
import {
  createRegistration,
  getRegistration,
  setRegistrationKyc,
} from "./registrations";

const db = testDb();
const incrementTable: IncrementTable = [{ upTo: null, step: 100_000 }];

async function scaffold() {
  const user = await createUser(db, { email: "buyer@example.com" });
  const sale = await createSale(db, {
    title: "Sale",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable,
  });
  return { user, sale };
}

beforeEach(async () => {
  await resetDb(db);
});

describe("registrations repository", () => {
  it("creates a pending registration and reads it by user+sale", async () => {
    const { user, sale } = await scaffold();
    const reg = await createRegistration(db, {
      userId: user.id,
      saleId: sale.id,
      xenditCardToken: "tok_123",
    });
    expect(reg.kycStatus).toBe("pending");
    expect(reg.xenditCardToken).toBe("tok_123");

    const fetched = await getRegistration(db, user.id, sale.id);
    expect(fetched?.id).toBe(reg.id);
  });

  it("approves a registration", async () => {
    const { user, sale } = await scaffold();
    const reg = await createRegistration(db, {
      userId: user.id,
      saleId: sale.id,
    });
    const approved = await setRegistrationKyc(db, reg.id, "approved");
    expect(approved.kycStatus).toBe("approved");
  });

  it("rejects a duplicate registration for the same user and sale", async () => {
    const { user, sale } = await scaffold();
    await createRegistration(db, { userId: user.id, saleId: sale.id });
    await expect(
      createRegistration(db, { userId: user.id, saleId: sale.id })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/registrations.test.ts`
Expected: FAIL — cannot resolve `./registrations`.

- [ ] **Step 3: Write the implementation**

`packages/db/src/repositories/registrations.ts`:
```ts
import type { PrismaClient } from "@prisma/client";
import { registrationRowToRecord } from "../mappers";
import type { KycStatus, NewRegistration, RegistrationRecord } from "../types";

export async function createRegistration(
  db: PrismaClient,
  input: NewRegistration
): Promise<RegistrationRecord> {
  const row = await db.registration.create({
    data: {
      userId: input.userId,
      saleId: input.saleId,
      xenditCardToken: input.xenditCardToken ?? null,
    },
  });
  return registrationRowToRecord(row);
}

export async function getRegistration(
  db: PrismaClient,
  userId: string,
  saleId: string
): Promise<RegistrationRecord | null> {
  const row = await db.registration.findUnique({
    where: { userId_saleId: { userId, saleId } },
  });
  return row ? registrationRowToRecord(row) : null;
}

export async function setRegistrationKyc(
  db: PrismaClient,
  id: string,
  kycStatus: KycStatus
): Promise<RegistrationRecord> {
  const row = await db.registration.update({
    where: { id },
    data: { kycStatus },
  });
  return registrationRowToRecord(row);
}
```

Note: `userId_saleId` is the compound-unique selector Prisma generates from `@@unique([userId, saleId])`.

- [ ] **Step 4: Re-export and run**

Append to `packages/db/src/index.ts`:
```ts
export * from "./repositories/registrations";
```

Run: `pnpm --filter @auction/db test src/repositories/registrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): add registrations repository"
```

---

### Task 8: Invoices + ledger repository (transactional capstone)

**Files:**
- Create: `packages/db/src/repositories/invoices.ts`
- Create: `packages/db/src/repositories/invoices.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `InvoiceRecord`, `LedgerEntryRecord` (Task 2), `invoiceRowToRecord`, `ledgerEntryRowToRecord`, `toDbMoney` (Task 2); `Invoice`, `settleLot`, `computeInvoice` from `@auction/core`; repositories from Tasks 3–6 in tests.
- Produces:
  - `createInvoiceWithLedger(db, input: { lotId: string; buyerId: string; invoice: Invoice }): Promise<InvoiceRecord>` — in a single transaction, insert the Invoice row and one LedgerEntry per `invoice.entries[]` (each linked to both the new invoice and the lot).
  - `getInvoice(db, lotId: string): Promise<InvoiceRecord | null>`
  - `getLedgerEntriesForInvoice(db, invoiceId: string): Promise<LedgerEntryRecord[]>`

- [ ] **Step 1: Write the failing test**

`packages/db/src/repositories/invoices.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  settleLot,
  computeInvoice,
  type BidEvent,
  type IncrementTable,
} from "@auction/core";
import { testDb, resetDb } from "../test/testDb";
import { createUser } from "./users";
import { createSale } from "./sales";
import { createLot } from "./lots";
import { appendBid, getBidEventsForLot } from "./bids";
import {
  createInvoiceWithLedger,
  getInvoice,
  getLedgerEntriesForInvoice,
} from "./invoices";

const db = testDb();
const incrementTable: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

beforeEach(async () => {
  await resetDb(db);
});

describe("invoices repository", () => {
  it("persists an invoice and its ledger entries from the full core pipeline", async () => {
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
    const a = await createUser(db, { email: "a@example.com" });
    const b = await createUser(db, { email: "b@example.com" });
    await appendBid(db, {
      lotId: lot.id,
      bidderId: a.id,
      maxAmount: 5_000_000,
      amount: 1_000_000,
    });
    await appendBid(db, {
      lotId: lot.id,
      bidderId: b.id,
      maxAmount: 3_000_000,
      amount: 1_100_000,
    });

    const events: BidEvent[] = await getBidEventsForLot(db, lot.id);
    const settlement = settleLot(
      lot.startingPrice,
      events,
      sale.incrementTable,
      lot.reserve
    );
    expect(settlement.outcome).toBe("sold");
    expect(settlement.winnerId).toBe(a.id);
    expect(settlement.hammerPrice).toBe(3_100_000);

    const invoice = computeInvoice({
      hammer: settlement.hammerPrice,
      premiumPct: sale.buyersPremiumPct,
      taxPct: sale.taxPct,
    });

    const saved = await createInvoiceWithLedger(db, {
      lotId: lot.id,
      buyerId: settlement.winnerId!,
      invoice,
    });
    expect(saved.hammer).toBe(3_100_000);
    expect(saved.premium).toBe(620_000);
    expect(saved.tax).toBe(68_200);
    expect(saved.total).toBe(3_788_200);
    expect(saved.status).toBe("pending");

    const fetched = await getInvoice(db, lot.id);
    expect(fetched?.id).toBe(saved.id);

    const entries = await getLedgerEntriesForInvoice(db, saved.id);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.party === "buyer")).toBe(true);
    expect(entries.every((e) => e.lotId === lot.id)).toBe(true);
    expect(entries.map((e) => e.kind).sort()).toEqual([
      "hammer",
      "premium",
      "tax",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/invoices.test.ts`
Expected: FAIL — cannot resolve `./invoices`.

- [ ] **Step 3: Write the implementation**

`packages/db/src/repositories/invoices.ts`:
```ts
import type { Invoice } from "@auction/core";
import type { PrismaClient } from "@prisma/client";
import { invoiceRowToRecord, ledgerEntryRowToRecord, toDbMoney } from "../mappers";
import type { InvoiceRecord, LedgerEntryRecord } from "../types";

export async function createInvoiceWithLedger(
  db: PrismaClient,
  input: { lotId: string; buyerId: string; invoice: Invoice }
): Promise<InvoiceRecord> {
  const { lotId, buyerId, invoice } = input;
  const row = await db.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        lotId,
        buyerId,
        hammer: toDbMoney(invoice.hammer),
        premium: toDbMoney(invoice.premium),
        tax: toDbMoney(invoice.tax),
        total: toDbMoney(invoice.total),
      },
    });
    await tx.ledgerEntry.createMany({
      data: invoice.entries.map((entry) => ({
        invoiceId: created.id,
        lotId,
        party: entry.party,
        kind: entry.kind,
        amount: toDbMoney(entry.amount),
      })),
    });
    return created;
  });
  return invoiceRowToRecord(row);
}

export async function getInvoice(
  db: PrismaClient,
  lotId: string
): Promise<InvoiceRecord | null> {
  const row = await db.invoice.findUnique({ where: { lotId } });
  return row ? invoiceRowToRecord(row) : null;
}

export async function getLedgerEntriesForInvoice(
  db: PrismaClient,
  invoiceId: string
): Promise<LedgerEntryRecord[]> {
  const rows = await db.ledgerEntry.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(ledgerEntryRowToRecord);
}
```

- [ ] **Step 4: Re-export and run the full package suite**

Append to `packages/db/src/index.ts`:
```ts
export * from "./repositories/invoices";
```

Run the whole `@auction/db` suite:
```bash
pnpm --filter @auction/db test
```
Expected: PASS — connectivity, mappers, and all six repositories, including the end-to-end settle → invoice → persist capstone.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): add transactional invoices + ledger repository"
```

---

## Self-Review

**Spec coverage (against the Phase 1 design doc §2–§3):**
- §2 "packages/db → Prisma schema + migrations. The single Postgres (Supabase)." → Task 1 (schema, migration, Postgres infra). Supabase is the hosted target; the schema/migrations are provider-agnostic Postgres and apply identically to a Supabase database.
- §3 data model — User (with role incl. consignor), Sale, Lot (estimate, hidden reserve, closesAt, status, nullable consignorId), Bid (append-only event ledger with type discriminator), Registration (kycStatus, Xendit card token), LedgerEntry (party buyer/seller/house, kind), Invoice → all present in the schema (Task 1) and exercised by repositories (Tasks 3–8).
- Forward-compatible seams: `consignorId`, the `seller`/`house` ledger parties, and `payout`/`deposit`/`refund` ledger kinds exist now though Phase 1 only writes buyer lines (Task 8 asserts buyer-only) — Phase 3 adds rows, not columns.
- Money discipline (§ Global Constraints): integer rupiah in core, `BigInt` in Postgres, boundary conversion with overflow guard (Task 2, asserted).
- Out of scope for Plan 2 (covered by later plans): Supabase Auth wiring to the User table (Plan 4), the close-due-lots job that *calls* `getLotsDueToClose` + `settleLot` (Plan 5), Xendit fields are columns now but the integration is Plan 6. These are noted, not gaps.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to" markers. Every code step contains complete code; the only generated artifact is the Prisma migration SQL, which is produced deterministically from the committed schema via `prisma migrate dev --name init` (Task 1 Step 4) — the schema, not a placeholder, is the source of truth.

**Type consistency:** Record/input type names (`UserRecord`/`NewUser`, `SaleRecord`/`NewSale`, `LotRecord`/`NewLot`, `BidRecord`/`NewBid`, `RegistrationRecord`/`NewRegistration`, `InvoiceRecord`, `LedgerEntryRecord`) are defined once in Task 2 and consumed verbatim in Tasks 3–8. Mapper names (`toMoney`, `toDbMoney`, `toIncrementTable`, `bidRowToEvent`, `*RowToRecord`) are stable across tasks. Repository signatures all take `db: PrismaClient` first. The compound-unique selector `userId_saleId` (Task 7) matches `@@unique([userId, saleId])` (Task 1 schema). Core imports (`resolveBids`, `settleLot`, `computeInvoice`, `BidEvent`, `Invoice`, `IncrementTable`) match the names exported by `@auction/core` from Plan 1.

---

## Carried-forward items from Plan 1 review (addressed or deferred)

- **`kind` discriminator on persisted bids** — present as the `Bid.type` column (Task 1) and defaulted in `appendBid` (Task 6); `getBidEventsForLot` intentionally projects only the fields the engine needs (`bidRowToEvent` drops `type`), which is the intended row→event seam. ✔ resolved here.
- **`@auction/core` `build` script + `exports` map** — not required for Plan 2 (Vitest and the future Next app consume the workspace TS source directly). Defer to the first plan that consumes core from a non-bundler Node runtime (the Phase 2 live server). Logged, not done.
- **Expose `winnerMax` on `BidResolution`; co-locate `Settlement` into `types.ts`** — pure `@auction/core` polish, unrelated to persistence. Defer to Plan 5 (bidding integration), where the engine is next edited.

---

## Next Plans (Phase 1 continuation)

3. **Catalog** — public browse/lot detail using `@auction/db` repositories + Supabase Storage images + shadcn luxury design language.
4. **Accounts & register-to-bid** — Supabase Auth wired to the `User` table; registration approval; Xendit card-on-file populates `Registration.xenditCardToken`.
5. **Bidding integration** — `appendBid` + `resolveBids` + `applySoftClose` behind API routes; the `close-due-lots` job using `getLotsDueToClose` + `settleLot`; Supabase Realtime; bidding UI.
6. **Payments** — `computeInvoice` is already persisted (Task 8); add Xendit invoice creation + webhook reconciliation updating `Invoice.status`/`xenditInvoiceId`.
7. **Admin** — staff console over the repositories.
8. **Notifications** — Resend transactional emails.
