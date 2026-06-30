import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { SaleForm } from "../sale-form";
import { createSaleAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewSalePage() {
  await requireStaff();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/admin/sales"
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sales
        </Link>
        <h2 className="mt-3 font-serif text-3xl text-ink">New sale</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up the schedule, format, and fees. You can add lots after saving.
        </p>
      </div>
      <SaleForm action={createSaleAction} />
    </div>
  );
}
