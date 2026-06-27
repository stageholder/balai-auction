export interface LifecycleSale {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
}

/** Partition published sales into the discovery buckets the public UI shows. */
export function partitionSalesByLifecycle<T extends LifecycleSale>(
  sales: T[]
): { liveNow: T[]; upcoming: T[]; past: T[] } {
  const liveNow = sales.filter((s) => s.status === "live");
  const upcoming = sales
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = sales
    .filter((s) => s.status === "closed")
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
  return { liveNow, upcoming, past };
}
