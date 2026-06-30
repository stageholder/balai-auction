import type { PrismaClient } from "@prisma/client";
import { consignmentRequestRowToRecord, toDbMoney } from "../mappers";
import type {
  ConsignmentRequestRecord,
  ConsignmentRequestStatus,
  NewConsignmentRequest,
} from "../types";

/** Store a public "Sell with us" submission. Input is validated + length-capped
 *  at the action boundary; the repo just persists. */
export async function createConsignmentRequest(
  db: PrismaClient,
  input: NewConsignmentRequest
): Promise<ConsignmentRequestRecord> {
  const row = await db.consignmentRequest.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      category: input.category ?? null,
      itemTitle: input.itemTitle,
      itemDescription: input.itemDescription,
      sellerEstimate:
        input.sellerEstimate != null ? toDbMoney(input.sellerEstimate) : null,
    },
  });
  return consignmentRequestRowToRecord(row);
}

export async function listConsignmentRequests(
  db: PrismaClient
): Promise<ConsignmentRequestRecord[]> {
  const rows = await db.consignmentRequest.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(consignmentRequestRowToRecord);
}

export async function setConsignmentRequestStatus(
  db: PrismaClient,
  id: string,
  status: ConsignmentRequestStatus
): Promise<ConsignmentRequestRecord> {
  const row = await db.consignmentRequest.update({
    where: { id },
    data: { status },
  });
  return consignmentRequestRowToRecord(row);
}
