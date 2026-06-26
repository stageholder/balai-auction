import type { PrismaClient } from "@prisma/client";
import { userRowToRecord } from "../mappers";
import type { NewUser, UserRecord } from "../types";

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
