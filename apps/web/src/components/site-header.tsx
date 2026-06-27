import Link from "next/link";
import { DEPARTMENTS } from "@auction/core";
import { SITE } from "@/lib/site";

const NAV_LINK =
  "text-xs uppercase tracking-[0.15em] text-muted transition-colors hover:text-ink";

export function SiteHeader({ accountSlot }: { accountSlot?: React.ReactNode }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-10 gap-y-4 px-6 py-6">
        <div className="flex items-baseline gap-8 md:gap-10">
          <Link href="/" className="font-serif text-2xl tracking-[0.2em]">
            {SITE.name}
          </Link>

          <nav
            aria-label="Primary"
            className="flex items-baseline gap-6 md:gap-8"
          >
            <Link href="/auctions" className={NAV_LINK}>
              Auctions
            </Link>

            <Link href="/auctions?lifecycle=past" className={NAV_LINK}>
              Results
            </Link>

            {/* Departments: native disclosure — server-rendered, no JS, no deps */}
            <details className="group relative">
              <summary
                className={`flex cursor-pointer list-none select-none items-baseline gap-1.5 outline-none focus-visible:text-ink [&::-webkit-details-marker]:hidden ${NAV_LINK}`}
              >
                Departments
                <span
                  aria-hidden="true"
                  className="text-[0.6em] leading-none transition-transform duration-200 group-open:rotate-180"
                >
                  ▼
                </span>
              </summary>

              <div className="absolute left-0 top-full z-30 mt-5 w-[min(88vw,30rem)] border border-line bg-paper p-7 shadow-lg">
                <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-muted">
                  Browse by department
                </p>
                <ul className="mt-5 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
                  {DEPARTMENTS.map((dept) => (
                    <li key={dept.slug}>
                      <Link
                        href={`/auctions?department=${dept.slug}`}
                        className="block font-serif text-xl leading-tight tracking-tight text-ink transition-colors hover:text-accent"
                      >
                        {dept.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </nav>
        </div>

        {accountSlot ?? (
          <span className="font-sans text-xs uppercase tracking-[0.15em] text-muted">
            {SITE.tagline}
          </span>
        )}
      </div>
    </header>
  );
}
