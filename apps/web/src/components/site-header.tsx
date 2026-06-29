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

        {accountSlot ?? (
          <span className="font-sans text-xs uppercase tracking-[0.15em] text-muted">
            {SITE.tagline}
          </span>
        )}
      </div>
    </header>
  );
}
