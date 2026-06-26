# Phase 1 — Plan 1: Foundation & Domain Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo and build the pure-TypeScript auction engine (`packages/core`) — proxy bidding, increment table, soft-close, reserve settlement, and invoice/ledger math — fully unit-tested with zero external infrastructure.

**Architecture:** A pnpm workspace monorepo. `packages/core` is a framework-free TypeScript library holding all auction business logic as pure functions over plain data. Later plans (persistence, API, UI) and Phase 2's live WebSocket server import this package unchanged. No database, network, or framework is touched in this plan — every function is deterministic and unit-tested with Vitest.

**Tech Stack:** pnpm workspaces, TypeScript, Vitest. (Next.js / Supabase / Prisma / Xendit arrive in later plans.)

## Global Constraints

- **Node.js >= 20** (LTS) — required by the wider stack (Next.js App Router, Supabase JS).
- **Package manager: pnpm** — the monorepo uses pnpm workspaces; do not use npm/yarn lockfiles.
- **Money is integer IDR (rupiah)** — the `Money` type is a whole-number rupiah amount. No floats, no minor units. All rounding uses `Math.round`.
- **`packages/core` has zero runtime dependencies** and imports nothing from Next.js, Supabase, Prisma, or any I/O library. It is pure functions over plain data.
- **TDD** — every task writes a failing test first, then the minimal implementation.
- **Buyer's premium default 20%, soft-close window 2 minutes** — these are inputs to the engine (not hardcoded constants); tasks parameterize them.

---

### Task 1: Monorepo scaffold + `packages/core` package

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working `pnpm --filter @auction/core test` command; the package name `@auction/core` that all later code imports.

- [ ] **Step 1: Create the workspace manifest files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`.nvmrc`:
```
20
```

Root `package.json`:
```json
{
  "name": "auction-web",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "pnpm -r test"
  }
}
```

- [ ] **Step 2: Create the `@auction/core` package files**

`packages/core/package.json`:
```json
{
  "name": "@auction/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

`packages/core/src/index.ts`:
```ts
export const CORE_VERSION = "0.0.0";
```

- [ ] **Step 3: Write the smoke test**

`packages/core/src/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CORE_VERSION } from "./index";

describe("core package", () => {
  it("is importable and exposes a version", () => {
    expect(CORE_VERSION).toBe("0.0.0");
  });
});
```

- [ ] **Step 4: Install and run the smoke test**

Run:
```bash
pnpm install
pnpm --filter @auction/core test
```
Expected: Vitest runs, 1 test file, 1 test passes.

- [ ] **Step 5: Commit**

```bash
printf 'node_modules/\ndist/\n.env\n.env.local\n.next/\n' > .gitignore
git add -A
git commit -m "chore: scaffold pnpm monorepo and @auction/core package"
```

---

### Task 2: Core types + increment table

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/increments.ts`
- Test: `packages/core/src/increments.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing from prior tasks (only the package scaffold).
- Produces:
  - `type Money = number` (integer rupiah)
  - `interface IncrementBracket { upTo: number | null; step: Money }`
  - `type IncrementTable = IncrementBracket[]`
  - `interface BidEvent { bidderId: string; maxAmount: Money; createdAt: number }`
  - `interface BidResolution { winnerId: string | null; currentPrice: Money; contested: boolean }`
  - `type LedgerParty = "buyer" | "seller" | "house"`
  - `type LedgerKind = "hammer" | "premium" | "tax" | "deposit" | "payout" | "refund"`
  - `interface LedgerEntry { party: LedgerParty; kind: LedgerKind; amount: Money }`
  - `interface Invoice { hammer: Money; premium: Money; tax: Money; total: Money; entries: LedgerEntry[] }`
  - `function minIncrement(price: Money, table: IncrementTable): Money`
  - `function minNextBid(currentPrice: Money, table: IncrementTable): Money`

- [ ] **Step 1: Write the failing test**

`packages/core/src/increments.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { minIncrement, minNextBid } from "./increments";
import type { IncrementTable } from "./types";

// Rupiah brackets: <1,000,000 step 50,000; <5,000,000 step 100,000; else 250,000
const table: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

describe("minIncrement", () => {
  it("returns the step for the bracket containing the price", () => {
    expect(minIncrement(0, table)).toBe(50_000);
    expect(minIncrement(999_999, table)).toBe(50_000);
    expect(minIncrement(1_000_000, table)).toBe(100_000);
    expect(minIncrement(4_999_999, table)).toBe(100_000);
    expect(minIncrement(5_000_000, table)).toBe(250_000);
    expect(minIncrement(50_000_000, table)).toBe(250_000);
  });

  it("throws if the table has no open final bracket", () => {
    const bad: IncrementTable = [{ upTo: 1_000_000, step: 50_000 }];
    expect(() => minIncrement(2_000_000, bad)).toThrow();
  });
});

describe("minNextBid", () => {
  it("adds the current bracket's increment to the current price", () => {
    expect(minNextBid(500_000, table)).toBe(550_000);
    expect(minNextBid(1_000_000, table)).toBe(1_100_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./increments` / `minIncrement is not a function`.

- [ ] **Step 3: Write the types**

`packages/core/src/types.ts`:
```ts
/** Integer rupiah (IDR). No minor units, no floats. */
export type Money = number;

export interface IncrementBracket {
  /** Upper bound (exclusive) for this bracket; `null` means open-ended. */
  upTo: number | null;
  /** Minimum raise while the price is within this bracket. */
  step: Money;
}

/** Ascending brackets; the final bracket MUST have `upTo: null`. */
export type IncrementTable = IncrementBracket[];

export interface BidEvent {
  bidderId: string;
  /** The bidder's maximum (proxy) amount. */
  maxAmount: Money;
  /** Epoch milliseconds. */
  createdAt: number;
}

export interface BidResolution {
  winnerId: string | null;
  currentPrice: Money;
  /** True when two or more distinct bidders are competing. */
  contested: boolean;
}

export type LedgerParty = "buyer" | "seller" | "house";
export type LedgerKind =
  | "hammer"
  | "premium"
  | "tax"
  | "deposit"
  | "payout"
  | "refund";

export interface LedgerEntry {
  party: LedgerParty;
  kind: LedgerKind;
  /** Positive integer rupiah owed/owing for this line. */
  amount: Money;
}

export interface Invoice {
  hammer: Money;
  premium: Money;
  tax: Money;
  total: Money;
  entries: LedgerEntry[];
}
```

- [ ] **Step 4: Write the increment implementation**

`packages/core/src/increments.ts`:
```ts
import type { IncrementTable, Money } from "./types";

export function minIncrement(price: Money, table: IncrementTable): Money {
  for (const bracket of table) {
    if (bracket.upTo === null || price < bracket.upTo) {
      return bracket.step;
    }
  }
  throw new Error(
    "increment table must end with an open bracket (upTo: null)"
  );
}

export function minNextBid(currentPrice: Money, table: IncrementTable): Money {
  return currentPrice + minIncrement(currentPrice, table);
}
```

- [ ] **Step 5: Re-export from the index**

`packages/core/src/index.ts`:
```ts
export const CORE_VERSION = "0.0.0";

export * from "./types";
export * from "./increments";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @auction/core test`
Expected: PASS — increments + smoke tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): add money/bid types and increment table"
```

---

### Task 3: Proxy-bid resolution (`resolveBids`)

**Files:**
- Create: `packages/core/src/auction.ts`
- Test: `packages/core/src/auction.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `BidEvent`, `BidResolution`, `IncrementTable`, `Money` (Task 2); `minIncrement` (Task 2).
- Produces: `function resolveBids(startingPrice: Money, events: BidEvent[], table: IncrementTable): BidResolution`.

**Algorithm (eBay/Christie's-online proxy logic):**
- No events → no winner, price = `startingPrice`, not contested.
- Each bidder's standing = their highest `maxAmount`; tie-break = earliest `createdAt` at which they first reached that max.
- Rank standings: highest max first, then earliest `reachedAt`.
- One bidder → they win at `startingPrice` (price sits at opening until someone competes).
- Two+ bidders: if the top two maxima are equal, the earlier bidder wins at that max. Otherwise price = `min(topMax, secondMax + minIncrement(secondMax))`, clamped to be `>= startingPrice`. Winner is the top bidder.

- [ ] **Step 1: Write the failing test**

`packages/core/src/auction.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveBids } from "./auction";
import type { BidEvent, IncrementTable } from "./types";

const table: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];
const START = 1_000_000;

describe("resolveBids", () => {
  it("returns no winner at the starting price when there are no bids", () => {
    expect(resolveBids(START, [], table)).toEqual({
      winnerId: null,
      currentPrice: START,
      contested: false,
    });
  });

  it("keeps the price at the opening for a lone bidder", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
    ];
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: START,
      contested: false,
    });
  });

  it("sets price to second max plus one increment when contested", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    // increment at 3,000,000 is 100,000 → 3,100,000, below A's max
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: 3_100_000,
      contested: true,
    });
  });

  it("caps the price at the winner's own max", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 3_050_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    // 3,000,000 + 100,000 = 3,100,000 > A's max → cap at 3,050,000
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: 3_050_000,
      contested: true,
    });
  });

  it("awards a tie in max to the earlier bidder at that max", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 3_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: 3_000_000,
      contested: true,
    });
  });

  it("uses a bidder's highest max across multiple of their own bids", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 2_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
      { bidderId: "A", maxAmount: 6_000_000, createdAt: 3 },
    ];
    // A leads with 6,000,000; second max 3,000,000 + 100,000 = 3,100,000
    expect(resolveBids(START, events, table)).toEqual({
      winnerId: "A",
      currentPrice: 3_100_000,
      contested: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./auction`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/auction.ts`:
```ts
import { minIncrement } from "./increments";
import type { BidEvent, BidResolution, IncrementTable, Money } from "./types";

interface Standing {
  bidderId: string;
  max: Money;
  reachedAt: number;
}

function rankBidders(events: BidEvent[]): Standing[] {
  const byBidder = new Map<string, Standing>();
  for (const e of events) {
    const cur = byBidder.get(e.bidderId);
    if (!cur || e.maxAmount > cur.max) {
      byBidder.set(e.bidderId, {
        bidderId: e.bidderId,
        max: e.maxAmount,
        reachedAt: e.createdAt,
      });
    } else if (e.maxAmount === cur.max && e.createdAt < cur.reachedAt) {
      cur.reachedAt = e.createdAt;
    }
  }
  return [...byBidder.values()].sort(
    (a, b) => b.max - a.max || a.reachedAt - b.reachedAt
  );
}

export function resolveBids(
  startingPrice: Money,
  events: BidEvent[],
  table: IncrementTable
): BidResolution {
  if (events.length === 0) {
    return { winnerId: null, currentPrice: startingPrice, contested: false };
  }

  const standings = rankBidders(events);
  const winner = standings[0]!;

  if (standings.length === 1) {
    return {
      winnerId: winner.bidderId,
      currentPrice: startingPrice,
      contested: false,
    };
  }

  const second = standings[1]!;
  let price: Money;
  if (winner.max === second.max) {
    price = winner.max;
  } else {
    price = Math.min(winner.max, second.max + minIncrement(second.max, table));
  }
  price = Math.max(startingPrice, price);

  return { winnerId: winner.bidderId, currentPrice: price, contested: true };
}
```

- [ ] **Step 4: Re-export from the index**

Append to `packages/core/src/index.ts`:
```ts
export * from "./auction";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @auction/core test`
Expected: PASS — all `resolveBids` cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): add proxy-bid resolution engine"
```

---

### Task 4: Soft-close / anti-snipe (`applySoftClose`)

**Files:**
- Create: `packages/core/src/softClose.ts`
- Test: `packages/core/src/softClose.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing beyond primitives.
- Produces: `function applySoftClose(closesAt: number, bidAt: number, windowMs: number): number` — returns the (possibly extended) close time in epoch ms.

- [ ] **Step 1: Write the failing test**

`packages/core/src/softClose.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { applySoftClose } from "./softClose";

const WINDOW = 2 * 60_000; // 2 minutes in ms

describe("applySoftClose", () => {
  it("does not extend when the bid is well before the close window", () => {
    const closesAt = 1_000_000;
    const bidAt = closesAt - WINDOW - 1; // just outside the window
    expect(applySoftClose(closesAt, bidAt, WINDOW)).toBe(closesAt);
  });

  it("extends to bidAt + window when the bid lands inside the window", () => {
    const closesAt = 1_000_000;
    const bidAt = closesAt - 30_000; // 30s before close
    expect(applySoftClose(closesAt, bidAt, WINDOW)).toBe(bidAt + WINDOW);
  });

  it("extends when the bid lands exactly at the window boundary", () => {
    const closesAt = 1_000_000;
    const bidAt = closesAt - WINDOW;
    expect(applySoftClose(closesAt, bidAt, WINDOW)).toBe(bidAt + WINDOW);
  });

  it("ignores bids at or after the close time", () => {
    const closesAt = 1_000_000;
    expect(applySoftClose(closesAt, closesAt, WINDOW)).toBe(closesAt);
    expect(applySoftClose(closesAt, closesAt + 5, WINDOW)).toBe(closesAt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./softClose`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/softClose.ts`:
```ts
/**
 * Returns the new close time for a lot after a bid.
 * A bid inside the final `windowMs` extends the close to `bidAt + windowMs`,
 * guaranteeing a full window of quiet before the lot closes. Bids at or after
 * the close are ignored (they belong to the closing job, not this function).
 */
export function applySoftClose(
  closesAt: number,
  bidAt: number,
  windowMs: number
): number {
  if (bidAt >= closesAt) return closesAt;
  if (closesAt - bidAt <= windowMs) return bidAt + windowMs;
  return closesAt;
}
```

- [ ] **Step 4: Re-export from the index**

Append to `packages/core/src/index.ts`:
```ts
export * from "./softClose";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @auction/core test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): add soft-close anti-snipe extension"
```

---

### Task 5: Lot settlement with reserve (`settleLot`)

**Files:**
- Create: `packages/core/src/settlement.ts`
- Test: `packages/core/src/settlement.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `resolveBids` (Task 3); `BidEvent`, `IncrementTable`, `Money` (Task 2).
- Produces:
  - `interface Settlement { outcome: "sold" | "unsold"; winnerId: string | null; hammerPrice: Money }`
  - `function settleLot(startingPrice: Money, events: BidEvent[], table: IncrementTable, reserve: Money | null): Settlement`

**Reserve rules:** A lot sells only if the top bidder's max reaches the reserve. When the reserve is met but the resolved current price is below it, the hammer price rises to the reserve. No reserve (`null`) → sells at the resolved current price whenever there is a winner.

- [ ] **Step 1: Write the failing test**

`packages/core/src/settlement.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { settleLot } from "./settlement";
import type { BidEvent, IncrementTable } from "./types";

const table: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];
const START = 1_000_000;

describe("settleLot", () => {
  it("is unsold with no bids", () => {
    expect(settleLot(START, [], table, null)).toEqual({
      outcome: "unsold",
      winnerId: null,
      hammerPrice: 0,
    });
  });

  it("sells at the resolved price when there is no reserve", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    expect(settleLot(START, events, table, null)).toEqual({
      outcome: "sold",
      winnerId: "A",
      hammerPrice: 3_100_000,
    });
  });

  it("is unsold when the top bidder's max is below the reserve", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 2_000_000, createdAt: 1 },
    ];
    expect(settleLot(START, events, table, 3_000_000)).toEqual({
      outcome: "unsold",
      winnerId: null,
      hammerPrice: 0,
    });
  });

  it("sells at the reserve when the reserve is met but resolved price is below it", () => {
    // Lone bidder: resolved price sits at START (1,000,000) but max clears reserve
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 4_000_000, createdAt: 1 },
    ];
    expect(settleLot(START, events, table, 2_500_000)).toEqual({
      outcome: "sold",
      winnerId: "A",
      hammerPrice: 2_500_000,
    });
  });

  it("sells at the resolved price when it already exceeds the reserve", () => {
    const events: BidEvent[] = [
      { bidderId: "A", maxAmount: 5_000_000, createdAt: 1 },
      { bidderId: "B", maxAmount: 3_000_000, createdAt: 2 },
    ];
    // resolved price 3,100,000 > reserve 2,000,000
    expect(settleLot(START, events, table, 2_000_000)).toEqual({
      outcome: "sold",
      winnerId: "A",
      hammerPrice: 3_100_000,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./settlement`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/settlement.ts`:
```ts
import { resolveBids } from "./auction";
import type { BidEvent, IncrementTable, Money } from "./types";

export interface Settlement {
  outcome: "sold" | "unsold";
  winnerId: string | null;
  hammerPrice: Money;
}

export function settleLot(
  startingPrice: Money,
  events: BidEvent[],
  table: IncrementTable,
  reserve: Money | null
): Settlement {
  const resolution = resolveBids(startingPrice, events, table);
  if (resolution.winnerId === null) {
    return { outcome: "unsold", winnerId: null, hammerPrice: 0 };
  }

  const winnerMax = Math.max(
    ...events
      .filter((e) => e.bidderId === resolution.winnerId)
      .map((e) => e.maxAmount)
  );

  if (reserve !== null && winnerMax < reserve) {
    return { outcome: "unsold", winnerId: null, hammerPrice: 0 };
  }

  const hammerPrice =
    reserve !== null
      ? Math.max(resolution.currentPrice, reserve)
      : resolution.currentPrice;

  return { outcome: "sold", winnerId: resolution.winnerId, hammerPrice };
}
```

- [ ] **Step 4: Re-export from the index**

Append to `packages/core/src/index.ts`:
```ts
export * from "./settlement";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @auction/core test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): add lot settlement with reserve handling"
```

---

### Task 6: Invoice & ledger math (`computeInvoice`)

**Files:**
- Create: `packages/core/src/invoice.ts`
- Test: `packages/core/src/invoice.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Invoice`, `LedgerEntry`, `Money` (Task 2).
- Produces: `function computeInvoice(params: { hammer: Money; premiumPct: number; taxPct: number }): Invoice`.

**Rules:** Buyer's premium = `round(hammer * premiumPct / 100)`. Tax (PPN) is charged on the premium = `round(premium * taxPct / 100)`. Total = `hammer + premium + tax`. Ledger entries record what the buyer owes: one `hammer`, one `premium`, one `tax`, all `party: "buyer"`. (Seller-side entries are added by Phase 3 settlement — the schema already supports them.)

- [ ] **Step 1: Write the failing test**

`packages/core/src/invoice.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeInvoice } from "./invoice";

describe("computeInvoice", () => {
  it("applies a 20% premium and 11% PPN on the premium", () => {
    const inv = computeInvoice({
      hammer: 10_000_000,
      premiumPct: 20,
      taxPct: 11,
    });
    // premium = 2,000,000; tax = 220,000; total = 12,220,000
    expect(inv).toEqual({
      hammer: 10_000_000,
      premium: 2_000_000,
      tax: 220_000,
      total: 12_220_000,
      entries: [
        { party: "buyer", kind: "hammer", amount: 10_000_000 },
        { party: "buyer", kind: "premium", amount: 2_000_000 },
        { party: "buyer", kind: "tax", amount: 220_000 },
      ],
    });
  });

  it("rounds premium and tax to whole rupiah", () => {
    const inv = computeInvoice({
      hammer: 3_333_333,
      premiumPct: 20,
      taxPct: 11,
    });
    // premium = round(666,666.6) = 666,667; tax = round(73,333.37) = 73,333
    expect(inv.premium).toBe(666_667);
    expect(inv.tax).toBe(73_333);
    expect(inv.total).toBe(3_333_333 + 666_667 + 73_333);
  });

  it("handles a zero tax rate", () => {
    const inv = computeInvoice({ hammer: 1_000_000, premiumPct: 20, taxPct: 0 });
    expect(inv.tax).toBe(0);
    expect(inv.total).toBe(1_200_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/core test`
Expected: FAIL — cannot resolve `./invoice`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/invoice.ts`:
```ts
import type { Invoice, LedgerEntry, Money } from "./types";

export function computeInvoice(params: {
  hammer: Money;
  premiumPct: number;
  taxPct: number;
}): Invoice {
  const { hammer, premiumPct, taxPct } = params;
  const premium = Math.round((hammer * premiumPct) / 100);
  const tax = Math.round((premium * taxPct) / 100);
  const total = hammer + premium + tax;

  const entries: LedgerEntry[] = [
    { party: "buyer", kind: "hammer", amount: hammer },
    { party: "buyer", kind: "premium", amount: premium },
    { party: "buyer", kind: "tax", amount: tax },
  ];

  return { hammer, premium, tax, total, entries };
}
```

- [ ] **Step 4: Re-export from the index**

Append to `packages/core/src/index.ts`:
```ts
export * from "./invoice";
```

- [ ] **Step 5: Run the full suite to verify everything passes**

Run: `pnpm --filter @auction/core test`
Expected: PASS — all five engine modules (increments, auction, softClose, settlement, invoice) plus smoke test green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): add invoice and buyer ledger computation"
```

---

## Self-Review

**Spec coverage (against the Phase 1 design doc):** This plan implements the engine portions of spec §4 (bidding ruleset: proxy bidding, increment table, soft-close, reserve) and §6 (buyer's premium + PPN tax math), plus the forward-compatible `LedgerEntry`/`Invoice` seams from §3 and the `packages/core` boundary from §2. Catalog, accounts, persistence, payments integration, admin, and notifications are **out of scope for Plan 1 by design** and are covered by Plans 2–8 listed in the handoff. No spec requirement assigned to Plan 1 is left without a task.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to" placeholders. Every code step contains complete, runnable code; every test step contains concrete assertions.

**Type consistency:** `Money`, `IncrementTable`, `BidEvent`, `BidResolution`, `LedgerEntry`, `Invoice`, and `Settlement` are defined once (Tasks 2 and 5) and consumed with identical names/shapes in later tasks. Function names are stable across tasks: `minIncrement`, `minNextBid` (Task 2), `resolveBids` (Task 3), `applySoftClose` (Task 4), `settleLot` (Task 5), `computeInvoice` (Task 6). The `index.ts` re-export grows additively and never renames an export.

---

## Next Plans (Phase 1 continuation)

After this plan is green, the remaining Phase 1 plans build on `@auction/core`:
2. **Persistence** — Prisma schema (User/Sale/Lot/Bid/Registration/LedgerEntry/Invoice) + Supabase wiring + repository functions.
3. **Catalog** — public browse, lot detail, Supabase Storage images, shadcn + luxury design language.
4. **Accounts & register-to-bid** — Supabase Auth, registration approval, Xendit card-on-file.
5. **Bidding integration** — `resolveBids`/`applySoftClose` behind API routes + Supabase Realtime + bidding UI.
6. **Payments** — `computeInvoice` → Xendit invoice + webhook reconciliation.
7. **Admin** — staff console for sales/lots/registrations.
8. **Notifications** — Resend transactional emails.
