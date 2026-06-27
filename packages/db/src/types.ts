import type { IncrementTable } from "@auction/core";

export type UserRole = "buyer" | "staff" | "consignor";
export type SaleStatus = "draft" | "scheduled" | "live" | "closed";
export type LotStatus = "live" | "sold" | "unsold" | "paid" | "fulfilled";
export type BidType = "bid" | "proxy_auto" | "reserve_check";
export type KycStatus = "pending" | "approved" | "rejected";
export type LedgerParty = "buyer" | "seller" | "house";
export type LedgerKind =
  | "hammer"
  | "premium"
  | "tax"
  | "deposit"
  | "payout"
  | "refund";
export type InvoiceStatus = "pending" | "paid" | "refunded";

export interface UserRecord {
  id: string;
  email: string;
  role: UserRole;
  legalName: string | null;
  phone: string | null;
  createdAt: Date;
}
export interface NewUser {
  email: string;
  role?: UserRole;
}

export interface UpsertUser {
  id: string;
  email: string;
  role?: UserRole;
  legalName?: string | null;
  phone?: string | null;
}

export interface UserProfileUpdate {
  legalName?: string | null;
  phone?: string | null;
}

export interface SaleRecord {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  buyersPremiumPct: number;
  taxPct: number;
  incrementTable: IncrementTable;
  status: SaleStatus;
  createdAt: Date;
}
export interface NewSale {
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  buyersPremiumPct: number;
  taxPct: number;
  incrementTable: IncrementTable;
  status?: SaleStatus;
}

export interface LotRecord {
  id: string;
  saleId: string;
  lotNumber: number;
  title: string;
  description: string | null;
  images: string[];
  estimateLow: number;
  estimateHigh: number;
  startingPrice: number;
  reserve: number | null;
  closesAt: Date;
  status: LotStatus;
  consignorId: string | null;
  createdAt: Date;
}
export interface NewLot {
  saleId: string;
  lotNumber: number;
  title: string;
  description?: string;
  images?: string[];
  estimateLow: number;
  estimateHigh: number;
  startingPrice: number;
  reserve?: number | null;
  closesAt: Date;
  consignorId?: string | null;
}

export interface BidRecord {
  id: string;
  lotId: string;
  bidderId: string;
  maxAmount: number;
  amount: number;
  type: BidType;
  createdAt: Date;
}
export interface NewBid {
  lotId: string;
  bidderId: string;
  maxAmount: number;
  amount: number;
  type?: BidType;
}

export interface RegistrationRecord {
  id: string;
  userId: string;
  saleId: string;
  kycStatus: KycStatus;
  xenditCardToken: string | null;
  createdAt: Date;
}
export interface NewRegistration {
  userId: string;
  saleId: string;
  xenditCardToken?: string | null;
}

export interface InvoiceRecord {
  id: string;
  lotId: string;
  buyerId: string;
  hammer: number;
  premium: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  xenditInvoiceId: string | null;
  createdAt: Date;
}

export interface LedgerEntryRecord {
  id: string;
  invoiceId: string | null;
  lotId: string | null;
  party: LedgerParty;
  kind: LedgerKind;
  amount: number;
  createdAt: Date;
}
