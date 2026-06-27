import type { PrismaClient } from "@prisma/client";
import { userRowToRecord } from "../mappers";
import type { NewUser, UpsertUser, UserProfileUpdate, UserRecord, UserRole } from "../types";

export async function createUser(
  db: PrismaClient,
  input: NewUser
): Promise<UserRecord> {
  const row = await db.user.create({
    data: { email: input.email, role: input.role ?? "buyer" },
  });
  return userRowToRecord(row);
}

export async function getUser(
  db: PrismaClient,
  id: string
): Promise<UserRecord | null> {
  const row = await db.user.findUnique({ where: { id } });
  return row ? userRowToRecord(row) : null;
}

export async function upsertUserById(
  db: PrismaClient,
  input: UpsertUser
): Promise<UserRecord> {
  const row = await db.user.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      email: input.email,
      role: input.role ?? "buyer",
      legalName: input.legalName ?? null,
      phone: input.phone ?? null,
    },
    update: {
      email: input.email,
      ...(input.role ? { role: input.role } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
  });
  return userRowToRecord(row);
}

export async function updateUserProfile(
  db: PrismaClient,
  id: string,
  input: UserProfileUpdate
): Promise<UserRecord> {
  const row = await db.user.update({
    where: { id },
    data: {
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
  });
  return userRowToRecord(row);
}

export async function listUsers(db: PrismaClient): Promise<UserRecord[]> {
  const rows = await db.user.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(userRowToRecord);
}

export async function setUserRole(
  db: PrismaClient,
  id: string,
  role: UserRole
): Promise<UserRecord> {
  const row = await db.user.update({ where: { id }, data: { role } });
  return userRowToRecord(row);
}

export async function listConsignors(db: PrismaClient): Promise<UserRecord[]> {
  const rows = await db.user.findMany({
    where: { role: "consignor" },
    orderBy: { email: "asc" },
  });
  return rows.map(userRowToRecord);
}

export async function setConsignorPayoutAccount(
  db: PrismaClient,
  userId: string,
  fields: { bankCode: string; accountNumber: string; accountHolder: string }
): Promise<UserRecord> {
  const row = await db.user.update({
    where: { id: userId },
    data: {
      payoutBankCode: fields.bankCode,
      payoutAccountNumber: fields.accountNumber,
      payoutAccountHolder: fields.accountHolder,
    },
  });
  return userRowToRecord(row);
}
