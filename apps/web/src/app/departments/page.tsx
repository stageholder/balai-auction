import Link from "next/link";
import { DEPARTMENTS } from "@auction/core";

export const metadata = {
  title: "Departments",
  description:
    "The specialist departments of the house — from paintings and Asian art to watches, jewellery, and wine.",
};

export default function DepartmentsPage() {
  return (
    <div>
      {/* Masthead */}
      <section className="max-w-3xl">
        <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          Specialist Departments
        </p>
        <h1 className="mt-4 font-serif text-6xl leading-[0.95] tracking-tight">
          Departments
        </h1>
        <p className="mt-5 max-w-xl font-sans text-sm leading-relaxed text-muted-foreground">
          Every sale is shaped by a specialist department. Browse the
          collecting categories of the house, each with its own catalogue,
          calendar, and the experts who bring it to the rostrum.
        </p>
      </section>

      {/* Directory */}
      <div className="mt-16 grid border-t border-line sm:grid-cols-2">
        {DEPARTMENTS.map((dept, index) => (
          <Link
            key={dept.slug}
            href={`/departments/${dept.slug}`}
            className="group relative block border-b border-line py-9 transition-colors duration-300 hover:border-ink sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(odd)]:pr-12 sm:[&:nth-child(even)]:pl-12"
          >
            {/* Left accent rail — fades in on hover */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 h-full w-px bg-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />

            <div className="pl-5">
              <p className="tnum font-sans text-[11px] tracking-[0.22em] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-3 font-serif text-3xl leading-none tracking-tight text-ink">
                {dept.label}
              </h2>
              <p className="mt-3 max-w-sm font-sans text-sm leading-relaxed text-muted-foreground">
                {dept.blurb}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
