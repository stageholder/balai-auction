import Link from "next/link";
import { notFound } from "next/navigation";
import {
  prisma,
  getPublishedSale,
  listLotsForSale,
  getPublicSaleResults,
} from "@/lib/db";
import { departmentLabel } from "@auction/core";
import { formatRupiah } from "@/lib/format";
import { LotCard } from "@/components/lot-card";
import { SaleRegistration } from "@/components/sale-registration";

export const dynamic = "force-dynamic";

const SOLD_STATUSES = new Set(["sold", "paid", "fulfilled"]);

export default async function SalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getPublishedSale(prisma, id);
  if (!sale) notFound();

  const lots = await listLotsForSale(prisma, id);
  const department = departmentLabel(sale.category);
  const isClosed = sale.status === "closed";

  // Closed sales read as a results archive: summarize what was realized.
  const results = isClosed ? await getPublicSaleResults(prisma, id) : [];
  const lotsOffered = results.length;
  const lotsSold = results.filter((r) => SOLD_STATUSES.has(r.status)).length;
  const totalRealized = results.reduce((sum, r) => sum + (r.hammer ?? 0), 0);

  return (
    <div>
      <section className="mb-12 max-w-2xl">
        <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-muted">
          {department ? (
            <>
              <span className="text-accent">{department}</span>
              <span aria-hidden="true" className="mx-3 text-line">
                /
              </span>
            </>
          ) : null}
          {sale.status}
        </p>
        <h1 className="mt-3 text-4xl leading-tight">{sale.title}</h1>
        {sale.description ? (
          <p className="mt-4 text-muted">{sale.description}</p>
        ) : null}
      </section>

      {sale.mode === "live" && sale.status === "live" ? (
        <div className="mb-10">
          <a
            href={`/live/${sale.id}`}
            className="inline-block border border-accent px-5 py-2 text-sm uppercase tracking-[0.15em] text-accent hover:bg-accent hover:text-paper"
          >
            ● Watch live
          </a>
        </div>
      ) : null}

      {isClosed ? (
        /* ── Prices realized band — replaces the call-to-register ─── */
        <div className="mb-12 border-y border-line py-9">
          <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-accent">
            Prices realized
          </p>

          <dl className="mt-6 flex flex-wrap items-end gap-x-12 gap-y-6">
            <div>
              <dt className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted">
                Total realized
              </dt>
              <dd className="tnum font-serif mt-2 text-4xl leading-none text-ink">
                {formatRupiah(totalRealized)}
              </dd>
            </div>
            <div className="border-l border-line pl-12">
              <dt className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted">
                Lots sold
              </dt>
              <dd className="tnum font-serif mt-2 text-2xl leading-none text-ink">
                {lotsSold}
                <span className="text-muted"> / {lotsOffered}</span>
              </dd>
            </div>
          </dl>

          <Link
            href={`/sales/${sale.id}/results`}
            className="mt-8 inline-block font-sans text-sm uppercase tracking-[0.15em] text-accent underline-offset-4 hover:underline"
          >
            View full results →
          </Link>
        </div>
      ) : (
        <div className="mb-12">
          <SaleRegistration saleId={sale.id} />
        </div>
      )}

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
