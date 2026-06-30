"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { KycStatus, AmlStatus } from "@auction/db";
import { cn } from "@/lib/utils";
import {
  setConsignorKycStatusAction,
  setConsignorAmlStatusAction,
  type ReviewActionResult,
} from "./actions";

const BTN_BASE =
  "h-9 px-4 text-xs font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40";
// The affirming decision (Approve / Clear) — filled ink, the decisive move.
const BTN_SOLID = cn(BTN_BASE, "border border-ink bg-ink text-paper hover:bg-paper hover:text-ink");
// The adverse decision (Reject / Flag) — outline drawn in accent to read as caution.
const BTN_ADVERSE = cn(BTN_BASE, "border border-primary text-primary hover:bg-primary hover:text-paper");
// The current state — shown disabled/active so staff see where things stand.
const BTN_ACTIVE = cn(BTN_BASE, "border border-ink bg-ink/5 text-ink");

const LABEL = "text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground";

/** Decision controls for one consignor. Server actions guard + persist every
 *  transition; this governs presentation, the optional AML note, and feedback. */
export function ReviewControls({
  userId,
  kycStatus,
  amlStatus,
  amlNote,
}: {
  userId: string;
  kycStatus: KycStatus;
  amlStatus: AmlStatus;
  amlNote: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(amlNote ?? "");

  function run(action: () => Promise<ReviewActionResult>, successMsg: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(successMsg);
      router.refresh();
    });
  }

  function kycBtn(target: KycStatus, label: string, adverse: boolean) {
    const active = kycStatus === target;
    return (
      <button
        type="button"
        disabled={pending || active}
        aria-pressed={active}
        onClick={() =>
          run(
            () => setConsignorKycStatusAction(userId, target),
            `KYC ${target}`
          )
        }
        className={active ? BTN_ACTIVE : adverse ? BTN_ADVERSE : BTN_SOLID}
      >
        {active ? `${label} ✓` : label}
      </button>
    );
  }

  function amlBtn(target: AmlStatus, label: string, adverse: boolean) {
    const active = amlStatus === target;
    return (
      <button
        type="button"
        disabled={pending || active}
        aria-pressed={active}
        onClick={() =>
          run(
            () => setConsignorAmlStatusAction(userId, target, note),
            `AML ${target}`
          )
        }
        className={active ? BTN_ACTIVE : adverse ? BTN_ADVERSE : BTN_SOLID}
      >
        {active ? `${label} ✓` : label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className={LABEL}>KYC decision</span>
        <div className="flex flex-wrap gap-2">
          {kycBtn("approved", "Approve", false)}
          {kycBtn("rejected", "Reject", true)}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={LABEL}>AML decision</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Optional note (recorded against the AML decision)"
          className="w-full resize-none border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted-foreground focus:border-ink focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {amlBtn("cleared", "Clear", false)}
          {amlBtn("flagged", "Flag", true)}
        </div>
      </div>

      {error ? (
        <span className="text-xs uppercase tracking-[0.12em] text-primary">
          {error}
        </span>
      ) : null}
    </div>
  );
}
