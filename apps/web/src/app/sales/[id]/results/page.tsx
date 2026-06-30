import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  prisma,
  getPublishedSale,
  getPublicSaleResults,
  listLotsForSale,
} from "@/lib/db";
import { departmentLabel } from "@auction/core";
import { formatRupiah } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

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
  // Prices realized only make sense for a finished sale. Gating to "closed"
  // (not just published) prevents direct-URL access mislabelling not-yet-sold
  // lots of a scheduled/live sale as "Unsold".
  if (!sale || sale.status !== "closed") notFound();

  const results = await getPublicSaleResults(prisma, id);

  // Join lot cover images onto the result rows: the public results query does
  // not carry imagery, so we read the lots and map lotId → first image.
  const lots = await listLotsForSale(prisma, id);
  const coverByLotId = new Map<string, string | undefined>(
    lots.map((lot) => [lot.id, lot.images[0]])
  );

  const lotsOffered = results.length;
  const lotsSold = results.filter((r) => SOLD_STATUSES.has(r.status)).length;
  const totalRealized = results.reduce((sum, r) => sum + (r.hammer ?? 0), 0);

  const department = departmentLabel(sale.category);

  return (
    <div className="mx-auto max-w-4xl">
      {/* ── Results header — the realized figures as the headline ─────── */}
      <header className="border-b border-line pb-10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Badge variant="muted">Results</Badge>
          <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-primary">
            Prices realized
          </p>
        </div>

        <h1 className="font-serif mt-4 text-5xl leading-[1.05] tracking-tight text-ink">
          {sale.title}
        </h1>

        <p className="tnum mt-5 font-sans text-sm text-muted-foreground">
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
            <dt className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Total realized
            </dt>
            <dd className="tnum font-serif mt-2 text-4xl leading-none text-ink md:text-5xl">
              {formatRupiah(totalRealized)}
            </dd>
          </div>
          <div className="border-l border-line pl-12">
            <dt className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Lots sold
            </dt>
            <dd className="tnum font-serif mt-2 text-2xl leading-none text-ink">
              {lotsSold}
              <span className="text-muted-foreground"> / {lotsOffered}</span>
            </dd>
          </div>
        </dl>
      </header>

      {/* ── Results — an image row per lot ───────────────────────────── */}
      {results.length === 0 ? (
        <p className="mt-12 font-sans text-sm text-muted-foreground">
          Results are not yet available.
        </p>
      ) : (
        <ul className="mt-6">
          {results.map((r) => {
            const sold = SOLD_STATUSES.has(r.status);
            const cover = coverByLotId.get(r.lotId);
            return (
              <li key={r.lotId} className="border-b border-line">
                <Link
                  href={`/lots/${r.lotId}`}
                  className="group flex items-center gap-5 py-4"
                >
                  {/* Thumbnail */}
                  <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-secondary">
                    {cover ? (
                      <Image
                        src={cover}
                        alt={r.title}
                        fill
                        sizes="64px"
                        className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="font-sans text-[8px] uppercase tracking-[0.2em] text-muted-foreground/50">
                          No image
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Lot number + title */}
                  <div className="min-w-0 flex-1">
                    <p className="tnum font-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      Lot {r.lotNumber}
                    </p>
                    <h2 className="mt-1 truncate font-serif text-lg leading-snug text-ink transition-colors group-hover:text-primary">
                      {r.title}
                    </h2>
                  </div>

                  {/* Hammer / Unsold */}
                  <div className="shrink-0 text-right">
                    {sold && r.hammer !== null ? (
                      <>
                        <p className="font-sans text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                          Hammer
                        </p>
                        <p className="tnum mt-1 font-serif text-lg leading-none text-ink">
                          {formatRupiah(r.hammer)}
                        </p>
                      </>
                    ) : (
                      <p className="font-sans text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Unsold
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
