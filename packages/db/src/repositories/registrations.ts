import type { PrismaClient } from "../generated/client";
import { registrationRowToRecord } from "../mappers";
import type {
  KycStatus,
  NewRegistration,
  PendingRegistrationView,
  RegistrationRecord,
} from "../types";

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

export async function listPendingRegistrations(
  db: PrismaClient
): Promise<PendingRegistrationView[]> {
  const rows = await db.registration.findMany({
    where: { kycStatus: "pending" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { email: true, legalName: true } },
      sale: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    userEmail: r.user.email,
    userLegalName: r.user.legalName,
    saleTitle: r.sale.title,
    createdAt: r.createdAt,
  }));
}
