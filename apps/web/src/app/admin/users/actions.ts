"use server";

import { revalidatePath } from "next/cache";
import type { UserRole } from "@auction/db";
import {
  prisma,
  setUserRole as updateUserRole,
  setConsignorPayoutAccount,
} from "@/lib/db";
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

export async function setConsignorPayoutAccountAction(
  userId: string,
  fields: { bankCode: string; accountNumber: string; accountHolder: string }
): Promise<void> {
  await requireStaff();
  const bankCode = fields.bankCode.trim();
  const accountNumber = fields.accountNumber.trim();
  const accountHolder = fields.accountHolder.trim();
  if (!bankCode || !accountNumber || !accountHolder) {
    throw new Error("All payout account fields are required.");
  }
  await setConsignorPayoutAccount(prisma, userId, {
    bankCode,
    accountNumber,
    accountHolder,
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/payouts");
}
