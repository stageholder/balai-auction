"use server";

import { revalidatePath } from "next/cache";
import { prisma, setRegistrationKyc, getUser, getSale } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { notifyRegistrationDecision } from "@/lib/notifications";

export async function approveRegistration(id: string): Promise<void> {
  await requireStaff();
  const reg = await setRegistrationKyc(prisma, id, "approved");
  const [user, sale] = await Promise.all([
    getUser(prisma, reg.userId),
    getSale(prisma, reg.saleId),
  ]);
  if (user && sale) {
    await notifyRegistrationDecision(user.email, sale.title, true);
  }
  revalidatePath("/staff/registrations");
}

export async function rejectRegistration(id: string): Promise<void> {
  await requireStaff();
  const reg = await setRegistrationKyc(prisma, id, "rejected");
  const [user, sale] = await Promise.all([
    getUser(prisma, reg.userId),
    getSale(prisma, reg.saleId),
  ]);
  if (user && sale) {
    await notifyRegistrationDecision(user.email, sale.title, false);
  }
  revalidatePath("/staff/registrations");
}
