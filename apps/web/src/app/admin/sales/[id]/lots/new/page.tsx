import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma, getSale, listConsignors } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { LotForm } from "../lot-form";
import { createLotAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewLotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const sale = await getSale(prisma, id);
  if (!sale) notFound();
  const consignors = await listConsignors(prisma);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href={`/admin/sales/${id}/lots`}
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to lots
        </Link>
        <h2 className="mt-3 font-serif text-3xl text-ink">
          Add lot — {sale.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Catalogue a new lot. It joins the sale as soon as you save.
        </p>
      </div>
      <LotForm
        consignors={consignors}
        action={createLotAction.bind(null, id)}
      />
    </div>
  );
}
