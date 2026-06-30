import Link from "next/link";
import { Check, X } from "lucide-react";
import type { PayoutStatus } from "@auction/db";
import { prisma, listPayouts } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { formatRupiah } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PayoutActions } from "./payout-actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: "Pending",
  released: "Released",
  paid: "Paid",
  failed: "Failed",
};

// Status badge variant, tokens only. Pending awaits action (muted), released is
// in flight (secondary), paid is settled (default ink-on-paper outline), failed
// needs attention (destructive).
const STATUS_VARIANT: Record<PayoutStatus, NonNullable<BadgeProps["variant"]>> = {
  pending: "muted",
  released: "secondary",
  paid: "outline",
  failed: "destructive",
};

/** One compliance check as a Badge — never colour-only: it carries the label
 *  (KYC/AML/Bank) and a check/cross glyph, with the verdict reinforced by tone
 *  (muted when cleared, destructive when unmet). */
function ComplianceBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <Badge variant={ok ? "muted" : "destructive"} className="gap-1">
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
      <span className="sr-only">{ok ? "cleared" : "not cleared"}</span>
    </Badge>
  );
}

export default async function AdminPayoutsPage() {
  await requireStaff();
  const payouts = await listPayouts(prisma);

  const pending = payouts.filter((p) => p.status === "pending");
  const totalNetPending = pending.reduce((sum, p) => sum + p.net, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-3xl text-ink">Payouts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Settlement ledger — net due to consignors after commission.
        </p>
      </div>

      {payouts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No payouts yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:max-w-md">
            <Card>
              <CardContent className="pt-6">
                <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  Pending
                </p>
                <p className="tnum mt-1 font-serif text-3xl text-ink">
                  {pending.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  Net pending
                </p>
                <p className="tnum mt-1 font-serif text-3xl text-ink">
                  {formatRupiah(totalNetPending)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot</TableHead>
                    <TableHead>Consignor</TableHead>
                    <TableHead className="text-right">Hammer</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Compliance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => (
                    <TableRow key={p.id} className="align-top">
                      <TableCell>
                        <span className="tnum text-muted-foreground">
                          {p.lotNumber}
                        </span>{" "}
                        <span className="text-ink">{p.lotTitle}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.consignorEmail}
                      </TableCell>
                      <TableCell className="tnum text-right text-muted-foreground">
                        {formatRupiah(p.hammer)}
                      </TableCell>
                      <TableCell className="tnum text-right text-muted-foreground">
                        {formatRupiah(p.commission)}
                      </TableCell>
                      <TableCell className="tnum text-right text-ink">
                        {formatRupiah(p.net)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ComplianceBadge
                            label="KYC"
                            ok={p.consignorKycStatus === "approved"}
                          />
                          <ComplianceBadge
                            label="AML"
                            ok={p.consignorAmlStatus === "cleared"}
                          />
                          <ComplianceBadge label="Bank" ok={p.hasBankDetails} />
                        </div>
                        {!p.hasBankDetails ? (
                          <Link
                            href="/admin/users"
                            className="mt-1.5 inline-block text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink"
                          >
                            Add bank in Users
                          </Link>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[p.status]}>
                          {STATUS_LABEL[p.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <PayoutActions
                            payoutId={p.id}
                            status={p.status}
                            releaseReady={p.releaseReady}
                            releaseBlockedReason={p.releaseBlockedReason}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
