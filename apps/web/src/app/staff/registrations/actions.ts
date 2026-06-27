"use server";

import { revalidatePath } from "next/cache";
import { prisma, setRegistrationKyc } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function approveRegistration(id: string): Promise<void> {
  await requireStaff();
  await setRegistrationKyc(prisma, id, "approved");
  revalidatePath("/staff/registrations");
}

export async function rejectRegistration(id: string): Promise<void> {
  await requireStaff();
  await setRegistrationKyc(prisma, id, "rejected");
  revalidatePath("/staff/registrations");
}
