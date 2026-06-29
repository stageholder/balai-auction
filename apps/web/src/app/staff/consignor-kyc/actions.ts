"use server";

import { revalidatePath } from "next/cache";
import type { KycStatus, AmlStatus } from "@auction/db";
import { prisma, setConsignorKycStatus, setConsignorAml } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

// Result shape so the client can surface a validation/repo failure inline
// rather than throwing an unhandled error at the staff reviewer.
export type ReviewActionResult = { ok: true } | { ok: false; error: string };

const KYC_STATUSES: readonly KycStatus[] = ["approved", "rejected", "pending"];
const AML_STATUSES: readonly AmlStatus[] = ["pending", "cleared", "flagged"];

// Compliance decisions are staff-only. requireStaff() runs FIRST on every
// action; userId is the target consignor — staff legitimately act on any.
export async function setConsignorKycStatusAction(
  userId: string,
  status: KycStatus
): Promise<ReviewActionResult> {
  await requireStaff();
  if (!KYC_STATUSES.includes(status)) {
    return { ok: false, error: "Invalid KYC status" };
  }
  await setConsignorKycStatus(prisma, userId, status);
  revalidatePath("/staff/consignor-kyc");
  return { ok: true };
}

export async function setConsignorAmlStatusAction(
  userId: string,
  amlStatus: AmlStatus,
  note?: string
): Promise<ReviewActionResult> {
  await requireStaff();
  if (!AML_STATUSES.includes(amlStatus)) {
    return { ok: false, error: "Invalid AML status" };
  }
  const trimmed = note?.trim();
  await setConsignorAml(prisma, userId, {
    amlStatus,
    amlNote: trimmed ? trimmed : null,
  });
  revalidatePath("/staff/consignor-kyc");
  return { ok: true };
}
