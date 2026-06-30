import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, getLot, getPublishedSale, getBidEventsForLot, getRegistration, getLotHammer, isWatched } from "@/lib/db";
import { resolveBids, nextBidFloor } from "@auction/core";
import { getCurrentUser } from "@/lib/auth";
import { formatRupiah } from "@/lib/format";
import { LotLive } from "./lot-live";
import { SaveButton } from "./save-button";

export const dynamic = "force-dynamic";

type BidGate =
  | { kind: "open"; floor: number }
  | { kind: "signin" }
  | { kind: "register"; saleId: string }
  | { kind: "closed" };

export default async function LotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lot = await getLot(prisma, id);
  if (!lot) notFound();

  // Hide lots whose parent sale is not published (draft) — same guard as the
  // sale page. getPublishedSale returns null for draft/missing sales.
  const sale = await getPublishedSale(prisma, lot.saleId);
  if (!sale) notFound();

  // Save affordance state, computed for all lifecycle stages (a collector may
  // keep a lot whether it is live, sold, or unsold). The session user is read
  // once here; getCurrentUser is request-memoized, so the live-gate block below
  // reuses the same call. The watched flag is only meaningful when signed in.
  const viewer = await getCurrentUser();
  const watched = viewer ? await isWatched(prisma, viewer.id, lot.id) : false;

  const now = new Date();

  // A lot's outcome panel depends on its lifecycle stage:
  //   • settled (sold/paid/fulfilled) → a result record ("Sold for …")
  //   • unsold                        → stated plainly
  //   • otherwise (live)              → the existing live-bidding / gate path
  const settled =
    lot.status === "sold" ||
    lot.status === "paid" ||
    lot.status === "fulfilled";

  // Hammer is only resolved for settled lots (never shows a buyer).
  const hammer = settled ? await getLotHammer(prisma, lot.id) : null;

  // Live-bidding data is computed only when the lot is still live; settled and
  // unsold lots short-circuit so we avoid needless bid resolution.
  let live: { currentPrice: number; gate: BidGate } | null = null;
  if (!settled && lot.status !== "unsold") {
    const events = await getBidEventsForLot(prisma, lot.id);
    const currentPrice = resolveBids(
      lot.startingPrice,
      events,
      sale.incrementTable
    ).currentPrice;
    const floor = nextBidFloor(lot.startingPrice, events, sale.incrementTable);

    const user = await getCurrentUser();
    let gate: BidGate;
    if (lot.status !== "live" || lot.closesAt <= now) {
      gate = { kind: "closed" };
    } else if (!user) {
      gate = { kind: "signin" };
    } else {
      const reg = await getRegistration(prisma, user.id, lot.saleId);
      gate =
        reg && reg.kycStatus === "approved"
          ? { kind: "open", floor }
          : { kind: "register", saleId: lot.saleId };
    }
    live = { currentPrice, gate };
  }

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

          {/* Lot number label + quiet save affordance — kept on one baseline
              so the bookmark reads as a catalogue mark, not a social button. */}
          <div className="flex items-center justify-between gap-4">
            <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-muted">
              Lot {lot.lotNumber}
            </p>
            {viewer ? (
              <SaveButton lotId={lot.id} initialWatched={watched} />
            ) : (
              <Link
                href="/sign-in"
                className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
              >
                Sign in to save
              </Link>
            )}
          </div>

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

          {/* Outcome panel — result record (settled), plain note (unsold),
              or the live bidding gate (live). */}
          <div className="mt-10">
            {settled ? (
              /* ── Result record — reads like a settled ledger entry ── */
              <div className="relative border border-line bg-paper">
                {/* Solid ink band signals a closed, resolved transaction */}
                <div aria-hidden="true" className="h-[3px] w-full bg-ink" />
                <div className="px-6 pb-7 pt-5">
                  <p className="mb-5 font-sans text-[9px] uppercase tracking-[0.32em] text-muted">
                    Result
                  </p>

                  {hammer !== null ? (
                    <>
                      <p className="mb-1 font-sans text-[9px] uppercase tracking-[0.28em] text-muted">
                        Sold for
                      </p>
                      <p className="tnum font-serif text-[2.2rem] leading-none tracking-tight text-ink">
                        {formatRupiah(hammer)}
                      </p>
                    </>
                  ) : (
                    <p className="font-serif text-[2.2rem] leading-none tracking-tight text-ink">
                      Sold
                    </p>
                  )}

                  {/* Hairline */}
                  <div aria-hidden="true" className="my-5 h-px bg-line" />

                  {/* Estimate carried beneath for context */}
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-sans text-[9px] uppercase tracking-[0.28em] text-muted">
                      Estimate
                    </span>
                    <span className="tnum font-sans text-sm text-ink">
                      {formatRupiah(lot.estimateLow)}
                      <span className="mx-2 text-muted opacity-50">–</span>
                      {formatRupiah(lot.estimateHigh)}
                    </span>
                  </div>
                </div>
              </div>
            ) : lot.status === "unsold" ? (
              /* ── Unsold — no transaction; stated plainly, muted ── */
              <div className="relative border border-line bg-paper">
                {/* Quiet line band — nothing resolved here */}
                <div aria-hidden="true" className="h-[3px] w-full bg-line" />
                <div className="px-6 pb-7 pt-5">
                  <p className="mb-5 font-sans text-[9px] uppercase tracking-[0.32em] text-muted">
                    Result
                  </p>
                  <p className="font-serif text-[2.2rem] leading-none tracking-tight text-muted">
                    Unsold
                  </p>

                  {/* Hairline */}
                  <div aria-hidden="true" className="my-5 h-px bg-line" />

                  {/* Estimate carried beneath for context */}
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-sans text-[9px] uppercase tracking-[0.28em] text-muted">
                      Estimate
                    </span>
                    <span className="tnum font-sans text-sm text-ink">
                      {formatRupiah(lot.estimateLow)}
                      <span className="mx-2 text-muted opacity-50">–</span>
                      {formatRupiah(lot.estimateHigh)}
                    </span>
                  </div>
                </div>
              </div>
            ) : live ? (
              <LotLive
                lotId={lot.id}
                initialPrice={live.currentPrice}
                initialClosesAt={lot.closesAt.toISOString()}
                gate={live.gate}
              />
            ) : null}
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
