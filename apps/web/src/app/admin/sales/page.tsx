import Link from "next/link";
import { prisma, listSales } from "@/lib/db";
import { SaleForm } from "./sale-form";
import { createSaleAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSalesPage() {
  const sales = await listSales(prisma);
  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl">Sales</h1>
        <ul className="divide-y divide-line border-y border-line">
          {sales.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3">
              <Link href={`/admin/sales/${s.id}`} className="text-ink hover:underline">
                {s.title}
              </Link>
              <span className="text-xs uppercase tracking-[0.15em] text-muted">{s.status}</span>
            </li>
          ))}
          {sales.length === 0 ? <li className="py-3 text-muted">No sales yet.</li> : null}
        </ul>
      </section>
      <section>
        <h2 className="mb-4 text-xl">New sale</h2>
        <SaleForm action={createSaleAction} />
      </section>
    </div>
  );
}
