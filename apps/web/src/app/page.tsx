import { prisma, listSales } from "@/lib/db";
import { SaleCard } from "@/components/sale-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const sales = await listSales(prisma);

  return (
    <div>
      <section className="mb-16 max-w-2xl">
        <h1 className="text-5xl leading-[1.05]">Current & Upcoming Sales</h1>
        <p className="mt-4 text-muted">
          Browse the catalogue. Registration to bid opens ahead of each sale.
        </p>
      </section>

      {sales.length === 0 ? (
        <p className="text-muted">No sales are currently listed.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {sales.map((sale) => (
            <SaleCard key={sale.id} sale={sale} />
          ))}
        </div>
      )}
    </div>
  );
}
