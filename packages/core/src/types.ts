/** Integer rupiah (IDR). No minor units, no floats. */
export type Money = number;

export interface IncrementBracket {
  /** Upper bound (exclusive) for this bracket; `null` means open-ended. */
  upTo: number | null;
  /** Minimum raise while the price is within this bracket. */
  step: Money;
}

/** Ascending brackets; the final bracket MUST have `upTo: null`. */
export type IncrementTable = IncrementBracket[];

export interface BidEvent {
  bidderId: string;
  /** The bidder's maximum (proxy) amount. */
  maxAmount: Money;
  /** Epoch milliseconds. */
  createdAt: number;
}

export interface BidResolution {
  winnerId: string | null;
  currentPrice: Money;
  /** True when two or more distinct bidders are competing. */
  contested: boolean;
}

export type LedgerParty = "buyer" | "seller" | "house";
export type LedgerKind =
  | "hammer"
  | "premium"
  | "commission"
  | "tax"
  | "deposit"
  | "payout"
  | "refund";

export interface LedgerEntry {
  party: LedgerParty;
  kind: LedgerKind;
  /** Positive integer rupiah owed/owing for this line. */
  amount: Money;
}

export interface Invoice {
  hammer: Money;
  premium: Money;
  tax: Money;
  total: Money;
  entries: LedgerEntry[];
}
