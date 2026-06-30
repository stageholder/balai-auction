import Link from "next/link";
import { Plus, CalendarRange } from "lucide-react";
import { prisma, listSales } from "@/lib/db";
import { departmentLabel } from "@auction/core";
import type { SaleMode } from "@auction/core";
import type { SaleStatus } from "@auction/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { FeaturedToggle } from "./featured-toggle";
import { SaleRowActions } from "./sale-row-actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  SaleStatus,
  "default" | "secondary" | "muted" | "outline"
> = {
  draft: "muted",
  scheduled: "outline",
  live: "default",
  closed: "secondary",
};

const MODE_LABEL: Record<SaleMode, string> = {
  timed: "Timed",
  live: "Live",
};

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatRange(startsAt: Date, endsAt: Date): string {
  return `${dateFmt.format(new Date(startsAt))} → ${dateFmt.format(
    new Date(endsAt)
  )}`;
}

export default async function AdminSalesPage() {
  const sales = await listSales(prisma);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-ink">Sales</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every auction in the catalogue. Feature a sale to surface it in the
            homepage hero.
          </p>
        </div>
        <Button asChild variant="accent">
          <Link href="/admin/sales/new">
            <Plus className="h-4 w-4" />
            New sale
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <CalendarRange className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium text-ink">No sales yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create your first auction to start adding lots.
                </p>
              </div>
              <Button asChild variant="accent" size="sm">
                <Link href="/admin/sales/new">
                  <Plus className="h-4 w-4" />
                  New sale
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Featured</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-ink">
                      <Link
                        href={`/admin/sales/${s.id}`}
                        className="hover:underline"
                      >
                        {s.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {departmentLabel(s.category) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status]}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {MODE_LABEL[s.mode]}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground tnum">
                      {formatRange(s.startsAt, s.endsAt)}
                    </TableCell>
                    <TableCell>
                      <FeaturedToggle
                        saleId={s.id}
                        featured={s.featured}
                        title={s.title}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <SaleRowActions saleId={s.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
