import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, BarChart3, ExternalLink } from "lucide-react";
import { prisma, getSale } from "@/lib/db";
import { departmentLabel } from "@auction/core";
import type { SaleStatus } from "@auction/db";
import { SaleForm } from "../sale-form";
import { FeaturedToggle } from "../featured-toggle";
import { updateSaleAction, setSaleStatusAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

const STATUSES: SaleStatus[] = ["draft", "scheduled", "live", "closed"];

const STATUS_VARIANT: Record<
  SaleStatus,
  "default" | "secondary" | "muted" | "outline"
> = {
  draft: "muted",
  scheduled: "outline",
  live: "default",
  closed: "secondary",
};

export default async function EditSalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getSale(prisma, id);
  if (!sale) notFound();

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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-3xl text-ink">{sale.title}</h2>
          <Badge variant={STATUS_VARIANT[sale.status]}>{sale.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {departmentLabel(sale.category) ?? "Unfiled"}
        </p>
      </div>

      {/* Status + quick links */}
      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((status) => (
                <form
                  key={status}
                  action={setSaleStatusAction.bind(null, id, status)}
                >
                  <Button
                    type="submit"
                    size="sm"
                    variant={status === sale.status ? "solid" : "outline"}
                  >
                    {status}
                  </Button>
                </form>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Homepage hero
            </p>
            <FeaturedToggle
              saleId={sale.id}
              featured={sale.featured}
              title={sale.title}
            />
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/sales/${id}/lots`}>
                <Boxes className="h-4 w-4" />
                Manage lots
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/sales/${id}/results`}>
                <BarChart3 className="h-4 w-4" />
                Results &amp; payments
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/sales/${id}`} target="_blank">
                <ExternalLink className="h-4 w-4" />
                View on site
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <SaleForm sale={sale} action={updateSaleAction.bind(null, id)} />
    </div>
  );
}
