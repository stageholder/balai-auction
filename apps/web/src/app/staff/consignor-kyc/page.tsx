import { Check, FileText } from "lucide-react";
import type { KycStatus, AmlStatus, MediaAssetRecord } from "@auction/db";
import { prisma, listConsignorsForReview } from "@/lib/db";
import { screenName } from "@auction/core";
import { requireStaff } from "@/lib/auth";
import { createSignedUrl } from "@/lib/storage";
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
import { ReviewControls } from "./review-controls";

export const dynamic = "force-dynamic";

const KYC_LABEL: Record<KycStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const AML_LABEL: Record<AmlStatus, string> = {
  pending: "Pending",
  cleared: "Cleared",
  flagged: "Flagged",
};

// Tokens only. Pending awaits a decision (muted); the affirming outcome reads as
// settled (outline/secondary ink); the adverse outcome needs eyes (destructive).
const KYC_VARIANT: Record<KycStatus, NonNullable<BadgeProps["variant"]>> = {
  pending: "muted",
  approved: "outline",
  rejected: "destructive",
};

const AML_VARIANT: Record<AmlStatus, NonNullable<BadgeProps["variant"]>> = {
  pending: "muted",
  cleared: "outline",
  flagged: "destructive",
};

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

/** Identity documents live in a PRIVATE bucket — mint a short-lived signed URL
 *  per document so staff can view them without exposing a public link. */
async function signDocuments(
  docs: MediaAssetRecord[]
): Promise<Map<string, string | null>> {
  const entries = await Promise.all(
    docs.map(
      async (d) =>
        [d.id, await createSignedUrl(d.bucket, d.path, 600)] as const
    )
  );
  return new Map(entries);
}

function DocumentViewer({
  docs,
  urls,
}: {
  docs: MediaAssetRecord[];
  urls: Map<string, string | null>;
}) {
  return (
    <div>
      <p className="mb-2 text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
        Identity documents ({docs.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {docs.map((d) => {
          const url = urls.get(d.id) ?? null;
          const isImage = d.contentType.startsWith("image/");
          if (!url) {
            return (
              <span
                key={d.id}
                className="flex h-20 w-20 items-center justify-center border border-line bg-line/30 text-[0.55rem] text-muted-foreground"
              >
                Unavailable
              </span>
            );
          }
          return (
            <a
              key={d.id}
              href={url}
              target="_blank"
              rel="noreferrer"
              title={d.originalName ?? "Open document"}
              className="relative flex h-20 w-20 items-center justify-center overflow-hidden border border-line bg-line/30 transition-opacity hover:opacity-80"
            >
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 p-1 text-center">
                  <FileText className="h-6 w-6 text-muted-foreground" aria-hidden />
                  <span className="text-[0.55rem] uppercase tracking-[0.1em] text-muted-foreground">
                    PDF
                  </span>
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default async function StaffConsignorKycPage() {
  await requireStaff();
  const consignors = await listConsignorsForReview(prisma);
  // Pre-sign every document once so each row can render its viewer.
  const signedUrls = await signDocuments(
    consignors.flatMap((c) => c.kycDocuments)
  );

  const submitted = consignors.filter((c) => c.consignorLegalName);
  const flaggedCount = submitted.filter(
    (c) => screenName(c.consignorLegalName ?? "").length > 0
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-ink">Consignor KYC</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Identity, sanctions screening and AML decisions for consignors.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {submitted.length > 0 ? (
            <Badge variant="muted" className="tnum">
              {submitted.length} submitted
            </Badge>
          ) : null}
          {flaggedCount > 0 ? (
            <Badge variant="destructive" className="tnum">
              {flaggedCount} possible sanctions match
            </Badge>
          ) : null}
        </div>
      </div>

      {consignors.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No consignors on file.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[18rem]">Consignor</TableHead>
                  <TableHead>Identity &amp; screening</TableHead>
                  <TableHead className="w-[20rem]">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consignors.map((c) => {
                  const legalName = c.consignorLegalName;
                  const hasSubmitted = Boolean(legalName);
                  const matches = screenName(legalName ?? "");
                  const hasBank = Boolean(
                    c.payoutBankCode &&
                      c.payoutAccountNumber &&
                      c.payoutAccountHolder
                  );
                  const acct = c.payoutAccountNumber?.trim() ?? "";
                  const maskedAccount = acct ? `····${acct.slice(-4)}` : "";
                  const payoutDest = hasBank
                    ? `${c.payoutBankCode} ${maskedAccount} · ${c.payoutAccountHolder}`
                    : "Not provided";

                  return (
                    <TableRow key={c.id} className="align-top">
                      {/* Consignor + status */}
                      <TableCell>
                        <p className="font-serif text-lg text-ink">
                          {legalName ?? c.email}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {c.email}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
                              KYC
                            </span>
                            <Badge variant={KYC_VARIANT[c.consignorKycStatus]}>
                              {KYC_LABEL[c.consignorKycStatus]}
                            </Badge>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
                              AML
                            </span>
                            <Badge variant={AML_VARIANT[c.consignorAmlStatus]}>
                              {AML_LABEL[c.consignorAmlStatus]}
                            </Badge>
                          </span>
                        </div>
                        {c.consignorAmlNote ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            <span className="uppercase tracking-[0.12em]">
                              AML note:
                            </span>{" "}
                            {c.consignorAmlNote}
                          </p>
                        ) : null}
                      </TableCell>

                      {/* Identity + sanctions screen */}
                      <TableCell>
                        {hasSubmitted ? (
                          <div className="flex flex-col gap-4">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                              <Field
                                label="ID type"
                                value={c.consignorIdType ?? "—"}
                              />
                              <Field
                                label="ID number"
                                value={c.consignorIdNumber ?? "—"}
                              />
                              <Field label="Payout account" value={payoutDest} />
                            </dl>

                            {/* Uploaded identity documents (private, signed) */}
                            {c.kycDocuments.length > 0 ? (
                              <DocumentViewer
                                docs={c.kycDocuments}
                                urls={signedUrls}
                              />
                            ) : (
                              <p className="border-l-2 border-primary/40 bg-primary/[0.03] px-3 py-2 text-xs text-muted-foreground">
                                No identity documents uploaded — request a photo
                                or scan before approving.
                              </p>
                            )}

                            {/* Sanctions screen — accent callout when matched */}
                            {matches.length > 0 ? (
                              <div className="border-l-2 border-primary bg-primary/[0.04] px-4 py-3">
                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">
                                  ⚠ {matches.length} possible sanctions match
                                </p>
                                <ul className="mt-2 flex flex-col gap-1">
                                  {matches.map((m) => (
                                    <li key={m.name} className="text-sm text-ink">
                                      <span className="text-ink">{m.name}</span>
                                      <span className="text-muted-foreground">
                                        {" "}
                                        — {m.note}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                                <Check className="h-3.5 w-3.5 text-ink" />
                                No sanctions matches
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm uppercase tracking-[0.12em] text-muted-foreground">
                            Awaiting submission
                          </p>
                        )}
                      </TableCell>

                      {/* Decisions */}
                      <TableCell>
                        {hasSubmitted ? (
                          <ReviewControls
                            userId={c.id}
                            kycStatus={c.consignorKycStatus}
                            amlStatus={c.consignorAmlStatus}
                            amlNote={c.consignorAmlNote}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No identity submitted yet — nothing to decide.
                          </p>
                        )}
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
