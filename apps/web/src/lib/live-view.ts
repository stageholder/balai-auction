export interface LiveViewLot {
  id: string;
  lotNumber: number;
  title: string;
}

/** Partition a live sale's lots into the upcoming queue and the recently-sold
 *  ticker, given the current active lot and the ids closed so far (in close
 *  order). Pure — drives the live page's surrounding chrome. */
export function liveViewModel(
  lots: LiveViewLot[],
  activeLotId: string | null,
  soldIds: string[]
): { upNext: LiveViewLot[]; justSold: LiveViewLot[] } {
  const sold = new Set(soldIds);
  const byId = new Map(lots.map((l) => [l.id, l]));

  const upNext = lots
    .filter((l) => l.id !== activeLotId && !sold.has(l.id))
    .sort((a, b) => a.lotNumber - b.lotNumber);

  const justSold = [...soldIds]
    .reverse()
    .map((id) => byId.get(id))
    .filter((l): l is LiveViewLot => l !== undefined);

  return { upNext, justSold };
}
