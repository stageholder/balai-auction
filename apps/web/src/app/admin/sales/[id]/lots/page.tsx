import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus, Boxes, ImageOff } from "lucide-react";
import {
  prisma,
  getSale,
  listLotsForSale,
  listConsignors,
  getBidEventsForLot,
} from "@/lib/db";
import { resolveBids } from "@auction/core";
import type { LotStatus } from "@auction/db";
import { formatRupiah } from "@/lib/format";
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
import { LotRowActions } from "./lot-row-actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  LotStatus,
  "default" | "secondary" | "muted" | "outline"
> = {
  queued: "outline",
  live: "default",
  sold: "secondary",
  unsold: "muted",
  paid: "secondary",
  fulfilled: "secondary",
};

export default async function AdminLotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await getSale(prisma, id);
  if (!sale) notFound();

  const lots = await listLotsForSale(prisma, id);
  const consignors = await listConsignors(prisma);
  const consignorEmail = new Map(consignors.map((c) => [c.id, c.email]));

  // Monitoring: resolve the current bid for every lot from its bid ledger.
  const bidEvents = await Promise.all(
    lots.map((lot) => getBidEventsForLot(prisma, lot.id))
  );
  const currentBids = lots.map((lot, i) => {
    const events = bidEvents[i];
    const { currentPrice } = resolveBids(
      lot.startingPrice,
      events,
      sale.incrementTable
    );
    return { currentPrice, count: events.length };
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-4">
        <Link
          href={`/admin/sales/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sale
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Sale catalogue
            </p>
            <h2 className="mt-1 font-serif text-3xl text-ink">{sale.title}</h2>
            <Link
              href={`/sales/${id}`}
              target="_blank"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-ink"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View sale on site
            </Link>
          </div>
          <Button asChild variant="accent">
            <Link href={`/admin/sales/${id}/lots/new`}>
              <Plus className="h-4 w-4" />
              Add lot
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {lots.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <Boxes className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium text-ink">No lots yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add the first lot to start building this catalogue.
                </p>
              </div>
              <Button asChild variant="accent" size="sm">
                <Link href={`/admin/sales/${id}/lots/new`}>
                  <Plus className="h-4 w-4" />
                  Add lot
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Lot</TableHead>
                  <TableHead className="w-14" />
                  <TableHead>Title</TableHead>
                  <TableHead>Estimate</TableHead>
                  <TableHead>Reserve</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current bid</TableHead>
                  <TableHead>Consignor</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((lot, i) => {
                  const bid = currentBids[i];
                  const isLive = lot.status === "live";
                  return (
                    <TableRow key={lot.id}>
                      <TableCell className="font-serif text-lg tnum text-ink">
                        {String(lot.lotNumber).padStart(3, "0")}
                      </TableCell>
                      <TableCell>
                        <div className="relative h-12 w-10 overflow-hidden rounded-sm border border-line bg-line/40">
                          {lot.images[0] ? (
                            <Image
                              src={lot.images[0]}
                              alt={lot.title}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : (
                            <ImageOff className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        <Link
                          href={`/admin/sales/${id}/lots/${lot.id}`}
                          className="block truncate font-medium text-ink hover:underline"
                        >
                          {lot.title}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs tnum text-muted-foreground">
                        {formatRupiah(lot.estimateLow)}
                        <span className="mx-1 text-line">–</span>
                        {formatRupiah(lot.estimateHigh)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs tnum text-muted-foreground">
                        {lot.reserve != null ? formatRupiah(lot.reserve) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[lot.status] ?? "muted"}>
                          {lot.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tnum">
                        {bid.count === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            No bids
                          </span>
                        ) : (
                          <span className="text-sm text-ink">
                            {formatRupiah(bid.currentPrice)}
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              · {bid.count} bid{bid.count === 1 ? "" : "s"}
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">
                        {(lot.consignorId &&
                          consignorEmail.get(lot.consignorId)) ||
                          "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <LotRowActions
                          saleId={id}
                          lotId={lot.id}
                          isLive={isLive}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
