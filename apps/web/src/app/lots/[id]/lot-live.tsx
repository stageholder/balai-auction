"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { placeBid } from "./actions";

type BidGate =
  | { kind: "open"; floor: number }
  | { kind: "signin" }
  | { kind: "register"; saleId: string }
  | { kind: "closed" };

type YouStatus = "leading" | "outbid" | null;

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
  initialYouStatus = null,
  initialYourMax = null,
}: {
  lotId: string;
  initialPrice: number;
  initialClosesAt: string;
  gate: BidGate;
  /** Server-computed standing; optional (the live-sale stage omits it). */
  initialYouStatus?: YouStatus;
  initialYourMax?: number | null;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(initialPrice);
  const [closesAt, setClosesAt] = useState(initialClosesAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [youStatus, setYouStatus] = useState<YouStatus>(initialYouStatus);
  const [yourMax, setYourMax] = useState<number | null>(initialYourMax);
  const gateFloor = gate.kind === "open" ? gate.floor : null;
  const [floor, setFloor] = useState(gateFloor ?? 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The server is the source of truth. When a router.refresh() re-renders the
  // page (after our bid, or the debounced reconcile below), mirror the fresh
  // props back into state so status/floor/max never go stale.
  useEffect(() => setPrice(initialPrice), [initialPrice]);
  useEffect(() => setClosesAt(initialClosesAt), [initialClosesAt]);
  useEffect(() => setYouStatus(initialYouStatus), [initialYouStatus]);
  useEffect(() => setYourMax(initialYourMax), [initialYourMax]);
  useEffect(() => {
    if (gateFloor !== null) setFloor(gateFloor);
  }, [gateFloor]);

  // Subscribe to the public lot channel for live price updates. A price move we
  // didn't cause means someone else bid — snap the price for immediacy, then
  // debounce a refresh to re-derive our leading/outbid status + floor + history.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`lot:${lotId}`)
      .on("broadcast", { event: "price" }, ({ payload }) => {
        if (typeof payload?.currentPrice === "number") setPrice(payload.currentPrice);
        if (typeof payload?.closesAt === "string") setClosesAt(payload.closesAt);
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 900);
      })
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [lotId, router]);

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
        // The floor may have moved since page load — surface the new minimum.
        if (typeof result.floor === "number") setFloor(result.floor);
        return;
      }
      if (typeof result.currentPrice === "number") setPrice(result.currentPrice);
      if (result.closesAt) setClosesAt(result.closesAt);
      if (typeof result.floor === "number") setFloor(result.floor);
      if (typeof result.yourMax === "number") setYourMax(result.yourMax);
      if (inputRef.current) inputRef.current.value = "";
      const leading = result.leading === true;
      setYouStatus(leading ? "leading" : "outbid");
      if (leading) {
        toast.success(
          `You're the highest bidder at ${formatRupiah(result.currentPrice ?? price)}.`
        );
      } else {
        toast("Bid placed — but an existing maximum is higher. Raise yours to lead.");
      }
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

          {/* Your standing — always truthful (derived from the resolver, not
              from who bid last). Shows your confidential maximum too. */}
          {youStatus === "leading" ? (
            <p className="mt-2.5 inline-flex items-center gap-1.5 font-sans text-xs font-medium text-primary">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              You are the highest bidder
              {yourMax !== null ? (
                <span className="text-muted-foreground">
                  · your max {formatRupiah(yourMax)}
                </span>
              ) : null}
            </p>
          ) : youStatus === "outbid" ? (
            <p className="mt-2.5 font-sans text-xs text-muted-foreground">
              You&rsquo;ve been outbid
              {yourMax !== null ? ` (your max ${formatRupiah(yourMax)})` : ""} —
              raise your maximum to lead.
            </p>
          ) : null}
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
                <span className="text-ink">{formatRupiah(floor)}</span>
              </p>
              <input
                ref={inputRef}
                id="maxAmount"
                name="maxAmount"
                type="number"
                min={floor}
                step={1}
                required
                placeholder={String(floor)}
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

            {/* How proxy bidding works — set expectations so a "price didn't
                move" moment reads as intended, not broken. */}
            <p className="font-sans text-[11px] leading-relaxed text-muted-foreground">
              Enter the most you&rsquo;re willing to pay. We bid for you
              automatically, only as much as needed to keep you ahead — so the
              price often sits below your maximum, and raising a maximum
              you&rsquo;re already leading with won&rsquo;t change it.
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
