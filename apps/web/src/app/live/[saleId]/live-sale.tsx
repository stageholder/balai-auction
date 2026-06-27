"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { liveViewModel } from "@/lib/live-view";
import { formatRupiah } from "@/lib/format";
import { LotLive } from "@/app/lots/[id]/lot-live";

export type LiveGate = "signin" | "register" | "open" | "closed";

export interface LiveSaleLot {
  id: string;
  lotNumber: number;
  title: string;
  startingPrice: number;
}

export interface LiveActive {
  id: string;
  closesAt: string;
  currentPrice: number;
  floor: number;
}

export function LiveSale({
  saleId,
  lots,
  initialActive,
  gate,
}: {
  saleId: string;
  lots: LiveSaleLot[];
  initialActive: LiveActive | null;
  gate: LiveGate;
}) {
  const [active, setActive] = useState<LiveActive | null>(initialActive);
  const [soldIds, setSoldIds] = useState<string[]>([]);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`sale:${saleId}`)
      .on("broadcast", { event: "lot-opened" }, ({ payload }) => {
        const lot = lots.find((l) => l.id === payload?.lotId);
        if (lot && typeof payload?.closesAt === "string") {
          setActive({
            id: lot.id,
            closesAt: payload.closesAt,
            currentPrice: lot.startingPrice,
            floor: lot.startingPrice,
          });
        }
      })
      .on("broadcast", { event: "lot-closed" }, ({ payload }) => {
        if (typeof payload?.lotId === "string") {
          setSoldIds((ids) =>
            ids.includes(payload.lotId) ? ids : [...ids, payload.lotId]
          );
          setActive((a) => (a && a.id === payload.lotId ? null : a));
        }
      })
      .on("broadcast", { event: "sale-ended" }, () => {
        setActive(null);
        setEnded(true);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [saleId, lots]);

  const { upNext, justSold } = liveViewModel(
    lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, title: l.title })),
    active?.id ?? null,
    soldIds
  );

  // Map the per-sale gate to LotLive's per-lot BidGate.
  const lotGate =
    gate === "open" && active
      ? ({ kind: "open", floor: active.floor } as const)
      : gate === "signin"
        ? ({ kind: "signin" } as const)
        : gate === "register"
          ? ({ kind: "register", saleId } as const)
          : ({ kind: "closed" } as const);

  // Active lot metadata (for the heading above LotLive).
  const activeLot = active ? lots.find((l) => l.id === active.id) : null;

  return (
    <div>
      {/* ── LIVE indicator bar ─────────────────────────────────────────── */}
      <div className="mb-8 flex items-center gap-3">
        <span
          aria-label="Live"
          className="inline-block h-2.5 w-2.5 rounded-full bg-accent animate-pulse"
        />
        <span className="font-sans text-[10px] uppercase tracking-[0.35em] text-accent">
          Live now
        </span>
        <div aria-hidden="true" className="flex-1 border-t border-line" />
        <span className="font-sans text-[9px] uppercase tracking-[0.25em] text-muted">
          {lots.length} lot{lots.length !== 1 ? "s" : ""} · {soldIds.length} sold
        </span>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────── */}
      <div className="grid gap-10 lg:grid-cols-[1fr_260px]">

        {/* ── Current lot (main stage) ───────────────────────────────── */}
        <section aria-label="Current lot">
          {/* Thick top rule signals the primary stage */}
          <div aria-hidden="true" className="mb-6 h-[3px] w-full bg-ink" />

          {active ? (
            <>
              {/* Lot index + title above the live panel */}
              {activeLot && (
                <div className="mb-6 flex items-baseline gap-4">
                  <span className="tnum font-serif text-5xl leading-none text-muted">
                    {String(activeLot.lotNumber).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[9px] uppercase tracking-[0.25em] text-muted">
                      On the block
                    </p>
                    <h2 className="mt-1 font-serif text-xl leading-snug text-ink">
                      {activeLot.title}
                    </h2>
                    <p className="mt-1 tnum font-sans text-xs text-muted">
                      Opening {formatRupiah(activeLot.startingPrice)}
                    </p>
                  </div>
                </div>
              )}

              {/* LotLive: keyed by id so it fully remounts on lot change */}
              <LotLive
                key={active.id}
                lotId={active.id}
                initialPrice={active.currentPrice}
                initialClosesAt={active.closesAt}
                gate={lotGate}
              />
            </>
          ) : ended ? (
            <div className="py-20 text-center">
              <p className="font-serif text-2xl italic text-muted">
                The sale has concluded.
              </p>
              <p className="mt-3 font-sans text-xs uppercase tracking-[0.2em] text-muted opacity-60">
                Thank you for participating
              </p>
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="font-serif text-2xl italic text-muted">
                Awaiting the next lot…
              </p>
              <p className="mt-3 font-sans text-xs uppercase tracking-[0.2em] text-muted opacity-60">
                Stand by
              </p>
            </div>
          )}
        </section>

        {/* ── Sidebar: Up Next + Just Sold ──────────────────────────── */}
        <aside aria-label="Sale progress" className="space-y-10">

          {/* Up Next rail */}
          <div>
            <h2 className="mb-4 font-sans text-[9px] uppercase tracking-[0.28em] text-muted">
              Up next
            </h2>
            {upNext.length === 0 ? (
              <p className="font-sans text-xs italic text-muted">—</p>
            ) : (
              <ul className="space-y-3">
                {upNext.map((l, i) => (
                  <li
                    key={l.id}
                    className="flex items-start gap-3 border-l-2 border-line pl-3"
                    style={{ opacity: Math.max(0.35, 1 - i * 0.18) }}
                  >
                    <span className="tnum mt-0.5 font-sans text-xs text-muted">
                      {String(l.lotNumber).padStart(2, "0")}
                    </span>
                    <span className="font-sans text-sm leading-snug text-ink">
                      {l.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Hairline divider */}
          <div aria-hidden="true" className="border-t border-line" />

          {/* Just Sold ticker */}
          <div>
            <h2 className="mb-4 font-sans text-[9px] uppercase tracking-[0.28em] text-muted">
              Just sold
            </h2>
            {justSold.length === 0 ? (
              <p className="font-sans text-xs italic text-muted">—</p>
            ) : (
              <ul className="space-y-3">
                {justSold.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-start gap-3 border-l-2 border-line pl-3 opacity-40"
                  >
                    <span className="tnum mt-0.5 font-sans text-xs text-muted line-through">
                      {String(l.lotNumber).padStart(2, "0")}
                    </span>
                    <span className="font-sans text-sm leading-snug text-muted line-through">
                      {l.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
