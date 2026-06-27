import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma, getSale, listLotsForSale } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { LotForm } from "./lot-form";
import { createLotAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  live:       "text-accent border-accent",
  sold:       "text-ink border-ink",
  unsold:     "text-muted border-muted",
  paid:       "text-muted border-muted",
  fulfilled:  "text-muted border-muted",
};

export default async function AdminLotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getSale(prisma, id);
  if (!sale) notFound();
  const lots = await listLotsForSale(prisma, id);

  return (
    <div className="space-y-16">

      {/* ── Page header ── */}
      <header className="border-b-2 border-ink pb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-muted mb-1">
          Sale catalogue
        </p>
        <h1 className="font-serif text-3xl text-ink">{sale.title}</h1>
      </header>

      {/* ── Catalogue worksheet ── */}
      <section>
        {/* Column headers — ledger style */}
        <div
          className="grid items-center gap-4 border-b border-ink pb-2 text-xs uppercase tracking-[0.15em] text-muted"
          style={{ gridTemplateColumns: "3rem 3rem 1fr auto 6rem" }}
        >
          <span>Lot</span>
          <span aria-hidden="true" />          {/* thumbnail column */}
          <span>Title</span>
          <span className="tnum text-right">Estimate</span>
          <span className="text-right">Status</span>
        </div>

        {/* Rows */}
        {lots.length === 0 ? (
          <p className="py-8 text-sm text-muted">
            No lots yet — add the first below.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {lots.map((lot) => {
              const isLive = lot.status === "live";
              return (
                <li
                  key={lot.id}
                  className="grid items-center gap-4 py-4 transition-colors hover:bg-line/40"
                  style={{ gridTemplateColumns: "3rem 3rem 1fr auto 6rem" }}
                >
                  {/* Lot number — catalogue plate numeral */}
                  <span
                    className={`font-serif text-xl leading-none tnum ${
                      isLive ? "text-accent" : "text-ink"
                    }`}
                  >
                    {String(lot.lotNumber).padStart(3, "0")}
                  </span>

                  {/* Thumbnail — portrait plate slot */}
                  <div className="relative h-14 w-12 shrink-0 overflow-hidden border border-line bg-line">
                    {lot.images[0] ? (
                      <Image
                        src={lot.images[0]}
                        alt={lot.title}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      /* placeholder hairline cross */
                      <svg
                        className="absolute inset-0 h-full w-full text-line"
                        viewBox="0 0 48 56"
                        aria-hidden="true"
                      >
                        <line x1="0" y1="0" x2="48" y2="56" stroke="currentColor" strokeWidth="1" />
                        <line x1="48" y1="0" x2="0" y2="56" stroke="currentColor" strokeWidth="1" />
                      </svg>
                    )}
                  </div>

                  {/* Title + description snippet */}
                  <div className="min-w-0">
                    <p className="truncate font-serif text-sm text-ink">
                      {lot.title}
                    </p>
                    {lot.description && (
                      <p className="truncate text-xs text-muted mt-0.5">
                        {lot.description}
                      </p>
                    )}
                  </div>

                  {/* Estimate — tabular, right-aligned */}
                  <p className="tnum text-right text-xs text-muted whitespace-nowrap">
                    {formatRupiah(lot.estimateLow)}
                    <span className="mx-1 text-line">–</span>
                    {formatRupiah(lot.estimateHigh)}
                  </p>

                  {/* Status badge — small caps stamp */}
                  <span
                    className={`tnum block border px-2 py-0.5 text-right text-xs uppercase tracking-[0.12em] ${
                      STATUS_STYLES[lot.status] ?? "text-muted border-muted"
                    }`}
                  >
                    {lot.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {/* Foot rule */}
        {lots.length > 0 && (
          <div className="mt-0 border-t-2 border-ink" />
        )}
      </section>

      {/* ── Add lot ── */}
      <section>
        {/* Section divider with accent rule */}
        <div className="mb-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-line" />
          <h2 className="font-serif text-xl text-ink">Add lot</h2>
          <div className="h-px flex-1 bg-line" />
        </div>

        <LotForm action={createLotAction.bind(null, id)} />
      </section>

    </div>
  );
}
