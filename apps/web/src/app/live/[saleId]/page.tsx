import { notFound } from "next/navigation";
import {
  prisma,
  getPublishedSale,
  listLotsForSale,
  getBidEventsForLot,
  getRegistration,
} from "@/lib/db";
import { resolveBids, nextBidFloor } from "@auction/core";
import { getCurrentUser } from "@/lib/auth";
import {
  LiveSale,
  type LiveActive,
  type LiveGate,
  type LiveSaleLot,
} from "./live-sale";

export const dynamic = "force-dynamic";

export default async function LiveSalePage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const { saleId } = await params;
  // getPublishedSale (not getSale) so draft sales aren't reachable via /live —
  // same visibility rule the catalog/sale page uses.
  const sale = await getPublishedSale(prisma, saleId);
  if (!sale || sale.mode !== "live") notFound();

  const lots = await listLotsForSale(prisma, saleId);
  const liveLots: LiveSaleLot[] = lots.map((l) => ({
    id: l.id,
    lotNumber: l.lotNumber,
    title: l.title,
    startingPrice: l.startingPrice,
  }));

  // Initial active lot (the one currently "live"), with its real price/floor.
  const activeLot = lots.find((l) => l.status === "live") ?? null;
  let initialActive: LiveActive | null = null;
  if (activeLot) {
    const events = await getBidEventsForLot(prisma, activeLot.id);
    initialActive = {
      id: activeLot.id,
      closesAt: activeLot.closesAt.toISOString(),
      currentPrice: resolveBids(
        activeLot.startingPrice,
        events,
        sale.incrementTable
      ).currentPrice,
      floor: nextBidFloor(activeLot.startingPrice, events, sale.incrementTable),
    };
  }

  // Per-sale bid gate.
  let gate: LiveGate;
  if (sale.status === "closed") {
    gate = "closed";
  } else {
    const user = await getCurrentUser();
    if (!user) {
      gate = "signin";
    } else {
      const reg = await getRegistration(prisma, user.id, saleId);
      gate = reg && reg.kycStatus === "approved" ? "open" : "register";
    }
  }

  return (
    <div>
      <header className="mb-10">
        <p className="font-sans text-xs uppercase tracking-[0.2em] text-muted">
          Live auction
        </p>
        <h1 className="mt-2 text-4xl leading-tight">{sale.title}</h1>
      </header>
      <LiveSale
        saleId={saleId}
        lots={liveLots}
        initialActive={initialActive}
        gate={gate}
      />
    </div>
  );
}
