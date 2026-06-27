/** Single house-default seller commission (percent of hammer). */
export const DEFAULT_SELLER_COMMISSION_PCT = 10;

export function isValidCommissionPct(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 100;
}
