import Link from "next/link";
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

            <Link href="/departments" className={NAV_LINK}>
              Departments
            </Link>
          </nav>
        </div>

        <div className="flex items-baseline gap-6 md:gap-8">
          <form
            action="/search"
            method="get"
            role="search"
            className="flex items-baseline gap-2 border-b border-line transition-colors focus-within:border-ink"
          >
            <input
              type="search"
              name="q"
              aria-label="Search the catalogue"
              placeholder="Search artists, makers, lots"
              className="w-40 bg-transparent pb-1 font-sans text-xs tracking-[0.05em] text-ink placeholder:uppercase placeholder:tracking-[0.15em] placeholder:text-muted focus:outline-none md:w-56"
            />
            <button
              type="submit"
              aria-label="Search"
              className="pb-1 text-muted transition-colors hover:text-ink"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                className="h-3.5 w-3.5"
              >
                <circle cx="7" cy="7" r="5" />
                <path d="M11 11l4 4" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          {accountSlot ?? (
            <span className="font-sans text-xs uppercase tracking-[0.15em] text-muted">
              {SITE.tagline}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
