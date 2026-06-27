"use server";

import { revalidatePath } from "next/cache";
import type { UserRole } from "@auction/db";
import { prisma, setUserRole } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function setRoleAction(
  userId: string,
  role: UserRole
): Promise<void> {
  const staff = await requireStaff();
  // A staff member cannot change their own role (avoid self-lockout).
  if (staff.id === userId) return;
  await setUserRole(prisma, userId, role);
  revalidatePath("/admin/users");
}
