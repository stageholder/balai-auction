import Image from "next/image";
import Link from "next/link";
import type { SaleRecord } from "@auction/db";
import { Badge } from "@/components/ui/badge";
import { SITE } from "@/lib/site";

const STATUS_LABEL: Record<string, string> = {
  live: "Live now",
  scheduled: "Upcoming",
  closed: "Results",
};

/** Solid, legible-over-image badge colours per lifecycle (no transparent
 *  outline). Live = crimson; Upcoming = ink; Results = soft ink. */
function statusBadgeClass(status: string): string {
  if (status === "live") return "bg-primary text-primary-foreground";
  if (status === "closed") return "bg-ink/75 text-paper";
  return "bg-ink text-paper"; // scheduled / upcoming
}

export function SaleCard({
  sale,
  cover,
}: {
  sale: SaleRecord;
  cover?: string | null;
}) {
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
  const label = STATUS_LABEL[sale.status] ?? sale.status;

  return (
    <Link href={`/sales/${sale.id}`} className="group block">
      <article className="flex flex-col">
        {/* Cover — image hero with a slow editorial zoom on hover */}
        <div className="relative aspect-[3/2] overflow-hidden bg-secondary">
          {cover ? (
            <Image
              src={cover}
              alt={sale.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]"
            />
          ) : (
            // Graceful fallback — a tasteful muted panel with the wordmark,
            // never a broken image.
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-secondary">
              <span className="font-serif text-3xl tracking-[0.18em] text-muted-foreground/70">
                {SITE.name}
              </span>
              <span className="font-sans text-[10px] uppercase tracking-[0.28em] text-muted-foreground/60">
                {sale.category ?? "Catalogue"}
              </span>
            </div>
          )}

          {/* Status badge floats over the image */}
          <div className="absolute left-3 top-3">
            <Badge className={`border-transparent shadow-sm ${statusBadgeClass(sale.status)}`}>
              {label}
            </Badge>
          </div>

          {/* A hairline that ignites crimson on hover */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100"
          />
        </div>

        {/* Catalogue entry */}
        <div className="pt-5">
          <h2 className="font-serif text-2xl leading-tight tracking-tight text-ink transition-colors duration-300 group-hover:text-primary">
            {sale.title}
          </h2>

          {sale.description ? (
            <p className="mt-2 font-sans text-sm leading-relaxed text-muted-foreground line-clamp-2">
              {sale.description}
            </p>
          ) : null}

          <p className="tnum mt-4 font-sans text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {startDate} — {endDate}
          </p>
        </div>
      </article>
    </Link>
  );
}
