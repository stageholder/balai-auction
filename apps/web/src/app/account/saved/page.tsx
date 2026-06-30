import Link from "next/link";
import { prisma, listWatchlist } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LotResultCard } from "@/components/lot-result-card";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const user = await requireUser();
  const items = await listWatchlist(prisma, user.id);

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-10 flex items-baseline justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Account
          </p>
          <h1 className="font-serif text-4xl font-light text-ink">
            Saved lots
          </h1>
        </div>
        {items.length > 0 ? (
          <span className="tnum font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {items.length} {items.length === 1 ? "lot" : "lots"}
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-serif text-2xl italic text-muted-foreground">
            You haven&rsquo;t saved any lots yet.
          </p>
          <Link
            href="/auctions"
            className="mt-6 inline-block text-xs uppercase tracking-[0.2em] text-primary transition-colors hover:text-ink"
          >
            Browse the auctions
          </Link>
        </div>
      ) : (
        <div>
          {items.map((lot) => (
            <LotResultCard key={lot.id} lot={lot} />
          ))}
        </div>
      )}
    </div>
  );
}
