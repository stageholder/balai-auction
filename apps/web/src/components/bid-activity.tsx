import type { BidHistoryItem } from "@auction/db";
import { formatRupiah } from "@/lib/format";
import { BidPriceChart } from "@/components/bid-price-chart";

function timeLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Mask each distinct bidder as "Bidder 1, 2, …" in first-bid order. */
function maskLabels(bids: BidHistoryItem[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const b of bids) {
    if (!labels.has(b.bidderId)) labels.set(b.bidderId, `Bidder ${labels.size + 1}`);
  }
  return labels;
}

/**
 * Bid history for a lot: a price chart + the chronological list of bids.
 * `reveal` shows real bidder emails (operator console); otherwise bidders are
 * masked ("Bidder 1…") for the public catalogue.
 *
 * `winnerId` is the CURRENT leader from the proxy resolver (highest maximum) —
 * used to tag the right bidder as "Leading". This is deliberately NOT "the most
 * recent bid": in a proxy auction the newest bidder is often the underbidder.
 */
export function BidActivity({
  bids,
  startingPrice,
  reveal = false,
  winnerId = null,
}: {
  bids: BidHistoryItem[]; // oldest → newest
  startingPrice: number;
  reveal?: boolean;
  winnerId?: string | null;
}) {
  if (bids.length === 0) {
    return (
      <p className="font-sans text-sm text-muted-foreground">
        No bids yet — be the first to bid.
      </p>
    );
  }

  const labels = maskLabels(bids);
  const rows = [...bids].reverse(); // newest first in the list
  // The row to tag "Leading" is the winner's most-recent bid (rows are newest
  // first, so the first match). Falls back to none when there's no live winner.
  const leadingRowId =
    winnerId != null
      ? (rows.find((b) => b.bidderId === winnerId)?.id ?? null)
      : null;

  return (
    <div className="space-y-6">
      <BidPriceChart
        startingPrice={startingPrice}
        prices={bids.map((b) => b.amount)}
      />

      <div className="overflow-hidden rounded-sm border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-4 py-2.5 font-sans text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                When
              </th>
              <th className="px-4 py-2.5 font-sans text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Bidder
              </th>
              <th className="px-4 py-2.5 text-right font-sans text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Bid
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr
                key={b.id}
                className="border-b border-line last:border-0 odd:bg-muted/30"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                  {timeLabel(b.createdAt)}
                </td>
                <td className="px-4 py-2.5 text-ink">
                  {reveal ? b.bidderEmail : labels.get(b.bidderId)}
                  {b.id === leadingRowId ? (
                    <span className="ml-2 text-[0.65rem] uppercase tracking-[0.1em] text-primary">
                      Leading
                    </span>
                  ) : null}
                </td>
                <td className="tnum px-4 py-2.5 text-right font-medium text-ink">
                  {formatRupiah(b.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-sans text-xs leading-relaxed text-muted-foreground">
        Each amount is the leading bid at that moment. Every bidder&rsquo;s
        maximum is kept confidential — the price only rises as far as needed to
        stay ahead of the next-highest maximum.
      </p>
    </div>
  );
}
