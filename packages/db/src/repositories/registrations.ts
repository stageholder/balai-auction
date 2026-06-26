import type { PrismaClient } from "@prisma/client";
import { registrationRowToRecord } from "../mappers";
import type { KycStatus, NewRegistration, RegistrationRecord } from "../types";

export async function createRegistration(
  db: PrismaClient,
  input: NewRegistration
): Promise<RegistrationRecord> {
  const row = await db.registration.create({
    data: {
      userId: input.userId,
      saleId: input.saleId,
      xenditCardToken: input.xenditCardToken ?? null,
      kycStatus: "pending",
    },
  });
  return registrationRowToRecord(row);
}

export async function getRegistration(
  db: PrismaClient,
  userId: string,
  saleId: string
): Promise<RegistrationRecord | null> {
  const row = await db.registration.findUnique({
    where: { userId_saleId: { userId, saleId } },
  });
  return row ? registrationRowToRecord(row) : null;
}

export async function setRegistrationKyc(
  db: PrismaClient,
  id: string,
  kycStatus: KycStatus
): Promise<RegistrationRecord> {
  const row = await db.registration.update({
    where: { id },
    data: { kycStatus },
  });
  return registrationRowToRecord(row);
}
