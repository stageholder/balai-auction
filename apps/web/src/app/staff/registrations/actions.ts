"use server";

import { revalidatePath } from "next/cache";
import { prisma, setRegistrationKyc, getUser, getSale } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { notifyRegistrationDecision } from "@/lib/notifications";

// Best-effort decision email. Runs AFTER the kyc status is committed, so a
// lookup/send failure here must not surface as an error to the staff user.
async function emailDecision(
  userId: string,
  saleId: string,
  approved: boolean
): Promise<void> {
  try {
    const [user, sale] = await Promise.all([
      getUser(prisma, userId),
      getSale(prisma, saleId),
    ]);
    if (user && sale) {
      await notifyRegistrationDecision(user.email, sale.title, approved);
    }
  } catch (err) {
    console.error(`registration decision email failed for ${userId}:`, err);
  }
}

export async function approveRegistration(id: string): Promise<void> {
  await requireStaff();
  const reg = await setRegistrationKyc(prisma, id, "approved");
  await emailDecision(reg.userId, reg.saleId, true);
  revalidatePath("/staff/registrations");
}

export async function rejectRegistration(id: string): Promise<void> {
  await requireStaff();
  const reg = await setRegistrationKyc(prisma, id, "rejected");
  await emailDecision(reg.userId, reg.saleId, false);
  revalidatePath("/staff/registrations");
}
