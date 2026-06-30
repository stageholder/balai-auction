import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma, getLot, listConsignors, listBidsForLot } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { BidActivity } from "@/components/bid-activity";
import { LotForm } from "../lot-form";
import { updateLotAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditLotPage({
  params,
}: {
  params: Promise<{ id: string; lotId: string }>;
}) {
  await requireStaff();
  const { id, lotId } = await params;
  const lot = await getLot(prisma, lotId);
  if (!lot || lot.saleId !== id) notFound();
  const consignors = await listConsignors(prisma);
  const bids = await listBidsForLot(prisma, lotId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href={`/admin/sales/${id}/lots`}
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to lots
        </Link>
        <h2 className="mt-3 font-serif text-3xl text-ink">
          Lot {lot.lotNumber} — {lot.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the catalogue entry, valuation, and consignment details.
        </p>
      </div>
      <section aria-labelledby="bidding-activity" className="space-y-4">
        <h3
          id="bidding-activity"
          className="font-sans text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground"
        >
          Bidding activity
        </h3>
        <BidActivity bids={bids} startingPrice={lot.startingPrice} reveal />
      </section>

      <LotForm
        lot={lot}
        consignors={consignors}
        action={updateLotAction.bind(null, id, lot.id)}
      />
    </div>
  );
}
