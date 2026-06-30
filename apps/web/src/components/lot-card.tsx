import Image from "next/image";
import Link from "next/link";
import type { LotRecord } from "@auction/db";
import { formatRupiah } from "@/lib/format";

export function LotCard({ lot }: { lot: LotRecord }) {
  const cover = lot.images[0];

  return (
    <Link href={`/lots/${lot.id}`} className="group block">
      {/* Image hero — sealed chamber, scale on hover */}
      <div className="relative aspect-[4/5] overflow-hidden bg-line">
        {cover ? (
          <Image
            src={cover}
            alt={lot.title}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : null}
      </div>

      {/* Catalog entry block */}
      <div className="pt-4">
        {/* Ornamental hairline — catalog separator */}
        <div
          aria-hidden="true"
          className="mb-3 h-px w-8 bg-muted-foreground opacity-40"
        />

        {/* Lot number label */}
        <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Lot {lot.lotNumber}
        </p>

        {/* Title — display serif */}
        <h3 className="font-serif mt-2 text-[22px] leading-snug text-ink transition-colors duration-200 group-hover:text-primary">
          {lot.title}
        </h3>

        {/* Estimate range — tabular numerals, restrained */}
        <p className="tnum mt-3 font-sans text-[11px] text-muted-foreground">
          Est. {formatRupiah(lot.estimateLow)} – {formatRupiah(lot.estimateHigh)}
        </p>
      </div>
    </Link>
  );
}
