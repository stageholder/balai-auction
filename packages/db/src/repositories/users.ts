import type { PrismaClient } from "@prisma/client";
import { mediaAssetRowToRecord, userRowToRecord } from "../mappers";
import type {
  ConsignorReviewRecord,
  NewMedia,
  NewUser,
  UpsertUser,
  UserProfileUpdate,
  UserRecord,
  UserRole,
} from "../types";

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

export async function submitConsignorKyc(
  db: PrismaClient,
  userId: string,
  input: {
    legalName: string;
    idType: string;
    idNumber: string;
    bankCode: string;
    accountNumber: string;
    accountHolder: string;
    documents?: NewMedia[];
  }
): Promise<UserRecord> {
  const documents = input.documents ?? [];
  const row = await db.user.update({
    where: { id: userId },
    data: {
      consignorLegalName: input.legalName,
      consignorIdType: input.idType,
      consignorIdNumber: input.idNumber,
      payoutBankCode: input.bankCode,
      payoutAccountNumber: input.accountNumber,
      payoutAccountHolder: input.accountHolder,
      // Any re-submission re-enters BOTH queues: a changed identity or payout
      // destination invalidates the prior AML clearance, not just KYC.
      consignorKycStatus: "pending",
      consignorAmlStatus: "pending",
      consignorAmlNote: null,
      // Replace the document set only when new files were uploaded, so a
      // text-only resubmission keeps the identity docs already on file.
      ...(documents.length > 0
        ? {
            kycDocuments: {
              deleteMany: {},
              create: documents.map((m, i) => ({
                kind: "kyc_document" as const,
                bucket: m.bucket,
                path: m.path,
                url: m.url ?? null,
                contentType: m.contentType,
                sizeBytes: m.sizeBytes,
                originalName: m.originalName ?? null,
                caption: m.caption ?? null,
                sortOrder: i,
              })),
            },
          }
        : {}),
    },
  });
  return userRowToRecord(row);
}

export async function setConsignorKycStatus(
  db: PrismaClient,
  userId: string,
  status: "approved" | "rejected" | "pending"
): Promise<UserRecord> {
  const row = await db.user.update({
    where: { id: userId },
    data: { consignorKycStatus: status },
  });
  return userRowToRecord(row);
}

export async function setConsignorAml(
  db: PrismaClient,
  userId: string,
  input: { amlStatus: "pending" | "cleared" | "flagged"; amlNote?: string | null }
): Promise<UserRecord> {
  const row = await db.user.update({
    where: { id: userId },
    data: {
      consignorAmlStatus: input.amlStatus,
      consignorAmlNote: input.amlNote ?? null,
    },
  });
  return userRowToRecord(row);
}

export async function countConsignorKycDocuments(
  db: PrismaClient,
  userId: string
): Promise<number> {
  return db.mediaAsset.count({
    where: { kycUserId: userId, kind: "kyc_document" },
  });
}

export async function listConsignorsForReview(
  db: PrismaClient
): Promise<ConsignorReviewRecord[]> {
  const rows = await db.user.findMany({
    where: { role: "consignor" },
    orderBy: { email: "asc" },
    include: { kycDocuments: { orderBy: { sortOrder: "asc" } } },
  });
  return rows.map((row) => ({
    ...userRowToRecord(row),
    kycDocuments: row.kycDocuments.map(mediaAssetRowToRecord),
  }));
}
