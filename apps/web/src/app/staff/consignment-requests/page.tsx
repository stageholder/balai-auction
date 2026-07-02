import type { ConsignmentRequestStatus } from "@auction/db";
import { prisma, listConsignmentRequests } from "@/lib/db";
import { departmentLabel } from "@auction/core";
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
import { StatusControl } from "./status-control";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ConsignmentRequestStatus, string> = {
  pending: "New",
  reviewing: "Reviewing",
  accepted: "Accepted",
  declined: "Declined",
};

// Tokens only. New awaits eyes (default crimson — it should pop); reviewing is
// in-progress (secondary); accepted is settled (outline ink); declined is the
// closed-out adverse outcome (destructive).
const STATUS_VARIANT: Record<
  ConsignmentRequestStatus,
  NonNullable<BadgeProps["variant"]>
> = {
  pending: "default",
  reviewing: "secondary",
  accepted: "outline",
  declined: "destructive",
};

function formatSubmitted(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

export default async function StaffConsignmentRequestsPage() {
  await requireStaff();
  const requests = await listConsignmentRequests(prisma);

  const newCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-ink">Consignment requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Public &ldquo;Sell with us&rdquo; inquiries awaiting triage.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {requests.length > 0 ? (
            <Badge variant="muted" className="tnum">
              {requests.length} submitted
            </Badge>
          ) : null}
          {newCount > 0 ? (
            <Badge variant="default" className="tnum">
              {newCount} new
            </Badge>
          ) : null}
        </div>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No consignment requests yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[16rem]">Inquiry</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[18rem]">Triage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => {
                  const department = departmentLabel(r.category);
                  const estimate =
                    r.sellerEstimate != null
                      ? formatRupiah(r.sellerEstimate)
                      : "Not stated";
                  const contact = r.phone
                    ? `${r.email} · ${r.phone}`
                    : r.email;

                  return (
                    <TableRow key={r.id} className="align-top">
                      {/* Contact + status */}
                      <TableCell>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-serif text-lg text-ink">{r.name}</p>
                          <Badge variant={STATUS_VARIANT[r.status]}>
                            {STATUS_LABEL[r.status]}
                          </Badge>
                        </div>
                        {/* Contact details are staff-only — this page is requireStaff. */}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {contact}
                        </p>
                        <p className="mt-3 text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
                          {department ?? "Department unspecified"}
                        </p>
                      </TableCell>

                      {/* Item */}
                      <TableCell>
                        <p className="text-base text-ink">{r.itemTitle}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {r.itemDescription}
                        </p>

                        {r.photos.length > 0 ? (
                          <div className="mt-4">
                            <p className="mb-2 text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
                              {r.photos.length} photograph
                              {r.photos.length === 1 ? "" : "s"}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {r.photos.map((p) =>
                                p.url ? (
                                  <a
                                    key={p.id}
                                    href={p.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="relative block h-20 w-20 overflow-hidden border border-line bg-line/30 transition-opacity hover:opacity-80"
                                    title="Open full size"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={p.url}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  </a>
                                ) : null
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-4 text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground/70">
                            No photographs submitted
                          </p>
                        )}

                        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                          <Field label="Asking estimate" value={estimate} />
                          <Field
                            label="Submitted"
                            value={formatSubmitted(r.createdAt)}
                          />
                        </dl>
                      </TableCell>

                      {/* Triage */}
                      <TableCell>
                        <StatusControl id={r.id} status={r.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
