import Link from "next/link";
import Image from "next/image";
import { prisma, listPublishedSales, getSaleCoverImages } from "@/lib/db";
import { FullBleed } from "@/components/full-bleed";
import { DEPARTMENTS } from "@auction/core";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Departments",
  description:
    "The specialist departments of the house — from paintings and Asian art to watches, jewellery, and wine.",
};

export default async function DepartmentsPage() {
  const sales = await listPublishedSales(prisma);
  const covers = await getSaleCoverImages(
    prisma,
    sales.map((s) => s.id)
  );

  // A representative image per department: the first sale in that department
  // that actually has a cover. Falls back to a wordmark tile when none.
  function departmentImage(slug: string): string | null {
    const sale = sales.find((s) => s.category === slug && covers[s.id]);
    return sale ? covers[sale.id] : null;
  }

  return (
    <div>
      {/* Editorial masthead */}
      <section className="max-w-3xl">
        <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          Specialist Departments
        </p>
        <h1 className="mt-4 font-serif text-6xl leading-[0.95] tracking-tight md:text-7xl">
          Departments
        </h1>
        <p className="mt-5 max-w-xl font-sans text-sm leading-relaxed text-muted-foreground">
          Every sale is shaped by a specialist department. Browse the
          collecting categories of the house, each with its own catalogue,
          calendar, and the experts who bring it to the rostrum.
        </p>
      </section>

      {/* Visual directory — full-bleed band of image tiles */}
      <FullBleed className="mt-16 bg-secondary/50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {DEPARTMENTS.map((dept, index) => {
              const img = departmentImage(dept.slug);
              return (
                <li key={dept.slug}>
                  <Link
                    href={`/departments/${dept.slug}`}
                    className="group block"
                  >
                    <article className="relative aspect-[4/5] overflow-hidden bg-ink">
                      {img ? (
                        <Image
                          src={img}
                          alt={dept.label}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover opacity-90 transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05] group-hover:opacity-100"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-secondary">
                          <span className="font-serif text-3xl tracking-[0.16em] text-muted-foreground/60">
                            {SITE.name}
                          </span>
                        </div>
                      )}

                      {/* Scrim for legible type over imagery */}
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent"
                      />

                      {/* A crimson hairline that ignites on hover */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100"
                      />

                      <div className="absolute inset-x-0 bottom-0 p-6">
                        <p className="tnum font-sans text-[11px] tracking-[0.28em] text-paper/60">
                          {String(index + 1).padStart(2, "0")}
                        </p>
                        <h2 className="mt-2 font-serif text-3xl leading-none tracking-tight text-paper">
                          {dept.label}
                        </h2>
                        <p className="mt-3 max-w-xs font-sans text-sm leading-relaxed text-paper/75">
                          {dept.blurb}
                        </p>
                        <span className="mt-4 inline-flex items-center gap-2 font-sans text-[11px] uppercase tracking-[0.2em] text-paper/80 transition-colors group-hover:text-paper">
                          Enter department
                          <span
                            aria-hidden="true"
                            className="transition-transform duration-300 group-hover:translate-x-0.5"
                          >
                            &rarr;
                          </span>
                        </span>
                      </div>
                    </article>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </FullBleed>
    </div>
  );
}
