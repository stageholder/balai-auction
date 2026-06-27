import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, getSale } from "@/lib/db";
import { SaleForm } from "../sale-form";
import { updateSaleAction, setSaleStatusAction } from "../actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "scheduled", "live", "closed"] as const;

export default async function EditSalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getSale(prisma, id);
  if (!sale) notFound();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">{sale.title}</h1>
        <Link href={`/admin/sales/${id}/lots`} className="text-sm text-ink underline">
          Manage lots →
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-sm uppercase tracking-[0.15em] text-muted">Status: {sale.status}</h2>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <form key={status} action={setSaleStatusAction.bind(null, id, status)}>
              <Button type="submit" size="sm" variant={status === sale.status ? "solid" : "outline"}>
                {status}
              </Button>
            </form>
          ))}
        </div>
        <Link href={`/admin/sales/${id}/results`} className="mt-3 inline-block text-sm text-ink underline">
          View results &amp; payments →
        </Link>
      </section>

      <section>
        <h2 className="mb-4 text-xl">Edit details</h2>
        <SaleForm sale={sale} action={updateSaleAction.bind(null, id)} />
      </section>
    </div>
  );
}
