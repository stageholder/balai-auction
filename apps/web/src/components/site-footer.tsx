import Link from "next/link";
import { SITE } from "@/lib/site";

const COL_HEADING =
  "font-sans text-[0.625rem] uppercase tracking-[0.2em] text-muted";
const COL_LINK =
  "font-sans text-sm tracking-[0.02em] text-ink/80 transition-colors hover:text-accent";

type FooterColumn = {
  heading: string;
  links: { href: string; label: string }[];
};

const COLUMNS: FooterColumn[] = [
  {
    heading: "Browse",
    links: [
      { href: "/auctions", label: "Auctions" },
      { href: "/auctions?lifecycle=past", label: "Results" },
      { href: "/departments", label: "Departments" },
    ],
  },
  {
    heading: "Sell",
    links: [{ href: "/sell", label: "Sell with us" }],
  },
  {
    heading: "Account",
    links: [
      { href: "/sign-in", label: "Sign in" },
      { href: "/account/saved", label: "Saved" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-1 gap-y-12 gap-x-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link
              href="/"
              className="font-serif text-2xl tracking-[0.2em] text-ink"
            >
              {SITE.name}
            </Link>
            <p className="mt-3 max-w-xs font-serif text-base italic text-muted">
              {SITE.tagline}
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className={COL_HEADING}>{column.heading}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={COL_LINK}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-line pt-6 text-xs tracking-[0.04em] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.name} — {SITE.tagline}
          </p>
          <p className="uppercase tracking-[0.15em]">
            Bidding in Indonesian Rupiah (IDR)
          </p>
        </div>
      </div>
    </footer>
  );
}
