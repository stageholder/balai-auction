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
 */
export function BidActivity({
  bids,
  startingPrice,
  reveal = false,
}: {
  bids: BidHistoryItem[]; // oldest → newest
  startingPrice: number;
  reveal?: boolean;
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
            {rows.map((b, i) => (
              <tr
                key={b.id}
                className="border-b border-line last:border-0 odd:bg-muted/30"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                  {timeLabel(b.createdAt)}
                </td>
                <td className="px-4 py-2.5 text-ink">
                  {reveal ? b.bidderEmail : labels.get(b.bidderId)}
                  {i === 0 ? (
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
    </div>
  );
}
