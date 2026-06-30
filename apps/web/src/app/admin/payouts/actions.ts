"use server";

import { revalidatePath } from "next/cache";
import { consignorPayoutGate } from "@auction/core";
import { prisma, getPayout, getUser, releasePayout, rearmPayout } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { createDisbursement } from "@/lib/xendit";

/** Result of a payout action — a no-op or thrown Xendit error surfaces as an
 *  inline message instead of crashing the action (which money flows must not). */
export type PayoutActionResult = { ok: true } | { ok: false; error: string };

/** Release a pending payout: create the Xendit disbursement, then make the
 *  guarded pending→released transition. Staff-only.
 *
 *  Safety / idempotency: the disbursement uses a stable externalId
 *  (`payout-${id}` → Xendit X-IDEMPOTENCY-KEY), and `releasePayout` only flips a
 *  row that is still "pending". So a double-click cannot double-disburse:
 *  Xendit dedupes the second create, and the guard makes the second release a
 *  no-op. Do NOT add a pre-claim that bypasses this guard. */
export async function releasePayoutAction(
  payoutId: string
): Promise<PayoutActionResult> {
  await requireStaff();

  const payout = await getPayout(prisma, payoutId);
  if (!payout || payout.status !== "pending") {
    return { ok: false, error: "Payout is not pending — refresh to see its state." };
  }

  // The single compliance gate (same source as listPayouts' display): a payout
  // may only be released to a KYC-approved, AML-cleared consignor with bank
  // details on file. Enforced server-side BEFORE any disbursement is created —
  // no money moves to a non-compliant consignor regardless of the UI state.
  const consignor = await getUser(prisma, payout.consignorId);
  // Trim so a whitespace-only value is treated as missing (not sent to Xendit).
  const bankCode = consignor?.payoutBankCode?.trim() || null;
  const accountNumber = consignor?.payoutAccountNumber?.trim() || null;
  const accountHolder = consignor?.payoutAccountHolder?.trim() || null;
  const gate = consignorPayoutGate({
    kycStatus: consignor?.consignorKycStatus ?? "pending",
    amlStatus: consignor?.consignorAmlStatus ?? "pending",
    bankCode,
    accountNumber,
    accountHolder,
  });
  if (!gate.ok) return { ok: false, error: gate.reason };
  // gate.ok already guarantees these are present; an explicit guard narrows the
  // types for createDisbursement (no load-bearing non-null assertions).
  if (!bankCode || !accountNumber || !accountHolder) {
    return { ok: false, error: "Payout bank details missing" };
  }

  let disb: { id: string; status: string };
  try {
    disb = await createDisbursement({
      // Per-attempt id: stable within one release (double-click → Xendit
      // dedupes), fresh after a re-arm (releaseAttempt bumped) so a bounced
      // payout can actually be re-disbursed rather than hitting the cached one.
      externalId: `payout-${payoutId}-${payout.releaseAttempt}`,
      amount: payout.amount,
      bankCode,
      accountHolderName: accountHolder,
      accountNumber,
      description: `Consignor payout ${payoutId}`,
    });
  } catch (err) {
    // A thrown Xendit error must not crash the action — surface a generic
    // message (the raw error can carry account-number fragments) and log the
    // detail server-side. The stable externalId keeps a later retry idempotent.
    console.error(`disbursement failed for payout ${payoutId}:`, err);
    return {
      ok: false,
      error: "Disbursement failed — check the consignor's bank details and try again.",
    };
  }

  await releasePayout(prisma, payoutId, disb.id);
  revalidatePath("/admin/payouts");
  return { ok: true };
}

/** Re-arm a failed payout back to pending so it can be released again. Staff-only.
 *  The guarded failed→pending transition clears the prior disbursement id. */
export async function rearmPayoutAction(
  payoutId: string
): Promise<PayoutActionResult> {
  await requireStaff();
  try {
    await rearmPayout(prisma, payoutId);
  } catch (err) {
    console.error(`re-arm failed for payout ${payoutId}:`, err);
    return { ok: false, error: "Could not re-arm the payout — try again." };
  }
  revalidatePath("/admin/payouts");
  return { ok: true };
}
