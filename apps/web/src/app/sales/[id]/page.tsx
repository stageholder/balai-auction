import Link from "next/link";
import Image from "next/image";
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
import { FullBleed } from "@/components/full-bleed";
import { SaleRegistration } from "@/components/sale-registration";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const SOLD_STATUSES = new Set(["sold", "paid", "fulfilled"]);

const STATUS_LABEL: Record<string, string> = {
  live: "Live now",
  scheduled: "Upcoming",
  closed: "Results",
};

function statusBadgeVariant(status: string): "default" | "outline" | "muted" {
  if (status === "live") return "default";
  if (status === "closed") return "muted";
  return "outline";
}

function formatSaleDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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

  // The first catalogued lot image doubles as the sale's cover. The masthead
  // band leans on it when present; otherwise we fall back to a quiet wordmark.
  const cover = lots.find((lot) => lot.images[0])?.images[0] ?? null;
  const statusLabel = STATUS_LABEL[sale.status] ?? sale.status;

  return (
    <div>
      {/* ── FULL-BLEED MASTHEAD — cover image with an ink scrim ───────── */}
      <FullBleed className="-mt-12 mb-16">
        <div className="relative min-h-[460px] w-full overflow-hidden bg-ink lg:min-h-[540px]">
          {cover ? (
            <Image
              src={cover}
              alt={sale.title}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : null}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/25"
          />

          <div className="absolute inset-0 flex items-end">
            <div className="mx-auto w-full max-w-6xl px-6 pb-14">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <Badge variant={statusBadgeVariant(sale.status)}>
                  {sale.status === "live" ? "● " : ""}
                  {statusLabel}
                </Badge>
                {department ? (
                  <span className="font-sans text-[11px] uppercase tracking-[0.28em] text-paper/70">
                    {department}
                  </span>
                ) : null}
              </div>

              <h1 className="mt-5 max-w-3xl font-serif text-5xl leading-[0.96] tracking-tight text-paper md:text-7xl">
                {sale.title}
              </h1>

              <p className="tnum mt-6 font-sans text-[12px] uppercase tracking-[0.18em] text-paper/75">
                {formatSaleDate(sale.startsAt)}
                <span aria-hidden="true" className="mx-3 text-paper/40">
                  —
                </span>
                {formatSaleDate(sale.endsAt)}
              </p>

              {sale.description ? (
                <p className="mt-6 max-w-xl font-sans text-sm leading-relaxed text-paper/80">
                  {sale.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </FullBleed>

      {sale.mode === "live" && sale.status === "live" ? (
        <div className="mb-12">
          <a
            href={`/live/${sale.id}`}
            className="inline-flex items-center gap-2 rounded-sm border border-primary px-6 py-3 font-sans text-xs uppercase tracking-[0.18em] text-primary transition-colors hover:bg-primary hover:text-paper"
          >
            <span
              aria-hidden="true"
              className="relative inline-flex h-2 w-2"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Watch live
          </a>
        </div>
      ) : null}

      {isClosed ? (
        /* ── Prices realized band — replaces the call-to-register ─── */
        <div className="mb-16 border-y border-line py-10">
          <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-primary">
            Prices realized
          </p>

          <dl className="mt-6 flex flex-wrap items-end gap-x-12 gap-y-6">
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

          <Link
            href={`/sales/${sale.id}/results`}
            className="group mt-8 inline-flex items-baseline gap-2 font-sans text-sm uppercase tracking-[0.15em] text-primary"
          >
            <span className="border-b border-primary/40 pb-0.5 transition-colors group-hover:border-primary">
              View full results
            </span>
            <span
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        </div>
      ) : (
        <div className="mb-16">
          <SaleRegistration saleId={sale.id} />
        </div>
      )}

      {/* ── Lot grid — the catalogue ─────────────────────────────────── */}
      <section aria-labelledby="catalogue-heading">
        <header className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
          <h2
            id="catalogue-heading"
            className="font-serif text-3xl leading-none tracking-tight text-ink md:text-4xl"
          >
            The Catalogue
          </h2>
          {lots.length > 0 ? (
            <span className="tnum font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {lots.length} {lots.length === 1 ? "lot" : "lots"}
            </span>
          ) : null}
        </header>

        {lots.length === 0 ? (
          <p className="mt-10 font-serif text-2xl italic text-muted-foreground">
            No lots have been catalogued yet.
          </p>
        ) : (
          <div className="mt-10 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {lots.map((lot) => (
              <LotCard key={lot.id} lot={lot} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
