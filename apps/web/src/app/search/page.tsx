import Image from "next/image";
import Link from "next/link";
import { prisma, searchSales, searchLots } from "@/lib/db";
import { SaleCard } from "@/components/sale-card";
import { formatRupiah } from "@/lib/format";
import type { SearchLotItem } from "@auction/db";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = (await searchParams).q?.trim() ?? "";

  // No query — a calm invitation, no database round-trip.
  if (!q) {
    return (
      <div className="mx-auto max-w-2xl py-24 text-center">
        <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-muted">
          The Catalogue
        </p>
        <h1 className="mt-5 font-serif text-5xl leading-[0.95] tracking-tight">
          Search the catalogue
        </h1>
        <p className="mt-6 font-sans text-sm leading-relaxed text-muted">
          Look across every sale and lot — by maker, medium, or title. Begin
          from the search field above to find what is coming under the hammer.
        </p>
      </div>
    );
  }

  const [sales, lots] = await Promise.all([
    searchSales(prisma, q),
    searchLots(prisma, q),
  ]);

  const nothing = sales.length === 0 && lots.length === 0;

  return (
    <div>
      {/* Editorial header — echoes the query */}
      <section className="max-w-3xl">
        <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-muted">
          Search
        </p>
        <h1 className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight">
          Results for <span className="text-accent">“{q}”</span>
        </h1>
      </section>

      {nothing ? (
        <p className="mt-16 font-serif text-2xl italic text-muted">
          No results for “{q}”.
        </p>
      ) : (
        <div className="mt-16 space-y-20">
          {/* Sales */}
          {sales.length > 0 ? (
            <section>
              <header className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
                <h2 className="font-serif text-4xl leading-none tracking-tight text-ink">
                  Sales
                </h2>
                <span className="tnum font-sans text-[11px] uppercase tracking-[0.2em] text-muted">
                  {sales.length} {sales.length === 1 ? "sale" : "sales"}
                </span>
              </header>
              <div className="mt-6 grid gap-x-12 sm:grid-cols-2">
                {sales.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Lots */}
          {lots.length > 0 ? (
            <section>
              <header className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
                <h2 className="font-serif text-4xl leading-none tracking-tight text-ink">
                  Lots
                </h2>
                <span className="tnum font-sans text-[11px] uppercase tracking-[0.2em] text-muted">
                  {lots.length} {lots.length === 1 ? "lot" : "lots"}
                </span>
              </header>
              <div className="mt-2">
                {lots.map((lot) => (
                  <LotResult key={lot.id} lot={lot} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Compact catalogue-row for a lot hit — thumbnail, entry, estimate. */
function LotResult({ lot }: { lot: SearchLotItem }) {
  return (
    <Link href={`/lots/${lot.id}`} className="group block">
      <article className="flex items-center gap-6 border-b border-line py-5 transition-colors duration-300 hover:border-ink">
        {/* Thumbnail — sealed chamber */}
        <div className="relative aspect-square w-20 shrink-0 overflow-hidden bg-line">
          {lot.image ? (
            <Image
              src={lot.image}
              alt={lot.title}
              fill
              sizes="80px"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
            />
          ) : null}
        </div>

        {/* Catalogue entry */}
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted">
            Lot {lot.lotNumber}
            <span aria-hidden="true" className="mx-2 text-line">
              /
            </span>
            {lot.saleTitle}
          </p>
          <h3 className="font-serif mt-1.5 truncate text-2xl leading-snug text-ink transition-colors duration-200 group-hover:text-accent">
            {lot.title}
          </h3>
        </div>

        {/* Estimate — tabular, right-aligned */}
        <p className="tnum hidden shrink-0 text-right font-sans text-[11px] text-muted sm:block">
          Est. {formatRupiah(lot.estimateLow)} – {formatRupiah(lot.estimateHigh)}
        </p>
      </article>
    </Link>
  );
}
