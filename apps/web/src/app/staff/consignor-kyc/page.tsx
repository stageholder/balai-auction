import type { KycStatus, AmlStatus } from "@auction/db";
import { prisma, listConsignorsForReview } from "@/lib/db";
import { screenName } from "@auction/core";
import { requireStaff } from "@/lib/auth";
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

// Status marker colour, tokens only. Pending awaits a decision (muted);
// the affirming outcome reads as settled (ink); the adverse outcome is the
// one that needs eyes (accent).
const KYC_DOT: Record<KycStatus, string> = {
  pending: "bg-muted",
  approved: "bg-ink",
  rejected: "bg-accent",
};

const AML_DOT: Record<AmlStatus, string> = {
  pending: "bg-muted",
  cleared: "bg-ink",
  flagged: "bg-accent",
};

function StatusMarker({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-ink">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}

export default async function StaffConsignorKycPage() {
  await requireStaff();
  const consignors = await listConsignorsForReview(prisma);

  const submitted = consignors.filter((c) => c.consignorLegalName);
  const flaggedCount = submitted.filter(
    (c) => screenName(c.consignorLegalName ?? "").length > 0
  ).length;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl">Consignor KYC</h1>
        <p className="mt-1 text-sm text-muted">
          Identity, sanctions screening and AML decisions for consignors.
          {submitted.length > 0 ? (
            <>
              {" "}
              {submitted.length} submitted
              {flaggedCount > 0 ? (
                <span className="text-accent">
                  {" · "}
                  {flaggedCount} with possible sanctions match
                </span>
              ) : null}
              .
            </>
          ) : null}
        </p>
      </header>

      {consignors.length === 0 ? (
        <p className="text-muted">No consignors on file.</p>
      ) : (
        <ul className="flex flex-col gap-px bg-line">
          {consignors.map((c) => {
            const legalName = c.consignorLegalName;
            const hasSubmitted = Boolean(legalName);
            const matches = screenName(legalName ?? "");
            const hasBank = Boolean(
              c.payoutBankCode && c.payoutAccountNumber && c.payoutAccountHolder
            );

            return (
              <li
                key={c.id}
                className="grid gap-8 bg-paper px-6 py-7 lg:grid-cols-[1fr_minmax(15rem,18rem)]"
              >
                {/* Identity + screening */}
                <div className="flex flex-col gap-5">
                  <div>
                    <p className="font-serif text-xl text-ink">
                      {legalName ?? c.email}
                    </p>
                    <p className="mt-1 text-sm text-muted">{c.email}</p>
                  </div>

                  {hasSubmitted ? (
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                      <Field
                        label="ID type"
                        value={c.consignorIdType ?? "—"}
                      />
                      <Field
                        label="ID number"
                        value={c.consignorIdNumber ?? "—"}
                      />
                      <Field
                        label="Bank on file"
                        value={hasBank ? "Yes" : "No"}
                      />
                    </dl>
                  ) : (
                    <p className="text-sm uppercase tracking-[0.12em] text-muted">
                      Awaiting submission
                    </p>
                  )}

                  {/* Sanctions screen — accent callout when matched */}
                  {hasSubmitted ? (
                    matches.length > 0 ? (
                      <div className="border-l-2 border-accent bg-accent/[0.04] px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-accent">
                          ⚠ {matches.length} possible sanctions match
                        </p>
                        <ul className="mt-2 flex flex-col gap-1">
                          {matches.map((m) => (
                            <li key={m.name} className="text-sm text-ink">
                              <span className="text-ink">{m.name}</span>
                              <span className="text-muted"> — {m.note}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted">
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 rounded-full bg-ink"
                        />
                        No sanctions matches
                      </p>
                    )
                  ) : null}

                  <div className="flex flex-wrap gap-x-8 gap-y-2 pt-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                        KYC
                      </span>
                      <StatusMarker
                        dot={KYC_DOT[c.consignorKycStatus]}
                        label={KYC_LABEL[c.consignorKycStatus]}
                      />
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                        AML
                      </span>
                      <StatusMarker
                        dot={AML_DOT[c.consignorAmlStatus]}
                        label={AML_LABEL[c.consignorAmlStatus]}
                      />
                    </span>
                  </div>

                  {c.consignorAmlNote ? (
                    <p className="text-sm text-muted">
                      <span className="text-[0.6rem] uppercase tracking-[0.18em]">
                        AML note:
                      </span>{" "}
                      {c.consignorAmlNote}
                    </p>
                  ) : null}
                </div>

                {/* Decisions */}
                <div className="lg:border-l lg:border-line lg:pl-8">
                  {hasSubmitted ? (
                    <ReviewControls
                      userId={c.id}
                      kycStatus={c.consignorKycStatus}
                      amlStatus={c.consignorAmlStatus}
                      amlNote={c.consignorAmlNote}
                    />
                  ) : (
                    <p className="text-sm text-muted">
                      No identity submitted yet — nothing to decide.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
