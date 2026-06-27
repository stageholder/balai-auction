import type { LedgerEntry, Money } from "./types";

export interface SellerSettlement {
  hammer: Money;
  sellerCommission: Money;
  consignorNet: Money;
  /** Settlement-time allocation. The `seller payout` entry is written later,
   *  when the disbursement completes (Phase 3B-2). */
  entries: LedgerEntry[];
}

export function computeSellerSettlement(params: {
  hammer: Money;
  sellerCommissionPct: number;
}): SellerSettlement {
  const { hammer, sellerCommissionPct } = params;
  const sellerCommission = Math.round((hammer * sellerCommissionPct) / 100);
  const consignorNet = hammer - sellerCommission;
  const entries: LedgerEntry[] = [
    { party: "seller", kind: "hammer", amount: hammer },
    { party: "house", kind: "commission", amount: sellerCommission },
  ];
  return { hammer, sellerCommission, consignorNet, entries };
}
