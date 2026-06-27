import { notFound } from "next/navigation";
import { prisma, getPublishedSale, listLotsForSale } from "@/lib/db";
import { LotCard } from "@/components/lot-card";

export const dynamic = "force-dynamic";

export default async function SalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getPublishedSale(prisma, id);
  if (!sale) notFound();

  const lots = await listLotsForSale(prisma, id);

  return (
    <div>
      <section className="mb-12 max-w-2xl">
        <p className="font-sans text-xs uppercase tracking-[0.15em] text-muted">
          {sale.status}
        </p>
        <h1 className="mt-2 text-4xl leading-tight">{sale.title}</h1>
        {sale.description ? (
          <p className="mt-4 text-muted">{sale.description}</p>
        ) : null}
      </section>

      {lots.length === 0 ? (
        <p className="text-muted">No lots have been catalogued yet.</p>
      ) : (
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {lots.map((lot) => (
            <LotCard key={lot.id} lot={lot} />
          ))}
        </div>
      )}
    </div>
  );
}
