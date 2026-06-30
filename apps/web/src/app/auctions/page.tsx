import Link from "next/link";
import { prisma, listPublishedSales } from "@/lib/db";
import { SaleCard } from "@/components/sale-card";
import { partitionSalesByLifecycle } from "@/lib/lifecycle";
import { DEPARTMENTS, departmentLabel, isDepartmentSlug } from "@auction/core";

export const dynamic = "force-dynamic";

type Lifecycle = "live" | "upcoming" | "past";

const LIFECYCLE_TABS: { value: Lifecycle | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "live", label: "Live now" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past results" },
];

/** Build an /auctions href, preserving the complementary filter so the
 *  department rail and lifecycle tabs compose instead of resetting each other. */
function buildHref(params: {
  department: string | null;
  lifecycle: Lifecycle | null;
}): string {
  const query = new URLSearchParams();
  if (params.lifecycle) query.set("lifecycle", params.lifecycle);
  if (params.department) query.set("department", params.department);
  const qs = query.toString();
  return qs ? `/auctions?${qs}` : "/auctions";
}

export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<{ lifecycle?: string; department?: string }>;
}) {
  const { lifecycle, department } = await searchParams;

  const activeDepartment =
    department && isDepartmentSlug(department) ? department : null;
  const activeLifecycle: Lifecycle | null =
    lifecycle === "live" || lifecycle === "upcoming" || lifecycle === "past"
      ? lifecycle
      : null;

  let sales = await listPublishedSales(prisma);
  if (activeDepartment) {
    sales = sales.filter((sale) => sale.category === activeDepartment);
  }

  const { liveNow, upcoming, past } = partitionSalesByLifecycle(sales);

  const sections: {
    value: Lifecycle;
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

  const visibleSections = activeLifecycle
    ? sections.filter((section) => section.value === activeLifecycle)
    : sections;

  const activeLabel = activeDepartment
    ? departmentLabel(activeDepartment)
    : null;

  return (
    <div>
      {/* Masthead */}
      <section className="max-w-3xl">
        <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          The Auction Calendar
        </p>
        <h1 className="mt-4 font-serif text-6xl leading-[0.95] tracking-tight">
          {activeLabel ?? "Auctions"}
        </h1>
        <p className="mt-5 max-w-xl font-sans text-sm leading-relaxed text-muted-foreground">
          {activeLabel
            ? `Sales in ${activeLabel}, by where they sit in the season.`
            : "A season of sales, grouped by where they stand — live on the rostrum, scheduled ahead, and the results behind us."}
        </p>
      </section>

      {/* Department rail */}
      <nav
        aria-label="Filter by department"
        className="mt-12 border-t border-line pt-6"
      >
        <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Departments
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <DepartmentChip
            href={buildHref({ department: null, lifecycle: activeLifecycle })}
            label="All"
            active={activeDepartment === null}
          />
          {DEPARTMENTS.map((dept) => (
            <DepartmentChip
              key={dept.slug}
              href={buildHref({
                department: dept.slug,
                lifecycle: activeLifecycle,
              })}
              label={dept.label}
              active={activeDepartment === dept.slug}
            />
          ))}
        </div>
      </nav>

      {/* Lifecycle tabs */}
      <nav
        aria-label="Filter by stage"
        className="mt-8 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b border-line pb-1"
      >
        {LIFECYCLE_TABS.map((tab) => {
          const active = activeLifecycle === tab.value;
          return (
            <Link
              key={tab.label}
              href={buildHref({
                department: activeDepartment,
                lifecycle: tab.value,
              })}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 pb-3 font-sans text-xs uppercase tracking-[0.2em] transition-colors ${
                active
                  ? "border-primary text-ink"
                  : "border-transparent text-muted-foreground hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Sections */}
      <div className="mt-16 space-y-20">
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
                  className={`font-serif text-4xl leading-none tracking-tight ${
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

            {section.sales.length === 0 ? (
              <p className="mt-10 font-serif text-2xl italic text-muted-foreground">
                Nothing here yet.
              </p>
            ) : (
              <div className="mt-6 grid gap-x-12 sm:grid-cols-2">
                {section.sales.map((sale) => (
                  <SaleCard key={sale.id} sale={sale} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function DepartmentChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full border px-4 py-2 font-sans text-[11px] uppercase tracking-[0.16em] transition-colors ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-line text-muted-foreground hover:border-ink hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
