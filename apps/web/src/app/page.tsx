import Link from "next/link";
import Image from "next/image";
import {
  prisma,
  listPublishedSales,
  listLotsForSale,
  getSaleCoverImages,
} from "@/lib/db";
import { SaleCard } from "@/components/sale-card";
import { FullBleed } from "@/components/full-bleed";
import { HomeHero, type HeroSlide } from "@/components/home-hero";
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
  const liveFew = liveNow.slice(0, 3);
  const upcomingFew = upcoming.slice(0, 6);
  const resultsFew = past.slice(0, 3);

  // Cover image per sale shown on this page — one query.
  const visibleIds = [...liveFew, ...upcomingFew, ...resultsFew].map((s) => s.id);
  const covers = await getSaleCoverImages(prisma, visibleIds);

  // Hero: feature the live sale if there is one, else the next upcoming, else
  // the most recent result. Pull a handful of its lots for the slideshow.
  const featured = liveNow[0] ?? upcoming[0] ?? past[0] ?? null;
  let heroSlides: HeroSlide[] = [];
  if (featured) {
    const lots = await listLotsForSale(prisma, featured.id);
    heroSlides = lots
      .map((lot): HeroSlide | null =>
        lot.images[0] ? { src: lot.images[0], alt: lot.title } : null
      )
      .filter((s): s is HeroSlide => s !== null)
      .slice(0, 5);
  }

  const heroEyebrow = featured
    ? `${SITE.name} · ${SITE.tagline}`
    : SITE.name;

  return (
    <div>
      {/* FULL-BLEED HERO — real lot imagery, auto-advancing, with CTAs */}
      {heroSlides.length > 0 ? (
        <FullBleed className="-mt-12 mb-20">
          <HomeHero
            slides={heroSlides}
            saleId={featured?.id ?? null}
            saleTitle={featured?.title ?? null}
            eyebrow={heroEyebrow}
          />
        </FullBleed>
      ) : (
        // No imagery yet — keep a quiet editorial masthead so the page is never
        // empty or broken.
        <section className="mb-20 border-b border-line pb-14">
          <p className="font-serif text-lg tracking-[0.2em] text-ink">
            {SITE.name}
          </p>
          <p className="mt-3 font-sans text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
            {SITE.tagline}
          </p>
          <h1 className="mt-6 max-w-3xl font-serif text-6xl leading-[0.98] tracking-tight text-ink md:text-7xl">
            Art and collections,
            <br />
            brought to the rostrum.
          </h1>
          <p className="mt-7 max-w-xl font-sans text-sm leading-relaxed text-muted-foreground">
            Live sales, the upcoming calendar, and results from the room — open
            to browse, no account required.
          </p>
        </section>
      )}

      {sales.length === 0 ? (
        <p className="mt-16 font-serif text-3xl italic leading-snug text-muted-foreground">
          No sales are published yet.
        </p>
      ) : (
        <div className="flex flex-col gap-24">
          {/* Live now — the hero moment, with a live pulse */}
          {liveFew.length > 0 ? (
            <SaleSection
              id="live-heading"
              title="Live now"
              accent
              count={liveNow.length}
              blurb="Bidding is open. Register and join before the gavel falls."
            >
              {liveFew.map((sale) => (
                <SaleCard key={sale.id} sale={sale} cover={covers[sale.id]} />
              ))}
            </SaleSection>
          ) : null}

          {/* Upcoming */}
          {upcomingFew.length > 0 ? (
            <SaleSection
              id="upcoming-heading"
              title="Upcoming"
              blurb="On the calendar. Browse the catalogue ahead of each sale."
              viewAllHref="/auctions?lifecycle=upcoming"
              viewAllLabel="View all upcoming"
            >
              {upcomingFew.map((sale) => (
                <SaleCard key={sale.id} sale={sale} cover={covers[sale.id]} />
              ))}
            </SaleSection>
          ) : null}

          {/* Recent results */}
          {resultsFew.length > 0 ? (
            <SaleSection
              id="results-heading"
              title="Recent results"
              blurb="Sales now closed. Revisit what came under the hammer."
              viewAllHref="/auctions?lifecycle=past"
              viewAllLabel="View all results"
            >
              {resultsFew.map((sale) => (
                <SaleCard key={sale.id} sale={sale} cover={covers[sale.id]} />
              ))}
            </SaleSection>
          ) : null}
        </div>
      )}

      {/* Browse by department — a full-bleed visual band of image tiles */}
      {departments.length > 0 ? (
        <FullBleed className="mt-24 bg-secondary/60">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2
              id="departments-heading"
              className="font-sans text-[10px] uppercase tracking-[0.28em] text-muted-foreground"
            >
              Browse by department
            </h2>
            <p className="mt-3 max-w-xl font-serif text-3xl leading-tight tracking-tight text-ink">
              Specialist sales across every collecting field.
            </p>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((dept) => {
                const cover = sales.find(
                  (s) => s.category === dept.slug && covers[s.id]
                );
                const img = cover ? covers[cover.id] : null;
                return (
                  <li key={dept.slug}>
                    <Link
                      href={`/auctions?department=${dept.slug}`}
                      className="group block"
                    >
                      <div className="relative aspect-[5/3] overflow-hidden bg-paper">
                        {img ? (
                          <Image
                            src={img}
                            alt={departmentLabel(dept.slug) ?? dept.label}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-paper">
                            <span className="font-serif text-2xl tracking-[0.16em] text-muted-foreground/60">
                              {SITE.name}
                            </span>
                          </div>
                        )}
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent"
                        />
                        <div className="absolute inset-x-0 bottom-0 p-5">
                          <h3 className="font-serif text-2xl leading-tight tracking-tight text-paper">
                            {departmentLabel(dept.slug) ?? dept.label}
                          </h3>
                          <span className="mt-1 inline-flex items-center gap-2 font-sans text-[11px] uppercase tracking-[0.18em] text-paper/80 transition-colors group-hover:text-paper">
                            Browse
                            <span
                              aria-hidden="true"
                              className="transition-transform duration-300 group-hover:translate-x-0.5"
                            >
                              →
                            </span>
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </FullBleed>
      ) : null}
    </div>
  );
}

function SaleSection({
  id,
  title,
  blurb,
  accent = false,
  count,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  accent?: boolean;
  count?: number;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <header
        className={`flex items-baseline justify-between gap-4 border-b pb-4 ${
          accent ? "border-primary" : "border-line"
        }`}
      >
        <div className="flex items-baseline gap-3">
          {accent ? (
            <span
              aria-hidden="true"
              className="relative inline-flex h-2 w-2 self-center"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          ) : null}
          <h2
            id={id}
            className={`font-serif text-4xl leading-none tracking-tight md:text-5xl ${
              accent ? "text-primary" : "text-ink"
            }`}
          >
            {title}
          </h2>
        </div>
        {viewAllHref && viewAllLabel ? (
          <ViewAllLink href={viewAllHref} label={viewAllLabel} />
        ) : count !== undefined ? (
          <span className="tnum font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {count} {count === 1 ? "sale" : "sales"}
          </span>
        ) : null}
      </header>
      <p className="mt-4 max-w-xl font-sans text-sm leading-relaxed text-muted-foreground">
        {blurb}
      </p>
      <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function ViewAllLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-baseline gap-2 font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-ink"
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
