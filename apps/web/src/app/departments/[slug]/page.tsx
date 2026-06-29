import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, listPublishedSales } from "@/lib/db";
import { SaleCard } from "@/components/sale-card";
import { partitionSalesByLifecycle } from "@/lib/lifecycle";
import { getDepartment } from "@auction/core";

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
      {/* Editorial hero */}
      <section className="max-w-3xl">
        <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-muted">
          Department
        </p>
        <h1 className="mt-4 font-serif text-6xl leading-[0.95] tracking-tight">
          {department.label}
        </h1>
        <p className="mt-6 max-w-xl font-sans text-base leading-relaxed text-muted">
          {department.description}
        </p>
        <Link
          href={`/auctions?department=${slug}`}
          className="group mt-8 inline-flex items-baseline gap-2 font-sans text-xs uppercase tracking-[0.2em] text-ink"
        >
          <span className="border-b border-line pb-1 transition-colors group-hover:border-accent group-hover:text-accent">
            Browse all {department.label} lots
          </span>
          <span
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-1"
          >
            &rarr;
          </span>
        </Link>
      </section>

      {/* Sales by lifecycle */}
      {visibleSections.length === 0 ? (
        <p className="mt-20 border-t border-line pt-16 font-serif text-3xl italic text-muted">
          No sales in this department yet.
        </p>
      ) : (
        <div className="mt-20 space-y-20">
          {visibleSections.map((section) => (
            <section key={section.value}>
              <header
                className={`flex items-baseline justify-between gap-4 border-b pb-4 ${
                  section.live ? "border-accent" : "border-line"
                }`}
              >
                <div className="flex items-baseline gap-3">
                  {section.live ? (
                    <span
                      aria-hidden="true"
                      className="relative inline-flex h-2 w-2 self-center"
                    >
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                    </span>
                  ) : null}
                  <h2
                    className={`font-serif text-4xl leading-none tracking-tight ${
                      section.live ? "text-accent" : "text-ink"
                    }`}
                  >
                    {section.heading}
                  </h2>
                </div>
                <span className="tnum font-sans text-[11px] uppercase tracking-[0.2em] text-muted">
                  {section.sales.length}{" "}
                  {section.sales.length === 1 ? "sale" : "sales"}
                </span>
              </header>

              <p className="mt-4 max-w-xl font-sans text-sm leading-relaxed text-muted">
                {section.blurb}
              </p>

              <div className="mt-6 grid gap-x-12 sm:grid-cols-2">
                {section.sales.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
