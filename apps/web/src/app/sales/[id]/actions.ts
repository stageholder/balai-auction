"use server";

import { revalidatePath } from "next/cache";
import {
  prisma,
  getRegistration,
  createRegistration,
  updateUserProfile,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function registerToBid(
  saleId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

  const legalName = String(formData.get("legalName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!legalName || !phone) {
    return { ok: false, error: "Legal name and phone are required." };
  }

  const existing = await getRegistration(prisma, user.id, saleId);
  if (existing) {
    return { ok: false, error: "You have already registered for this sale." };
  }

  await updateUserProfile(prisma, user.id, { legalName, phone });
  await createRegistration(prisma, { userId: user.id, saleId });

  revalidatePath(`/sales/${saleId}`);
  return { ok: true };
}
