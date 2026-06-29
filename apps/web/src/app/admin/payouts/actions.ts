"use server";

import { revalidatePath } from "next/cache";
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

  // Consignor bank details live on the user (set on /admin/users).
  const consignor = await getUser(prisma, payout.consignorId);
  const bankCode = consignor?.payoutBankCode?.trim();
  const accountNumber = consignor?.payoutAccountNumber?.trim();
  const accountHolder = consignor?.payoutAccountHolder?.trim();
  if (!bankCode || !accountNumber || !accountHolder) {
    return { ok: false, error: "Add payout bank details first." };
  }

  let disb: { id: string; status: string };
  try {
    disb = await createDisbursement({
      externalId: `payout-${payoutId}`,
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
