"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { placeBid } from "./actions";

type BidGate =
  | { kind: "open"; floor: number }
  | { kind: "signin" }
  | { kind: "register"; saleId: string }
  | { kind: "closed" };

// ── countdown hook ────────────────────────────────────────────────────────────

interface CountdownState {
  label: string;
  /** true when under 5 minutes — callers can render urgency styling */
  urgent: boolean;
}

function useCountdown(target: number): CountdownState {
  const calc = (): CountdownState => {
    const remaining = target - Date.now();
    if (remaining <= 0) return { label: "Bidding ended", urgent: false };
    const s = Math.floor(remaining / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const urgent = remaining < 5 * 60 * 1000;
    if (d > 0) return { label: `${d}d ${h}h ${m}m`, urgent };
    if (h > 0) return { label: `${h}h ${m}m ${sec}s`, urgent };
    return { label: `${m}m ${sec}s`, urgent };
  };

  const [state, setState] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => setState(calc()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return state;
}

// ── live panel ────────────────────────────────────────────────────────────────

export function LotLive({
  lotId,
  initialPrice,
  initialClosesAt,
  gate,
}: {
  lotId: string;
  initialPrice: number;
  initialClosesAt: string;
  gate: BidGate;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(initialPrice);
  const [closesAt, setClosesAt] = useState(initialClosesAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Subscribe to the public lot channel for live price updates.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`lot:${lotId}`)
      .on("broadcast", { event: "price" }, ({ payload }) => {
        if (typeof payload?.currentPrice === "number") setPrice(payload.currentPrice);
        if (typeof payload?.closesAt === "string") setClosesAt(payload.closesAt);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [lotId]);

  const { label: countdown, urgent } = useCountdown(new Date(closesAt).getTime());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const raw = inputRef.current?.value ?? "";
    const maxAmount = Number(raw);
    setPending(true);
    try {
      const result = await placeBid(lotId, maxAmount);
      if (!result.ok) {
        setError(result.error ?? "Could not place bid.");
        return;
      }
      if (typeof result.currentPrice === "number") setPrice(result.currentPrice);
      if (result.closesAt) setClosesAt(result.closesAt);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative border border-line bg-paper">
      {/* Top rule — a narrow ink band signals the panel is active */}
      <div aria-hidden="true" className="h-[3px] w-full bg-ink" />

      <div className="px-6 pb-7 pt-5">

        {/* ── Live badge ── */}
        <div className="mb-5 flex items-center gap-2">
          <span
            aria-label="Live"
            className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse"
          />
          <span className="font-sans text-[9px] uppercase tracking-[0.32em] text-muted-foreground">
            Live bidding
          </span>
        </div>

        {/* ── Current bid ── */}
        <div className="mb-6">
          <p className="mb-1 font-sans text-[9px] uppercase tracking-[0.28em] text-muted-foreground">
            Current bid
          </p>
          <p className="tnum font-serif text-[2.2rem] leading-none tracking-tight text-ink">
            {formatRupiah(price)}
          </p>
        </div>

        {/* ── Hairline ── */}
        <div aria-hidden="true" className="mb-5 h-px bg-line" />

        {/* ── Countdown ── */}
        <div className="mb-7 flex items-baseline justify-between">
          <span className="font-sans text-[9px] uppercase tracking-[0.28em] text-muted-foreground">
            Hammer falls in
          </span>
          <span
            className={[
              "tnum font-sans text-sm tabular-nums transition-colors",
              urgent ? "text-primary font-semibold" : "text-ink",
            ].join(" ")}
          >
            {countdown}
          </span>
        </div>

        {/* ── Hairline ── */}
        <div aria-hidden="true" className="mb-6 h-px bg-line" />

        {/* ── Gate states ── */}
        {gate.kind === "open" ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="maxAmount"
                className="mb-2 block font-sans text-[9px] uppercase tracking-[0.28em] text-muted-foreground"
              >
                Your maximum bid
              </label>
              <p className="mb-2 tnum font-sans text-xs text-muted-foreground">
                Minimum&ensp;
                <span className="text-ink">{formatRupiah(gate.floor)}</span>
              </p>
              <input
                ref={inputRef}
                id="maxAmount"
                name="maxAmount"
                type="number"
                min={gate.floor}
                step={1}
                required
                placeholder={String(gate.floor)}
                className="tnum w-full border border-line bg-paper px-4 py-3 font-sans text-sm text-ink placeholder:text-muted-foreground focus:border-ink focus:outline-none"
              />
            </div>

            {error ? (
              <p className="font-sans text-xs text-primary" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="accent"
              disabled={pending}
              className="w-full"
            >
              {pending ? "Placing bid…" : "Place bid"}
            </Button>

            <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted-foreground opacity-60 text-center">
              Your maximum is kept confidential
            </p>
          </form>
        ) : gate.kind === "signin" ? (
          <div className="space-y-3 py-2">
            <p className="font-sans text-xs text-muted-foreground leading-relaxed">
              You must be signed in to place a bid.
            </p>
            <a
              href="/sign-in"
              className="block font-sans text-xs uppercase tracking-[0.18em] text-ink underline underline-offset-4 hover:text-muted-foreground transition-colors"
            >
              Sign in to bid &rarr;
            </a>
          </div>
        ) : gate.kind === "register" ? (
          <div className="space-y-3 py-2">
            <p className="font-sans text-xs text-muted-foreground leading-relaxed">
              Registration is required to bid in this sale.
            </p>
            <a
              href={`/sales/${gate.saleId}`}
              className="block font-sans text-xs uppercase tracking-[0.18em] text-ink underline underline-offset-4 hover:text-muted-foreground transition-colors"
            >
              Register for this sale &rarr;
            </a>
          </div>
        ) : (
          <div className="py-2">
            <p className="font-sans text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Bidding has ended.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
