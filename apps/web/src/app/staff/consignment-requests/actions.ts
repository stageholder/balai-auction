"use server";

import { revalidatePath } from "next/cache";
import type { ConsignmentRequestStatus } from "@auction/db";
import { prisma, setConsignmentRequestStatus } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

// Result shape so the client can surface a validation/repo failure inline
// rather than throwing an unhandled error at the staff reviewer.
export type TriageActionResult = { ok: true } | { ok: false; error: string };

const STATUSES: readonly ConsignmentRequestStatus[] = [
  "pending",
  "reviewing",
  "accepted",
  "declined",
];

// Triage decisions touch contact PII, so they are staff-only: requireStaff()
// runs FIRST, before the status is validated or persisted.
export async function setConsignmentRequestStatusAction(
  id: string,
  status: ConsignmentRequestStatus
): Promise<TriageActionResult> {
  await requireStaff();
  if (!STATUSES.includes(status)) {
    return { ok: false, error: "Invalid status" };
  }
  try {
    await setConsignmentRequestStatus(prisma, id, status);
  } catch (err) {
    console.error(
      `set consignment status failed for ${id} (${err instanceof Error ? err.name : "unknown"})`
    );
    return { ok: false, error: "Could not save decision. Please try again." };
  }
  revalidatePath("/staff/consignment-requests");
  return { ok: true };
}
