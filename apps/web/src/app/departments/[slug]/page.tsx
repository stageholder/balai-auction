import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma, listPublishedSales, getSaleCoverImages } from "@/lib/db";
import { SaleCard } from "@/components/sale-card";
import { FullBleed } from "@/components/full-bleed";
import { partitionSalesByLifecycle } from "@/lib/lifecycle";
import { getDepartment } from "@auction/core";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const department = getDepartment(slug);
  if (!department) return { title: "Department" };
  return { title: department.label, description: department.description };
}

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const department = getDepartment(slug);
  if (!department) notFound();

  const sales = (await listPublishedSales(prisma)).filter(
    (sale) => sale.category === slug
  );
  const covers = await getSaleCoverImages(
    prisma,
    sales.map((s) => s.id)
  );

  // A representative image for the hero — the first sale with a cover.
  const heroSale = sales.find((s) => covers[s.id]);
  const heroImage = heroSale ? covers[heroSale.id] : null;

  const { liveNow, upcoming, past } = partitionSalesByLifecycle(sales);

  const sections: {
    value: "live" | "upcoming" | "past";
    heading: string;
    blurb: string;
    sales: typeof sales;
    live?: boolean;
  }[] = [
    {
      value: "live",
      heading: "Live now",
      blurb: "Bidding is open. Register and join before the gavel falls.",
      sales: liveNow,
      live: true,
    },
    {
      value: "upcoming",
      heading: "Upcoming",
      blurb: "On the calendar. Browse the catalogue ahead of each sale.",
      sales: upcoming,
    },
    {
      value: "past",
      heading: "Past results",
      blurb: "Sales now closed. Revisit what came under the hammer.",
      sales: past,
    },
  ];

  const visibleSections = sections.filter((section) => section.sales.length > 0);

  return (
    <div>
      {/* FULL-BLEED EDITORIAL HERO — representative imagery with a scrim */}
      <FullBleed className="mb-16">
        <div className="relative h-[60vh] min-h-[440px] w-full overflow-hidden bg-ink">
          {heroImage ? (
            <Image
              src={heroImage}
              alt={department.label}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-secondary">
              <span className="font-serif text-4xl tracking-[0.18em] text-muted-foreground/50">
                {SITE.name}
              </span>
            </div>
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/15"
          />
          <div className="absolute inset-0 flex items-end">
            <div className="mx-auto w-full max-w-6xl px-6 pb-14">
              <p className="font-sans text-[11px] uppercase tracking-[0.32em] text-paper/70">
                Specialist Department
              </p>
              <h1 className="mt-5 max-w-3xl font-serif text-5xl leading-[0.95] tracking-tight text-paper md:text-7xl">
                {department.label}
              </h1>
              <p className="mt-6 max-w-xl font-sans text-base leading-relaxed text-paper/80">
                {department.description}
              </p>
              <Link
                href={`/auctions?department=${slug}`}
                className="group mt-8 inline-flex items-baseline gap-2 font-sans text-xs uppercase tracking-[0.22em] text-paper"
              >
                <span className="border-b border-paper/40 pb-1 transition-colors group-hover:border-paper">
                  Browse all {department.label} lots
                </span>
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-1"
                >
                  &rarr;
                </span>
              </Link>
            </div>
          </div>
        </div>
      </FullBleed>

      {/* Sales by lifecycle — image-forward cards */}
      {visibleSections.length === 0 ? (
        <p className="mt-4 border-t border-line pt-16 font-serif text-3xl italic text-muted-foreground">
          No sales in this department yet.
        </p>
      ) : (
        <div className="space-y-24">
          {visibleSections.map((section) => (
            <section key={section.value}>
              <header
                className={`flex items-baseline justify-between gap-4 border-b pb-4 ${
                  section.live ? "border-primary" : "border-line"
                }`}
              >
                <div className="flex items-baseline gap-3">
                  {section.live ? (
                    <span
                      aria-hidden="true"
                      className="relative inline-flex h-2 w-2 self-center"
                    >
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                  ) : null}
                  <h2
                    className={`font-serif text-4xl leading-none tracking-tight md:text-5xl ${
                      section.live ? "text-primary" : "text-ink"
                    }`}
                  >
                    {section.heading}
                  </h2>
                </div>
                <span className="tnum font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {section.sales.length}{" "}
                  {section.sales.length === 1 ? "sale" : "sales"}
                </span>
              </header>

              <p className="mt-4 max-w-xl font-sans text-sm leading-relaxed text-muted-foreground">
                {section.blurb}
              </p>

              <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                {section.sales.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} cover={covers[sale.id]} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
