import Link from "next/link";
import { SITE } from "@/lib/site";

const NAV_LINK =
  "text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-ink";

const NAV_ITEMS = [
  { href: "/auctions", label: "Auctions" },
  { href: "/auctions?lifecycle=past", label: "Results" },
  { href: "/departments", label: "Departments" },
  { href: "/sell", label: "Sell" },
] as const;

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      className="h-4 w-4"
    >
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l4 4" strokeLinecap="round" />
    </svg>
  );
}

export function SiteHeader({ accountSlot }: { accountSlot?: React.ReactNode }) {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
        {/* LEFT — disclosure (mobile) · wordmark · primary nav (desktop) */}
        <div className="flex items-center gap-6 md:gap-10">
          {/* Mobile: primary nav collapses behind a native disclosure */}
          <details className="group relative md:hidden">
            <summary
              className="flex cursor-pointer list-none items-center text-muted-foreground transition-colors hover:text-ink [&::-webkit-details-marker]:hidden"
              aria-label="Toggle navigation menu"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
              >
                <path
                  d="M2 4h12M2 8h12M2 12h12"
                  strokeLinecap="round"
                  className="transition-opacity group-open:opacity-0"
                />
              </svg>
            </summary>

            <nav
              aria-label="Primary"
              className="absolute left-0 top-full z-30 mt-4 flex w-48 flex-col gap-4 border border-line bg-paper px-5 py-5 shadow-lg"
            >
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className={NAV_LINK}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </details>

          <Link
            href="/"
            className="font-serif text-2xl leading-none tracking-[0.2em] text-ink"
          >
            {SITE.name}
          </Link>

          {/* Desktop: primary nav inline */}
          <nav
            aria-label="Primary"
            className="hidden items-center gap-6 md:flex md:gap-8"
          >
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={NAV_LINK}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* RIGHT — compact search · consolidated account menu */}
        <div className="flex items-center gap-4 md:gap-6">
          <form
            action="/search"
            method="get"
            role="search"
            className="flex items-center gap-2 border-b border-line py-1 transition-colors focus-within:border-ink"
          >
            <button
              type="submit"
              aria-label="Search"
              className="text-muted-foreground transition-colors hover:text-ink"
            >
              <SearchIcon />
            </button>
            <input
              type="search"
              name="q"
              aria-label="Search the catalogue"
              placeholder="Search"
              className="hidden w-24 bg-transparent font-sans text-xs tracking-[0.05em] text-ink transition-[width] duration-300 placeholder:uppercase placeholder:tracking-[0.15em] placeholder:text-muted-foreground focus:w-44 focus:outline-none sm:block"
            />
          </form>

          {accountSlot ?? (
            <span className="font-sans text-xs uppercase tracking-[0.15em] text-muted-foreground">
              {SITE.tagline}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
