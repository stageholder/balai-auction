"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PayoutStatus } from "@auction/db";
import { cn } from "@/lib/utils";
import {
  releasePayoutAction,
  rearmPayoutAction,
  type PayoutActionResult,
} from "./actions";

const BTN_BASE =
  "h-8 px-4 text-xs font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40";
// Release is the live money action — the loud, filled primary.
const BTN_PRIMARY = cn(
  BTN_BASE,
  "border border-ink bg-ink text-paper hover:bg-paper hover:text-ink"
);
// Re-arm is a quieter recovery action — outline, not filled.
const BTN_OUTLINE = cn(BTN_BASE, "border border-line bg-paper text-ink hover:border-ink");

const QUIET = "text-xs uppercase tracking-[0.12em] text-muted-foreground";

/** Status-aware payout controls. Server actions guard every transition; this
 *  only governs presentation + loading/error feedback. */
export function PayoutActions({
  payoutId,
  status,
  releaseReady,
  releaseBlockedReason,
}: {
  payoutId: string;
  status: PayoutStatus;
  releaseReady: boolean;
  releaseBlockedReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<PayoutActionResult>, successMsg: string) {
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

  // released — the disbursement is in flight; the webhook advances it to paid.
  if (status === "released") {
    return <span className={QUIET}>Releasing…</span>;
  }

  // paid — terminal, nothing to do.
  if (status === "paid") {
    return <span className={QUIET}>Paid</span>;
  }

  // failed — re-arm back to pending so it can be released again.
  if (status === "failed") {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => rearmPayoutAction(payoutId), "Payout re-armed")}
          className={cn(BTN_OUTLINE, pending && "opacity-60")}
        >
          {pending ? "Re-arming…" : "Re-arm"}
        </button>
        {error ? (
          <span className="text-xs uppercase tracking-[0.12em] text-primary">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  // pending — Release only where the compliance gate is satisfied (KYC approved,
  // AML cleared, bank details on file). The server re-checks the same gate; this
  // just keeps the live-money button from being pressed when it would only fail.
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || !releaseReady}
        title={releaseReady ? undefined : releaseBlockedReason ?? undefined}
        onClick={() => run(() => releasePayoutAction(payoutId), "Payout released")}
        className={cn(BTN_PRIMARY, pending && "opacity-60")}
      >
        {pending ? "Releasing…" : "Release"}
      </button>
      {!releaseReady && releaseBlockedReason ? (
        <span className="max-w-[14rem] text-right text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground">
          {releaseBlockedReason}
        </span>
      ) : null}
      {error ? (
        <span className="text-xs uppercase tracking-[0.12em] text-primary">
          {error}
        </span>
      ) : null}
    </div>
  );
}
