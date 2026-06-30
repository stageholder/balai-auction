import { formatRupiah } from "@/lib/format";

/**
 * A small, dependency-free SVG step chart of a lot's price climbing across its
 * bids. x = bid sequence (start → each bid), y = price. The latest point is
 * marked in crimson. Renders nothing when there are no bids.
 */
export function BidPriceChart({
  startingPrice,
  prices,
}: {
  startingPrice: number;
  /** Revealed price after each bid, oldest → newest. */
  prices: number[];
}) {
  if (prices.length === 0) return null;

  const pts = [startingPrice, ...prices];
  const n = pts.length;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;

  const W = 640;
  const H = 200;
  const padX = 10;
  const padTop = 16;
  const padBottom = 16;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const x = (i: number) =>
    n === 1 ? padX + innerW / 2 : padX + (i / (n - 1)) * innerW;
  const y = (p: number) => padTop + innerH - ((p - min) / range) * innerH;

  // Step path: hold the previous price, then jump up at each new bid.
  let line = `M ${x(0)} ${y(pts[0])}`;
  for (let i = 1; i < n; i++) {
    line += ` L ${x(i)} ${y(pts[i - 1])} L ${x(i)} ${y(pts[i])}`;
  }
  const area = `${line} L ${x(n - 1)} ${padTop + innerH} L ${x(0)} ${
    padTop + innerH
  } Z`;

  return (
    <figure className="rounded-sm border border-line bg-card p-4">
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="font-sans text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
          Price history
        </span>
        <span className="tnum font-serif text-lg text-ink">
          {formatRupiah(pts[n - 1])}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={`Price climbed from ${formatRupiah(
          startingPrice
        )} to ${formatRupiah(pts[n - 1])} over ${prices.length} bids`}
      >
        {/* baseline */}
        <line
          x1={padX}
          y1={padTop + innerH}
          x2={W - padX}
          y2={padTop + innerH}
          className="stroke-line"
          strokeWidth={1}
        />
        <path d={area} className="fill-primary" fillOpacity={0.08} />
        <path
          d={line}
          className="fill-none stroke-ink"
          strokeWidth={1.75}
          strokeLinejoin="round"
        />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p)}
            r={i === n - 1 ? 4 : 2.5}
            className={i === n - 1 ? "fill-primary" : "fill-ink"}
          />
        ))}
      </svg>
      <div className="mt-2 flex items-baseline justify-between font-sans text-[0.7rem] text-muted-foreground">
        <span>Start {formatRupiah(startingPrice)}</span>
        <span>
          {prices.length} bid{prices.length === 1 ? "" : "s"}
        </span>
      </div>
    </figure>
  );
}
