import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma, getLot } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function LotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lot = await getLot(prisma, id);
  if (!lot) notFound();

  const cover = lot.images[0];

  return (
    <article className="pb-24">
      {/* ── breadcrumb-style lot designator ── */}
      <div className="mb-10 flex items-center gap-3">
        <span className="font-sans text-[10px] uppercase tracking-[0.28em] text-muted">
          Catalogue
        </span>
        <span aria-hidden="true" className="h-px w-8 bg-line" />
        <span className="font-sans text-[10px] uppercase tracking-[0.28em] text-muted">
          Lot {lot.lotNumber}
        </span>
      </div>

      {/* ── two-column layout: image | details ── */}
      <div className="grid gap-16 lg:grid-cols-[55fr_45fr]">

        {/* ── Gallery image panel ── */}
        <div className="relative">
          {/* Outer mount — warm cream, inset shadow */}
          <div className="relative bg-paper p-4 ring-1 ring-line">
            {/* Inner image frame */}
            <div className="relative aspect-[4/5] overflow-hidden bg-line">
              {cover ? (
                <Image
                  src={cover}
                  alt={lot.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  className="object-cover"
                  priority
                />
              ) : (
                // Placeholder when no image — gallery-grey
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-sans text-xs uppercase tracking-widest text-muted opacity-40">
                    Image unavailable
                  </span>
                </div>
              )}
            </div>

            {/* Caption strip — lot number etched beneath the image */}
            <div className="mt-3 flex items-center justify-between">
              <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-muted opacity-60">
                Lot {lot.lotNumber}
              </span>
              <span aria-hidden="true" className="h-px flex-1 mx-4 bg-line" />
              <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-muted opacity-60">
                Detail
              </span>
            </div>
          </div>
        </div>

        {/* ── Catalogue details panel ── */}
        <div className="flex flex-col lg:pt-2">

          {/* Lot number label — ultra-spaced caps */}
          <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-muted">
            Lot {lot.lotNumber}
          </p>

          {/* Hairline separator */}
          <div aria-hidden="true" className="mt-4 mb-5 h-px bg-line" />

          {/* Title — display serif, generous leading */}
          <h1 className="font-serif text-[2.6rem] leading-[1.15] tracking-tight text-ink">
            {lot.title}
          </h1>

          {/* Hairline separator */}
          <div aria-hidden="true" className="mt-8 mb-7 h-px bg-line" />

          {/* Price block — structured catalogue entry */}
          <div className="space-y-5">
            {/* Estimate */}
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted">
                Estimate
              </span>
              <span className="tnum font-sans text-base text-ink">
                {formatRupiah(lot.estimateLow)}
                <span className="mx-2 text-muted opacity-50">–</span>
                {formatRupiah(lot.estimateHigh)}
              </span>
            </div>

            {/* Starting bid */}
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted">
                Starting bid
              </span>
              <span className="tnum font-sans text-base text-ink">
                {formatRupiah(lot.startingPrice)}
              </span>
            </div>
          </div>

          {/* Hairline separator */}
          <div aria-hidden="true" className="mt-7 mb-7 h-px bg-line" />

          {/* Description — editorial prose */}
          {lot.description ? (
            <p className="max-w-prose font-sans text-sm leading-[1.85] text-muted">
              {lot.description}
            </p>
          ) : null}

          {/* CTA block — pushed to bottom on larger screens */}
          <div className="mt-auto pt-10">
            <Button variant="accent" disabled className="w-full sm:w-auto">
              Register to bid
            </Button>
            <p className="mt-3 font-sans text-[10px] uppercase tracking-[0.18em] text-muted opacity-70">
              Bidding opens with registration &mdash; coming soon
            </p>
          </div>
        </div>
      </div>

      {/* ── Provenance footer rule ── */}
      <div aria-hidden="true" className="mt-20 h-px bg-line" />
      <p className="mt-4 font-sans text-[9px] uppercase tracking-[0.25em] text-muted opacity-40">
        All estimates are subject to change. Final hammer price may vary.
      </p>
    </article>
  );
}
