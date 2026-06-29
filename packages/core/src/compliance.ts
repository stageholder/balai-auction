export type AmlStatus = "pending" | "cleared" | "flagged";

export interface SanctionsEntry {
  name: string;
  note: string;
}

/** SAMPLE watchlist for development/demo. Replace with a real OFAC/UN/PEP feed
 *  (and fuzzy/partial matching) in production — see docs/operations. */
export const SANCTIONS_WATCHLIST: SanctionsEntry[] = [
  { name: "Ivan Sample Sanctioned", note: "Sample sanctioned individual — demo only" },
  { name: "Test Pep Person", note: "Sample politically-exposed person — demo only" },
  { name: "Blocked Example Trader", note: "Sample blocked entity — demo only" },
];

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Returns watchlist entries whose every (normalized) token is present in the
 *  screened name — catches reordering + extra middle names while avoiding
 *  single-token false positives. (Production: fuzzy/phonetic matching.) */
export function screenName(
  name: string,
  list: SanctionsEntry[] = SANCTIONS_WATCHLIST
): SanctionsEntry[] {
  const nameTokens = new Set(tokens(name));
  if (nameTokens.size === 0) return [];
  return list.filter((entry) => {
    const et = tokens(entry.name);
    return et.length > 0 && et.every((t) => nameTokens.has(t));
  });
}

/** The single source of truth for whether a consignor payout may be released.
 *  Reused by listPayouts (display) and releasePayoutAction (enforcement). */
export function consignorPayoutGate(input: {
  kycStatus: string;
  amlStatus: string;
  bankCode: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.bankCode || !input.accountNumber || !input.accountHolder) {
    return { ok: false, reason: "Payout bank details missing" };
  }
  if (input.kycStatus !== "approved") {
    return { ok: false, reason: "Consignor KYC not approved" };
  }
  if (input.amlStatus !== "cleared") {
    return { ok: false, reason: "Consignor AML not cleared" };
  }
  return { ok: true };
}
