"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toggleWatchlistAction } from "./watchlist-actions";

/** A quiet save affordance in the auction-house register: an etched bookmark
 *  that fills with ink once a lot is kept. Not a loud social button — a small
 *  ledger mark beside the lot.
 *
 *  The button reflects the server's authoritative `{ watched }` result. The
 *  server action derives the user from the session alone (no client input),
 *  so this component only governs presentation + optimistic feedback. */
export function SaveButton({
  lotId,
  initialWatched,
}: {
  lotId: string;
  initialWatched: boolean;
}) {
  const [watched, setWatched] = useState(initialWatched);
  const [pending, startTransition] = useTransition();

  function toggle() {
    // Optimistic flip; reconcile to the server's authoritative result, and
    // fall back to the prior state if the action fails (kept non-crashing).
    const previous = watched;
    setWatched(!previous);
    startTransition(async () => {
      try {
        const { watched: next } = await toggleWatchlistAction(lotId);
        setWatched(next);
      } catch {
        setWatched(previous);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={watched}
      className={cn(
        "group inline-flex items-center gap-2 border px-3 py-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
        "disabled:cursor-not-allowed",
        watched
          ? "border-ink bg-paper text-ink"
          : "border-line bg-paper text-muted hover:border-ink hover:text-ink",
        pending && "opacity-60"
      )}
    >
      {/* Bookmark — outline when unsaved, ink-filled once kept. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 12 16"
        strokeWidth={1.25}
        className={cn(
          "h-3.5 w-3 transition-colors",
          watched ? "fill-ink stroke-ink" : "fill-none stroke-current"
        )}
      >
        <path
          d="M1.5 1.5h9v13l-4.5-3.2L1.5 14.5z"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-sans text-[10px] font-medium uppercase tracking-[0.22em]">
        {watched ? "Saved" : "Save"}
      </span>
    </button>
  );
}
