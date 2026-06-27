# Phase 2 — Plan 2: Live-Runner Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the stateful `live-runner` service that sequences live sales — open lot → short timer → close+settle → advance — broadcasting each transition, plus keep the existing close-lots cron away from live-mode lots.

**Architecture:** A new `services/live-runner` Node process. Its core is `tickSale(sale, deps, now)` — calls the pure `advanceLiveSale` (Plan 1) and dispatches the resulting action through **injected dependencies** (repo functions + a broadcaster), so it's fully unit-tested with fakes (no DB, no live Supabase). The `index.ts` loop wires the real deps (`@auction/db` repos + a Supabase REST broadcaster) and ticks every ~1s over `listRunningLiveSales`. The existing timed close-lots cron is made mode-aware so it no longer competes to close live lots.

**Tech Stack:** Node + TypeScript (tsx in dev, Docker in prod), `@auction/core` (`advanceLiveSale`), `@auction/db` (repos + `prisma`), Supabase REST broadcast, Vitest.

## Global Constraints

- **Node.js >= 20**, **pnpm only** (the runner is a new pnpm workspace package under `services/*`).
- **Timed sales unchanged.** The cron mode-fix only narrows the cron to `mode:"timed"` lots; timed behavior is identical.
- **The runner is single-instance.** `closeLot`/`openQueuedLot` are already atomic+idempotent (Plan 1/5), so a duplicated runner cannot double-settle, but the design assumes one runner.
- **`tickSale` takes injected deps** (`TickDeps`) — no direct `prisma`/`fetch` inside it — so it is unit-tested with fakes. The real wiring lives only in `index.ts`.
- **Broadcast channel/topic:** sale-level events on `sale:{saleId}` (events `lot-opened`, `lot-closed`, `sale-ended`); per-lot price stays on `lot:{lotId}` from `placeBid` (unchanged). Server-side broadcast uses the Supabase REST endpoint with the **service-role** key.
- **Per-lot live close** = `now + sale.liveLotSeconds * 1000`.
- **TDD** for the cron mode-fix and `tickSale`. The broadcaster (network I/O) and the `index.ts` loop are verified by build + a local run.
- Suites must stay green: `@auction/core` (36), `@auction/db` (61→ grows), `@auction/web` (25), plus a new `@auction/live-runner` suite.

---

### Task 1: Keep the close-lots cron off live-mode lots

**Files:**
- Modify: `packages/db/src/repositories/lots.ts` (`getLotsDueToClose`)
- Modify: `packages/db/src/repositories/lots.test.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `lotRowToRecord`.
- Produces: `getLotsDueToClose` now returns only **timed-mode** sales' due lots (the cron's scope); live-mode lots are sequenced by the runner.

- [ ] **Step 1: Write the failing test**

Append to `packages/db/src/repositories/lots.test.ts`:
```ts
describe("getLotsDueToClose excludes live-mode lots", () => {
  it("returns only due lots whose sale is timed-mode", async () => {
    const past = new Date("2026-07-01T00:00:00.000Z");
    const now = new Date("2026-07-10T00:00:00.000Z");

    const timedSale = await createSale(db, {
      ...sampleSaleForLots(),
      // sampleSaleForLots() helper below provides the required fields
    });
    const liveSale = await createSale(db, {
      ...sampleSaleForLots(),
      mode: "live",
    });
    const timedLot = await createLot(db, lotIn(timedSale.id, 1, past));
    await createLot(db, lotIn(liveSale.id, 1, past)); // live-mode, due, but excluded

    const due = await getLotsDueToClose(db, now);
    expect(due.map((l) => l.id)).toEqual([timedLot.id]);
  });
});

// helpers local to this test
function sampleSaleForLots() {
  return {
    title: "Sale",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-08T00:00:00.000Z"),
    buyersPremiumPct: 20,
    taxPct: 11,
    incrementTable: [{ upTo: null, step: 100_000 }],
  };
}
function lotIn(saleId: string, lotNumber: number, closesAt: Date) {
  return {
    saleId,
    lotNumber,
    title: `Lot ${lotNumber}`,
    estimateLow: 1_000_000,
    estimateHigh: 2_000_000,
    startingPrice: 1_000_000,
    reserve: null,
    closesAt,
  };
}
```
(If `sampleSaleForLots`/`lotIn` collide with existing helpers in the file, rename the local ones; the test only needs a timed sale + a live sale each with a due `live`-status lot.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/db test src/repositories/lots.test.ts`
Expected: FAIL — both lots returned (the live-mode lot is not yet excluded).

- [ ] **Step 3: Add the mode filter**

In `packages/db/src/repositories/lots.ts`, change `getLotsDueToClose`'s query to require the parent sale be timed-mode:
```ts
export async function getLotsDueToClose(
  db: PrismaClient,
  now: Date
): Promise<LotRecord[]> {
  const rows = await db.lot.findMany({
    where: {
      status: "live",
      closesAt: { lte: now },
      sale: { mode: "timed" },
    },
    orderBy: { closesAt: "asc" },
  });
  return rows.map(lotRowToRecord);
}
```

- [ ] **Step 4: Run the db suite**

Run: `pnpm --filter @auction/db test`
Expected: PASS — the new exclusion test plus all prior db tests (existing close-lots tests use timed-mode sales by default, so they're unaffected).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src
git commit -m "fix(db): close-lots cron only sweeps timed-mode lots"
```

---

### Task 2: `live-runner` package scaffold + broadcaster

**Files:**
- Modify: `pnpm-workspace.yaml` (add `services/*`)
- Create: `services/live-runner/package.json`
- Create: `services/live-runner/tsconfig.json`
- Create: `services/live-runner/vitest.config.ts`
- Create: `services/live-runner/.env.example`
- Create: `services/live-runner/src/broadcast.ts`
- Create: `services/live-runner/src/broadcast.test.ts`

**Interfaces:**
- Consumes: nothing internal yet.
- Produces:
  - The `@auction/live-runner` package with `pnpm --filter @auction/live-runner test`.
  - `createBroadcaster(url: string, serviceKey: string): (topic: string, event: string, payload: unknown) => Promise<void>` and `type Broadcast = ReturnType<typeof createBroadcaster>`.

- [ ] **Step 1: Register the workspace glob**

In `pnpm-workspace.yaml`, add `services/*`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "services/*"
```

- [ ] **Step 2: Create the package manifest + config**

`services/live-runner/package.json`:
```json
{
  "name": "@auction/live-runner",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@auction/core": "workspace:*",
    "@auction/db": "workspace:*",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`services/live-runner/tsconfig.json`:
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
  "include": ["src"]
}
```

`services/live-runner/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
```

`services/live-runner/.env.example`:
```
# Domain DB (same as @auction/db). Local dev = Docker Postgres on 5434.
DATABASE_URL="postgresql://auction:auction@localhost:5434/auction"
# Supabase (for sale-channel broadcasts). Local = `supabase start` values.
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
SUPABASE_SERVICE_ROLE_KEY="<local service_role key>"
# Loop interval (ms)
RUNNER_TICK_MS="1000"
```

- [ ] **Step 3: Write the failing test for the broadcaster**

`services/live-runner/src/broadcast.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createBroadcaster } from "./broadcast";

afterEach(() => vi.restoreAllMocks());

describe("createBroadcaster", () => {
  it("POSTs a broadcast message to the Supabase realtime endpoint", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));

    const broadcast = createBroadcaster("http://sb.local", "service-key");
    await broadcast("sale:s1", "lot-opened", { lotId: "l1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://sb.local/realtime/v1/api/broadcast");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.apikey).toBe("service-key");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages[0]).toEqual({
      topic: "sale:s1",
      event: "lot-opened",
      payload: { lotId: "l1" },
    });
  });

  it("never throws when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const broadcast = createBroadcaster("http://sb.local", "service-key");
    await expect(
      broadcast("sale:s1", "sale-ended", {})
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm install && pnpm --filter @auction/live-runner test`
Expected: FAIL — cannot resolve `./broadcast`.

- [ ] **Step 5: Write the broadcaster**

`services/live-runner/src/broadcast.ts`:
```ts
export type Broadcast = (
  topic: string,
  event: string,
  payload: unknown
) => Promise<void>;

/** A sale-channel broadcaster backed by the Supabase Realtime REST endpoint.
 *  Best-effort: never throws into the caller (a failed broadcast must not stop
 *  the runner from advancing the sale). */
export function createBroadcaster(url: string, serviceKey: string): Broadcast {
  return async (topic, event, payload) => {
    try {
      const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: serviceKey },
        body: JSON.stringify({ messages: [{ topic, event, payload }] }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(`broadcast ${topic}/${event}: ${res.status} ${detail}`);
      }
    } catch (err) {
      console.error(`broadcast ${topic}/${event} failed:`, err);
    }
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @auction/live-runner test`
Expected: PASS — both broadcaster tests.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml services/live-runner pnpm-lock.yaml
git commit -m "feat(live-runner): scaffold package + Supabase REST broadcaster"
```

---

### Task 3: `tickSale` — the dependency-injected sequencer step

**Files:**
- Create: `services/live-runner/src/tick.ts`
- Create: `services/live-runner/src/tick.test.ts`

**Interfaces:**
- Consumes: `advanceLiveSale`, `LiveLot`, `LiveAdvanceAction` (`@auction/core`); `Broadcast` (Task 2).
- Produces:
  - `interface TickSaleInput { id: string; status: string; startsAt: Date; liveLotSeconds: number }`
  - `interface TickDeps { listLots(saleId: string): Promise<LiveLot[]>; openLot(lotId: string, closesAt: Date): Promise<unknown>; closeLot(lotId: string, now: Date): Promise<unknown>; finishSale(saleId: string): Promise<unknown>; broadcast: Broadcast }`
  - `tickSale(sale: TickSaleInput, deps: TickDeps, now: Date): Promise<LiveAdvanceAction>`

- [ ] **Step 1: Write the failing test**

`services/live-runner/src/tick.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import type { LiveLot } from "@auction/core";
import { tickSale, type TickDeps, type TickSaleInput } from "./tick";

const START = new Date("2026-07-01T10:00:00.000Z");
const NOW = new Date("2026-07-01T10:05:00.000Z");

function fakeDeps(lots: LiveLot[]): TickDeps & {
  openLot: ReturnType<typeof vi.fn>;
  closeLot: ReturnType<typeof vi.fn>;
  finishSale: ReturnType<typeof vi.fn>;
  broadcast: ReturnType<typeof vi.fn>;
} {
  return {
    listLots: vi.fn().mockResolvedValue(lots),
    openLot: vi.fn().mockResolvedValue(undefined),
    closeLot: vi.fn().mockResolvedValue(undefined),
    finishSale: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn().mockResolvedValue(undefined),
  };
}

const sale: TickSaleInput = {
  id: "s1",
  status: "live",
  startsAt: START,
  liveLotSeconds: 45,
};

function lot(id: string, n: number, status: string, closesAt: Date): LiveLot {
  return { id, lotNumber: n, status, closesAt };
}

describe("tickSale", () => {
  it("opens the next queued lot with closesAt = now + liveLotSeconds and broadcasts", async () => {
    const deps = fakeDeps([lot("a", 1, "queued", NOW)]);
    const action = await tickSale(sale, deps, NOW);

    expect(action).toEqual({ kind: "open", lotId: "a" });
    const expectedClose = new Date(NOW.getTime() + 45_000);
    expect(deps.openLot).toHaveBeenCalledWith("a", expectedClose);
    expect(deps.broadcast).toHaveBeenCalledWith("sale:s1", "lot-opened", {
      lotId: "a",
      closesAt: expectedClose.toISOString(),
    });
  });

  it("closes the active lot when expired and broadcasts", async () => {
    const past = new Date("2026-07-01T10:04:00.000Z");
    const deps = fakeDeps([lot("a", 1, "live", past)]);
    const action = await tickSale(sale, deps, NOW);

    expect(action).toEqual({ kind: "close", lotId: "a" });
    expect(deps.closeLot).toHaveBeenCalledWith("a", NOW);
    expect(deps.broadcast).toHaveBeenCalledWith("sale:s1", "lot-closed", {
      lotId: "a",
    });
  });

  it("finishes the sale when no lots remain and broadcasts", async () => {
    const deps = fakeDeps([lot("a", 1, "sold", NOW)]);
    const action = await tickSale(sale, deps, NOW);

    expect(action).toEqual({ kind: "finish" });
    expect(deps.finishSale).toHaveBeenCalledWith("s1");
    expect(deps.broadcast).toHaveBeenCalledWith("sale:s1", "sale-ended", {});
  });

  it("does nothing while the active lot's timer is still running", async () => {
    const future = new Date("2026-07-01T10:06:00.000Z");
    const deps = fakeDeps([lot("a", 1, "live", future)]);
    const action = await tickSale(sale, deps, NOW);

    expect(action).toEqual({ kind: "wait" });
    expect(deps.openLot).not.toHaveBeenCalled();
    expect(deps.closeLot).not.toHaveBeenCalled();
    expect(deps.finishSale).not.toHaveBeenCalled();
    expect(deps.broadcast).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @auction/live-runner test src/tick.test.ts`
Expected: FAIL — cannot resolve `./tick`.

- [ ] **Step 3: Write `tickSale`**

`services/live-runner/src/tick.ts`:
```ts
import {
  advanceLiveSale,
  type LiveAdvanceAction,
  type LiveLot,
} from "@auction/core";
import type { Broadcast } from "./broadcast";

export interface TickSaleInput {
  id: string;
  status: string;
  startsAt: Date;
  liveLotSeconds: number;
}

export interface TickDeps {
  listLots(saleId: string): Promise<LiveLot[]>;
  openLot(lotId: string, closesAt: Date): Promise<unknown>;
  closeLot(lotId: string, now: Date): Promise<unknown>;
  finishSale(saleId: string): Promise<unknown>;
  broadcast: Broadcast;
}

/** Advance one live sale by one step: decide via the pure sequencer, then
 *  dispatch the effect through injected deps + broadcast. Returns the action. */
export async function tickSale(
  sale: TickSaleInput,
  deps: TickDeps,
  now: Date
): Promise<LiveAdvanceAction> {
  const lots = await deps.listLots(sale.id);
  const action = advanceLiveSale(sale.status, sale.startsAt, lots, now);
  const topic = `sale:${sale.id}`;

  switch (action.kind) {
    case "open": {
      const closesAt = new Date(now.getTime() + sale.liveLotSeconds * 1000);
      await deps.openLot(action.lotId, closesAt);
      await deps.broadcast(topic, "lot-opened", {
        lotId: action.lotId,
        closesAt: closesAt.toISOString(),
      });
      break;
    }
    case "close": {
      await deps.closeLot(action.lotId, now);
      await deps.broadcast(topic, "lot-closed", { lotId: action.lotId });
      break;
    }
    case "finish": {
      await deps.finishSale(sale.id);
      await deps.broadcast(topic, "sale-ended", {});
      break;
    }
    case "wait":
      break;
  }
  return action;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @auction/live-runner test`
Expected: PASS — all four `tickSale` cases plus the broadcaster tests.

- [ ] **Step 5: Commit**

```bash
git add services/live-runner/src
git commit -m "feat(live-runner): tickSale dependency-injected sequencer step"
```

---

### Task 4: Runner loop (`index.ts`) + Docker deployment

**Files:**
- Create: `services/live-runner/src/index.ts`
- Create: `services/live-runner/Dockerfile`
- Modify: `docker-compose.yml` (add the `live-runner` service)
- Create: `services/live-runner/README.md`

**Interfaces:**
- Consumes: `prisma`, `listRunningLiveSales`, `listLotsForSale`, `openQueuedLot`, `closeLot`, `updateSaleStatus` (`@auction/db`); `createBroadcaster` (Task 2); `tickSale` (Task 3).
- Produces: a runnable service (`pnpm --filter @auction/live-runner dev`) and a docker-compose `live-runner` service.

- [ ] **Step 1: Write the loop wiring**

`services/live-runner/src/index.ts`:
```ts
import "dotenv/config";
import {
  prisma,
  listRunningLiveSales,
  listLotsForSale,
  openQueuedLot,
  closeLot,
  updateSaleStatus,
} from "@auction/db";
import type { LiveLot } from "@auction/core";
import { createBroadcaster } from "./broadcast";
import { tickSale, type TickDeps } from "./tick";

const TICK_MS = Number(process.env.RUNNER_TICK_MS ?? "1000");

function buildDeps(): TickDeps {
  const broadcast = createBroadcaster(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  return {
    listLots: async (saleId): Promise<LiveLot[]> => {
      const lots = await listLotsForSale(prisma, saleId);
      return lots.map((l) => ({
        id: l.id,
        lotNumber: l.lotNumber,
        status: l.status,
        closesAt: l.closesAt,
      }));
    },
    openLot: (lotId, closesAt) => openQueuedLot(prisma, lotId, closesAt),
    closeLot: (lotId, now) => closeLot(prisma, lotId, now),
    finishSale: (saleId) => updateSaleStatus(prisma, saleId, "closed"),
    broadcast,
  };
}

async function tick(deps: TickDeps): Promise<void> {
  const now = new Date();
  const sales = await listRunningLiveSales(prisma);
  for (const sale of sales) {
    try {
      await tickSale(
        {
          id: sale.id,
          status: sale.status,
          startsAt: sale.startsAt,
          liveLotSeconds: sale.liveLotSeconds,
        },
        deps,
        now
      );
    } catch (err) {
      console.error(`tick failed for sale ${sale.id}:`, err);
    }
  }
}

async function main(): Promise<void> {
  const deps = buildDeps();
  console.log(`live-runner started (tick ${TICK_MS}ms)`);
  let running = false;
  setInterval(() => {
    if (running) return; // skip overlap if a tick runs long
    running = true;
    void tick(deps).finally(() => {
      running = false;
    });
  }, TICK_MS);
}

void main();
```

- [ ] **Step 2: Verify it runs locally**

With Docker Postgres up + seeded and `services/live-runner/.env` set (copy `.env.example`, fill the local Supabase service key):
```bash
cp services/live-runner/.env.example services/live-runner/.env   # then edit the key
pnpm install
pnpm --filter @auction/live-runner test
timeout 5 pnpm --filter @auction/live-runner start || true
```
Expected: tests pass; `start` prints `live-runner started (tick 1000ms)` and ticks without error (it idles when there are no running live sales). (`timeout` just bounds the manual check.)

- [ ] **Step 3: Add the Dockerfile**

`services/live-runner/Dockerfile`:
```dockerfile
# Build from the monorepo root: docker build -f services/live-runner/Dockerfile .
FROM node:20-slim
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
WORKDIR /repo/services/live-runner
CMD ["pnpm", "start"]
```

- [ ] **Step 4: Add the docker-compose service**

In `docker-compose.yml`, add a `live-runner` service (alongside `postgres`):
```yaml
  live-runner:
    build:
      context: .
      dockerfile: services/live-runner/Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: "postgresql://auction:auction@postgres:5432/auction"
      NEXT_PUBLIC_SUPABASE_URL: "${NEXT_PUBLIC_SUPABASE_URL}"
      SUPABASE_SERVICE_ROLE_KEY: "${SUPABASE_SERVICE_ROLE_KEY}"
      RUNNER_TICK_MS: "1000"
    restart: unless-stopped
```
(Inside Compose the runner reaches Postgres at `postgres:5432`; the Supabase URL/key come from the host environment or a `.env` next to `docker-compose.yml`. Validate the compose file syntax:)
```bash
docker compose config >/dev/null && echo "compose OK"
```
(Do NOT build the image during this task — it installs the whole workspace and is slow; building is a deploy step. The runner is verified locally via tsx in Step 2.)

- [ ] **Step 5: Document operating the runner**

`services/live-runner/README.md`:
```markdown
# @auction/live-runner

Sequences **live-mode** sales: opens each queued lot for `Sale.liveLotSeconds`,
closes+settles it via `@auction/db closeLot` when the timer expires (with
`placeBid`'s short live anti-snipe), and advances to the next lot — broadcasting
`lot-opened` / `lot-closed` / `sale-ended` on the `sale:{saleId}` Supabase
channel. Timed sales are handled by the web app's close-lots cron, not here.

## Run (dev)
    cp services/live-runner/.env.example services/live-runner/.env   # set the Supabase service key
    docker compose up -d postgres
    pnpm --filter @auction/live-runner dev

## Run (Docker / deploy)
The `live-runner` service in `docker-compose.yml` builds from
`services/live-runner/Dockerfile`. Provide `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (hosted Supabase in prod) via the host env / a
`.env` beside `docker-compose.yml`. Run a single instance.

## How it works
`index.ts` loops every `RUNNER_TICK_MS` over `listRunningLiveSales`, calling
`tickSale` (pure decision via `@auction/core advanceLiveSale` + injected repo
effects). One instance only; `closeLot`/`openQueuedLot` are atomic so a stray
second instance can't double-settle.
```

- [ ] **Step 6: Commit**

```bash
git add services/live-runner docker-compose.yml
git commit -m "feat(live-runner): runner loop, Dockerfile, and compose service"
```

---

## Self-Review

**Spec coverage (against the Phase 2 design doc §3, §7 + Plan 1 carry-forward):**
- §3 the live-runner sequencer → `tickSale` (Task 3, unit-tested via DI) + the `index.ts` loop (Task 4) calling the pure `advanceLiveSale` and reusing `closeLot`/`openQueuedLot`/`updateSaleStatus`.
- §3 sale-channel broadcasts (`lot-opened`/`lot-closed`/`sale-ended` on `sale:{id}`) → the broadcaster (Task 2) + `tickSale` (Task 3).
- §7 docker-compose `live-runner` service + dev script → Task 4.
- **Plan 1 carry-forward (cron ownership)** → Task 1 narrows `getLotsDueToClose` to `mode:"timed"`, so the cron no longer competes to close live lots (which would skip the broadcast/advance). The runner is the sole closer of live lots.
- Plan 1 carry-forward (queued seeding) is **Plan 4's** job; for now the runner is unit-tested with `tickSale`'s fake `listLots` returning queued lots — no DB seeding of `queued` needed to test the runner core. A full DB e2e across a multi-lot live sale lands once Plan 4 enables `queued` creation.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step has complete code. The broadcaster's network call and the loop are verified by build + a bounded local run; their logic-bearing parts (`tickSale`, the broadcaster request shape, the cron filter) are unit/DB-tested.

**Type consistency:** `tickSale(sale, deps, now)` + `TickDeps`/`TickSaleInput` defined once (Task 3) and wired in `index.ts` (Task 4). `Broadcast`/`createBroadcaster` (Task 2) consumed by both `tick.ts` and `index.ts`. `LiveLot` (Plan 1 core) is the shared shape between `advanceLiveSale`, `tickSale`, and the `listLots` mapping. Repo calls match Plan 1 (`listRunningLiveSales`, `openQueuedLot(prisma,id,closesAt)`, `listLotsForSale`) + Plan 5/7 (`closeLot(prisma,id,now)`, `updateSaleStatus(prisma,id,"closed")`). `Sale.liveLotSeconds` (Plan 1) drives the per-lot `closesAt`.

---

## Next Plans (Phase 2 continuation)

3. **Live bidder UI** — `/live/[saleId]` subscribing to the `sale:{id}` channel for auto-advance, built on `LotLive`; the runner's broadcasts drive it.
4. **Admin live controls** — sale `mode`/`liveLotSeconds` in the admin form + `queued` lot creation for live sales (optional `status` on `NewLot`), enabling a full DB e2e of the runner.
