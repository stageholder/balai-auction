import { notFound } from "next/navigation";
import { prisma, getSale, getSaleResults } from "@/lib/db";
import { formatRupiah } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SaleResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getSale(prisma, id);
  if (!sale) notFound();
  const rows = await getSaleResults(prisma, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl">{sale.title} — results</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-[0.15em] text-muted">
            <th className="py-2">Lot</th>
            <th className="py-2">Title</th>
            <th className="py-2">Status</th>
            <th className="py-2 text-right">Hammer</th>
            <th className="py-2">Buyer</th>
            <th className="py-2">Payment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lotId} className="border-b border-line">
              <td className="py-2">{r.lotNumber}</td>
              <td className="py-2">{r.title}</td>
              <td className="py-2">{r.status}</td>
              <td className="tnum py-2 text-right">{r.hammer === null ? "—" : formatRupiah(r.hammer)}</td>
              <td className="py-2">{r.buyerEmail ?? "—"}</td>
              <td className="py-2">{r.invoiceStatus ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="mt-4 text-muted">No lots in this sale.</p> : null}
    </div>
  );
}
