"use server";

import { revalidatePath } from "next/cache";
import type { UserRole } from "@auction/db";
import { prisma, setUserRole as updateUserRole } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

const ALLOWED_ROLES: readonly UserRole[] = ["buyer", "consignor", "staff"];

export async function setUserRole(
  userId: string,
  role: UserRole
): Promise<void> {
  const staff = await requireStaff();
  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${String(role)}`);
  }
  // A staff member cannot change their own role (avoid self-lockout).
  if (staff.id === userId) return;
  await updateUserRole(prisma, userId, role);
  revalidatePath("/admin/users");
}
