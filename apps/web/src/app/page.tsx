import Link from "next/link";
import { prisma, listPublishedSales } from "@/lib/db";
import { SaleCard } from "@/components/sale-card";
import { partitionSalesByLifecycle } from "@/lib/lifecycle";
import { activeDepartments } from "@/lib/departments-view";
import { departmentLabel } from "@auction/core";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const sales = await listPublishedSales(prisma);
  const { liveNow, upcoming, past } = partitionSalesByLifecycle(sales);
  const departments = activeDepartments(sales);

  // A curated few per section — the full set lives behind each "View all" link.
  const upcomingFew = upcoming.slice(0, 6);
  const resultsFew = past.slice(0, 4);

  return (
    <div>
      {/* Hero — a quiet editorial masthead that sets the tone */}
      <section className="border-b border-line pb-14">
        <p className="font-sans text-[11px] uppercase tracking-[0.32em] text-muted">
          {SITE.tagline}
        </p>
        <h1 className="mt-6 max-w-3xl font-serif text-6xl leading-[0.98] tracking-tight text-ink md:text-7xl">
          Art and collections,
          <br />
          brought to the rostrum.
        </h1>
        <p className="mt-7 max-w-xl font-sans text-sm leading-relaxed text-muted">
          Live sales, the upcoming calendar, and results from the room — open to
          browse, no account required.
        </p>
      </section>

      {sales.length === 0 ? (
        <p className="mt-16 font-serif text-3xl italic leading-snug text-muted">
          No sales are published yet.
        </p>
      ) : (
        <div className="mt-16 flex flex-col gap-24">
          {/* Live now — the hero moment, given the accent and a live pulse */}
          {liveNow.length > 0 ? (
            <section aria-labelledby="live-heading">
              <header className="flex items-baseline justify-between gap-4 border-b border-accent pb-4">
                <div className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="relative inline-flex h-2 w-2 self-center"
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                  <h2
                    id="live-heading"
                    className="font-serif text-4xl leading-none tracking-tight text-accent md:text-5xl"
                  >
                    Live now
                  </h2>
                </div>
                <span className="tnum font-sans text-[11px] uppercase tracking-[0.2em] text-muted">
                  {liveNow.length} {liveNow.length === 1 ? "sale" : "sales"}
                </span>
              </header>
              <p className="mt-4 max-w-xl font-sans text-sm leading-relaxed text-muted">
                Bidding is open. Register and join before the gavel falls.
              </p>
              <div className="mt-6 grid gap-x-12 sm:grid-cols-2">
                {liveNow.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Upcoming — framed as a calendar; a curated few + View all */}
          {upcoming.length > 0 ? (
            <section aria-labelledby="upcoming-heading">
              <header className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
                <h2
                  id="upcoming-heading"
                  className="font-serif text-4xl leading-none tracking-tight text-ink"
                >
                  Upcoming
                </h2>
                <ViewAllLink
                  href="/auctions?lifecycle=upcoming"
                  label="View all upcoming"
                />
              </header>
              <p className="mt-4 max-w-xl font-sans text-sm leading-relaxed text-muted">
                On the calendar. Browse the catalogue ahead of each sale.
              </p>
              <div className="mt-6 grid gap-x-12 sm:grid-cols-2">
                {upcomingFew.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Recent results — an archive teaser; the most recent few + View all */}
          {past.length > 0 ? (
            <section aria-labelledby="results-heading">
              <header className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
                <h2
                  id="results-heading"
                  className="font-serif text-4xl leading-none tracking-tight text-ink"
                >
                  Recent results
                </h2>
                <ViewAllLink
                  href="/auctions?lifecycle=past"
                  label="View all results"
                />
              </header>
              <p className="mt-4 max-w-xl font-sans text-sm leading-relaxed text-muted">
                Sales now closed. Revisit what came under the hammer.
              </p>
              <div className="mt-6 grid gap-x-12 sm:grid-cols-2">
                {resultsFew.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Browse by department — an elegant index of departments with sales */}
          {departments.length > 0 ? (
            <section aria-labelledby="departments-heading">
              <p
                id="departments-heading"
                className="font-sans text-[10px] uppercase tracking-[0.28em] text-muted"
              >
                Browse by department
              </p>
              <ul className="mt-8 grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
                {departments.map((dept) => (
                  <li key={dept.slug} className="border-b border-line">
                    <Link
                      href={`/auctions?department=${dept.slug}`}
                      className="group flex items-baseline justify-between gap-4 py-4"
                    >
                      <span className="font-serif text-2xl leading-tight tracking-tight text-ink transition-colors duration-300 group-hover:text-accent">
                        {departmentLabel(dept.slug)}
                      </span>
                      <span
                        aria-hidden="true"
                        className="font-sans text-sm text-muted transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-accent"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ViewAllLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-baseline gap-2 font-sans text-[11px] uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
    >
      {label}
      <span
        aria-hidden="true"
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
