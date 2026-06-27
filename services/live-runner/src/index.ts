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
