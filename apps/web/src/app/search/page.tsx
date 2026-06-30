import { prisma, searchSales, searchLots } from "@/lib/db";
import { SaleCard } from "@/components/sale-card";
import { LotResultCard } from "@/components/lot-result-card";

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
        <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          The Catalogue
        </p>
        <h1 className="mt-5 font-serif text-5xl leading-[0.95] tracking-tight">
          Search the catalogue
        </h1>
        <p className="mt-6 font-sans text-sm leading-relaxed text-muted-foreground">
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
        <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          Search
        </p>
        <h1 className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight">
          Results for <span className="text-primary">“{q}”</span>
        </h1>
      </section>

      {nothing ? (
        <p className="mt-16 font-serif text-2xl italic text-muted-foreground">
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
                <span className="tnum font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
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
                <span className="tnum font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {lots.length} {lots.length === 1 ? "lot" : "lots"}
                </span>
              </header>
              <div className="mt-2">
                {lots.map((lot) => (
                  <LotResultCard key={lot.id} lot={lot} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
