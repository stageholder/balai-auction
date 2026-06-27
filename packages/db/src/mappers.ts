import type { BidEvent, IncrementTable } from "@auction/core";
import type {
  BidRecord,
  InvoiceRecord,
  LedgerEntryRecord,
  LotRecord,
  RegistrationRecord,
  SaleRecord,
  UserRecord,
} from "./types";

export function toMoney(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`money value ${v} exceeds the safe integer range`);
  }
  return n;
}

export function toDbMoney(v: number): bigint {
  if (!Number.isInteger(v)) {
    throw new Error(`money must be an integer rupiah amount, got ${v}`);
  }
  return BigInt(v);
}

export function toIncrementTable(json: unknown): IncrementTable {
  if (!Array.isArray(json)) {
    throw new Error("incrementTable must be a JSON array of brackets");
  }
  return json.map((raw) => {
    const b = raw as { upTo: number | null; step: number };
    return { upTo: b.upTo, step: b.step };
  });
}

export function bidRowToEvent(row: {
  bidderId: string;
  maxAmount: bigint;
  createdAt: Date;
}): BidEvent {
  return {
    bidderId: row.bidderId,
    maxAmount: toMoney(row.maxAmount),
    createdAt: row.createdAt.getTime(),
  };
}

// --- Row → Record mappers. Each accepts the matching Prisma model shape. ---

export function userRowToRecord(row: {
  id: string;
  email: string;
  role: UserRecord["role"];
  legalName: string | null;
  phone: string | null;
  createdAt: Date;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    legalName: row.legalName,
    phone: row.phone,
    createdAt: row.createdAt,
  };
}

export function saleRowToRecord(row: {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  buyersPremiumPct: number;
  taxPct: number;
  mode: SaleRecord["mode"];
  liveLotSeconds: number;
  category: string | null;
  incrementTable: unknown;
  status: SaleRecord["status"];
  createdAt: Date;
}): SaleRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    buyersPremiumPct: row.buyersPremiumPct,
    taxPct: row.taxPct,
    mode: row.mode,
    liveLotSeconds: row.liveLotSeconds,
    category: row.category,
    incrementTable: toIncrementTable(row.incrementTable),
    status: row.status,
    createdAt: row.createdAt,
  };
}

export function lotRowToRecord(row: {
  id: string;
  saleId: string;
  lotNumber: number;
  title: string;
  description: string | null;
  images: unknown;
  estimateLow: bigint;
  estimateHigh: bigint;
  startingPrice: bigint;
  reserve: bigint | null;
  closesAt: Date;
  status: LotRecord["status"];
  consignorId: string | null;
  createdAt: Date;
}): LotRecord {
  return {
    id: row.id,
    saleId: row.saleId,
    lotNumber: row.lotNumber,
    title: row.title,
    description: row.description,
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    estimateLow: toMoney(row.estimateLow),
    estimateHigh: toMoney(row.estimateHigh),
    startingPrice: toMoney(row.startingPrice),
    reserve: row.reserve === null ? null : toMoney(row.reserve),
    closesAt: row.closesAt,
    status: row.status,
    consignorId: row.consignorId,
    createdAt: row.createdAt,
  };
}

export function bidRowToRecord(row: {
  id: string;
  lotId: string;
  bidderId: string;
  maxAmount: bigint;
  amount: bigint;
  type: BidRecord["type"];
  createdAt: Date;
}): BidRecord {
  return {
    id: row.id,
    lotId: row.lotId,
    bidderId: row.bidderId,
    maxAmount: toMoney(row.maxAmount),
    amount: toMoney(row.amount),
    type: row.type,
    createdAt: row.createdAt,
  };
}

export function registrationRowToRecord(row: {
  id: string;
  userId: string;
  saleId: string;
  kycStatus: RegistrationRecord["kycStatus"];
  xenditCardToken: string | null;
  createdAt: Date;
}): RegistrationRecord {
  return {
    id: row.id,
    userId: row.userId,
    saleId: row.saleId,
    kycStatus: row.kycStatus,
    xenditCardToken: row.xenditCardToken,
    createdAt: row.createdAt,
  };
}

export function invoiceRowToRecord(row: {
  id: string;
  lotId: string;
  buyerId: string;
  hammer: bigint;
  premium: bigint;
  tax: bigint;
  total: bigint;
  status: InvoiceRecord["status"];
  xenditInvoiceId: string | null;
  createdAt: Date;
}): InvoiceRecord {
  return {
    id: row.id,
    lotId: row.lotId,
    buyerId: row.buyerId,
    hammer: toMoney(row.hammer),
    premium: toMoney(row.premium),
    tax: toMoney(row.tax),
    total: toMoney(row.total),
    status: row.status,
    xenditInvoiceId: row.xenditInvoiceId,
    createdAt: row.createdAt,
  };
}

export function ledgerEntryRowToRecord(row: {
  id: string;
  invoiceId: string | null;
  lotId: string | null;
  party: LedgerEntryRecord["party"];
  kind: LedgerEntryRecord["kind"];
  amount: bigint;
  createdAt: Date;
}): LedgerEntryRecord {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    lotId: row.lotId,
    party: row.party,
    kind: row.kind,
    amount: toMoney(row.amount),
    createdAt: row.createdAt,
  };
}
