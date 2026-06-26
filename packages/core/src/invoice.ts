import type { Invoice, LedgerEntry, Money } from "./types";

export function computeInvoice(params: {
  hammer: Money;
  premiumPct: number;
  taxPct: number;
}): Invoice {
  const { hammer, premiumPct, taxPct } = params;
  const premium = Math.round((hammer * premiumPct) / 100);
  const tax = Math.round((premium * taxPct) / 100);
  const total = hammer + premium + tax;

  const entries: LedgerEntry[] = [
    { party: "buyer", kind: "hammer", amount: hammer },
    { party: "buyer", kind: "premium", amount: premium },
    { party: "buyer", kind: "tax", amount: tax },
  ];

  return { hammer, premium, tax, total, entries };
}
