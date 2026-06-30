import Link from "next/link";
import type { SaleRecord } from "@auction/db";

export function SaleCard({ sale }: { sale: SaleRecord }) {
  const startDate = sale.startsAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const endDate = sale.endsAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Link href={`/sales/${sale.id}`} className="group block">
      <article className="relative overflow-hidden border-b border-line py-8 transition-colors duration-300 hover:border-ink">
        {/* Left accent rail — fades in on hover */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-full w-px bg-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />

        <div className="pl-5">
          {/* Status label */}
          <p className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {sale.status}
          </p>

          {/* Sale title — primary hierarchy */}
          <h2 className="font-serif mt-3 text-3xl leading-none tracking-tight text-ink">
            {sale.title}
          </h2>

          {/* Description */}
          {sale.description ? (
            <p className="mt-3 font-sans text-sm leading-relaxed text-muted-foreground line-clamp-2">
              {sale.description}
            </p>
          ) : null}

          {/* Date range */}
          <p className="tnum mt-5 font-sans text-[11px] text-muted-foreground">
            {startDate} — {endDate}
          </p>
        </div>
      </article>
    </Link>
  );
}
