export interface LiveLot {
  id: string;
  lotNumber: number;
  status: string;
  closesAt: Date;
}

export type LiveAdvanceAction =
  | { kind: "open"; lotId: string }
  | { kind: "close"; lotId: string }
  | { kind: "finish" }
  | { kind: "wait" };

/** Decide the next action for a live sale, purely from its current state.
 *  Only meaningful for a started, live-status sale; otherwise waits. */
export function advanceLiveSale(
  saleStatus: string,
  startsAt: Date,
  lots: LiveLot[],
  now: Date
): LiveAdvanceAction {
  if (saleStatus !== "live" || now.getTime() < startsAt.getTime()) {
    return { kind: "wait" };
  }

  const active = lots.find((l) => l.status === "live");
  if (active) {
    return now.getTime() >= active.closesAt.getTime()
      ? { kind: "close", lotId: active.id }
      : { kind: "wait" };
  }

  const queued = lots
    .filter((l) => l.status === "queued")
    .sort((a, b) => a.lotNumber - b.lotNumber);
  return queued.length > 0
    ? { kind: "open", lotId: queued[0]!.id }
    : { kind: "finish" };
}
