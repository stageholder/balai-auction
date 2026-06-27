import Link from "next/link";
import { SITE } from "@/lib/site";

export function SiteHeader({ accountSlot }: { accountSlot?: React.ReactNode }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-baseline justify-between px-6 py-6">
        <Link href="/" className="font-serif text-2xl tracking-[0.2em]">
          {SITE.name}
        </Link>
        {accountSlot ?? (
          <span className="font-sans text-xs uppercase tracking-[0.15em] text-muted">
            {SITE.tagline}
          </span>
        )}
      </div>
    </header>
  );
}
