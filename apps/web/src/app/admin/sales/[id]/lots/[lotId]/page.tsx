import { notFound } from "next/navigation";
import { prisma, getLot } from "@/lib/db";
import { LotForm } from "../lot-form";
import { updateLotAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditLotPage({
  params,
}: {
  params: Promise<{ id: string; lotId: string }>;
}) {
  const { id, lotId } = await params;
  const lot = await getLot(prisma, lotId);
  if (!lot || lot.saleId !== id) notFound();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl">
        Edit Lot {lot.lotNumber} — {lot.title}
      </h1>
      <LotForm lot={lot} action={updateLotAction.bind(null, id, lot.id)} />
    </div>
  );
}
