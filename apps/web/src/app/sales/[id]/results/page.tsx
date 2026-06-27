import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, getPublishedSale, getPublicSaleResults } from "@/lib/db";
import { departmentLabel } from "@auction/core";
import { formatRupiah } from "@/lib/format";

export const dynamic = "force-dynamic";

const SOLD_STATUSES = new Set(["sold", "paid", "fulfilled"]);

function formatSaleDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PublicSaleResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getPublishedSale(prisma, id);
  if (!sale) notFound();

  const results = await getPublicSaleResults(prisma, id);

  const lotsOffered = results.length;
  const lotsSold = results.filter((r) => SOLD_STATUSES.has(r.status)).length;
  const totalRealized = results.reduce(
    (sum, r) => sum + (r.hammer ?? 0),
    0
  );

  const department = departmentLabel(sale.category);

  return (
    <div className="mx-auto max-w-4xl">
      {/* ── Results header ─────────────────────────────────────── */}
      <header className="border-b border-line pb-10">
        <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-accent">
          Prices realized
        </p>

        <h1 className="font-serif mt-4 text-5xl leading-[1.05] tracking-tight text-ink">
          {sale.title}
        </h1>

        <p className="tnum mt-5 font-sans text-sm text-muted">
          {formatSaleDate(sale.startsAt)}
          {department ? (
            <>
              <span aria-hidden="true" className="mx-3 text-line">
                /
              </span>
              <span className="uppercase tracking-[0.12em]">{department}</span>
            </>
          ) : null}
        </p>

        {/* Realized total — the headline figure */}
        <dl className="mt-9 flex flex-wrap items-end gap-x-12 gap-y-6">
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
      </header>

      {/* ── Results table ──────────────────────────────────────── */}
      {results.length === 0 ? (
        <p className="mt-12 font-sans text-sm text-muted">
          Results are not yet available.
        </p>
      ) : (
        <table className="mt-10 w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-left font-sans text-[10px] uppercase tracking-[0.18em] text-muted">
              <th className="w-16 py-3 font-normal">Lot</th>
              <th className="py-3 font-normal">Title</th>
              <th className="py-3 font-normal">Result</th>
              <th className="py-3 text-right font-normal">Hammer</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const sold = SOLD_STATUSES.has(r.status);
              return (
                <tr
                  key={r.lotId}
                  className="border-b border-line align-baseline"
                >
                  <td className="tnum py-4 font-sans text-sm text-muted">
                    {r.lotNumber}
                  </td>
                  <td className="py-4 pr-6">
                    <Link
                      href={`/lots/${r.lotId}`}
                      className="font-serif text-base text-ink underline-offset-4 transition-colors hover:text-accent hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="py-4 font-sans text-sm">
                    {sold ? (
                      <span className="text-ink">Sold</span>
                    ) : (
                      <span className="text-muted">Unsold</span>
                    )}
                  </td>
                  <td className="tnum py-4 text-right font-sans text-sm text-ink">
                    {sold && r.hammer !== null ? formatRupiah(r.hammer) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
