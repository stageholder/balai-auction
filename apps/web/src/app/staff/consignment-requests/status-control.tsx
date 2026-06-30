"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ConsignmentRequestStatus } from "@auction/db";
import { cn } from "@/lib/utils";
import {
  setConsignmentRequestStatusAction,
  type TriageActionResult,
} from "./actions";

const BTN_BASE =
  "h-9 px-4 text-xs font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40";
// Accepting an item is the decisive, affirming move — filled ink.
const BTN_SOLID = cn(BTN_BASE, "border border-ink bg-ink text-paper hover:bg-paper hover:text-ink");
// Declining is the adverse move — outline drawn in accent to read as caution.
const BTN_ADVERSE = cn(BTN_BASE, "border border-primary text-primary hover:bg-primary hover:text-paper");
// Moving into review is the neutral, in-progress step — ink outline.
const BTN_NEUTRAL = cn(BTN_BASE, "border border-line text-ink hover:border-ink");
// The current state — shown active so staff see where things stand.
const BTN_ACTIVE = cn(BTN_BASE, "border border-ink bg-ink/5 text-ink");

/** Triage controls for one inquiry. The server action guards (requireStaff)
 *  + validates + persists every transition; this governs presentation. */
export function StatusControl({
  id,
  status,
}: {
  id: string;
  status: ConsignmentRequestStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(target: ConsignmentRequestStatus) {
    setError(null);
    startTransition(async () => {
      const result: TriageActionResult =
        await setConsignmentRequestStatusAction(id, target);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(`Marked ${target}`);
      router.refresh();
    });
  }

  function btn(
    target: ConsignmentRequestStatus,
    label: string,
    variant: string
  ) {
    const active = status === target;
    return (
      <button
        type="button"
        disabled={pending || active}
        aria-pressed={active}
        onClick={() => run(target)}
        className={active ? BTN_ACTIVE : variant}
      >
        {active ? `${label} ✓` : label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
        Triage decision
      </span>
      <div className="flex flex-wrap gap-2">
        {btn("reviewing", "Reviewing", BTN_NEUTRAL)}
        {btn("accepted", "Accept", BTN_SOLID)}
        {btn("declined", "Decline", BTN_ADVERSE)}
      </div>
      {error ? (
        <span className="text-xs uppercase tracking-[0.12em] text-primary">
          {error}
        </span>
      ) : null}
    </div>
  );
}
