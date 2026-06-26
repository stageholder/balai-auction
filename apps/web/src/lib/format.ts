const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** Format an integer rupiah amount, e.g. 3_100_000 -> "Rp 3.100.000". */
export function formatRupiah(value: number): string {
  return rupiah.format(value);
}
