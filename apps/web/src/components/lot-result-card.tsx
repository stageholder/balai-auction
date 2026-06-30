import Image from "next/image";
import Link from "next/link";
import { formatRupiah } from "@/lib/format";
import type { SearchLotItem, WatchlistItem } from "@auction/db";

/** The fields a catalogue-row needs — shared by search hits and saved lots. */
type LotCardItem = SearchLotItem | WatchlistItem;

/** Compact catalogue-row for a lot — thumbnail, entry, estimate. Links to /lots/[id].
 *  Shared by /search results and /account/saved so both read identically. */
export function LotResultCard({ lot }: { lot: LotCardItem }) {
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
