import type { ConsignmentRequestStatus } from "@auction/db";
import { prisma, listConsignmentRequests } from "@/lib/db";
import { departmentLabel } from "@auction/core";
import { requireStaff } from "@/lib/auth";
import { formatRupiah } from "@/lib/format";
import { StatusControl } from "./status-control";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ConsignmentRequestStatus, string> = {
  pending: "New",
  reviewing: "Reviewing",
  accepted: "Accepted",
  declined: "Declined",
};

// Status marker colour, tokens only. A new inquiry awaits eyes (muted); under
// review reads as in-progress (ink outline); accepted is settled (ink filled);
// declined is the closed-out outcome (accent).
const STATUS_DOT: Record<ConsignmentRequestStatus, string> = {
  pending: "bg-muted-foreground",
  reviewing: "border border-ink",
  accepted: "bg-ink",
  declined: "bg-primary",
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
      <dt className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}

export default async function StaffConsignmentRequestsPage() {
  await requireStaff();
  const requests = await listConsignmentRequests(prisma);

  const newCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl">Consignment requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Public &ldquo;Sell with us&rdquo; inquiries awaiting triage.
          {requests.length > 0 ? (
            <>
              {" "}
              {requests.length} submitted
              {newCount > 0 ? (
                <span className="text-ink">
                  {" · "}
                  {newCount} new
                </span>
              ) : null}
              .
            </>
          ) : null}
        </p>
      </header>

      {requests.length === 0 ? (
        <p className="text-muted-foreground">No consignment requests yet.</p>
      ) : (
        <ul className="flex flex-col gap-px bg-line">
          {requests.map((r) => {
            const department = departmentLabel(r.category);
            const estimate =
              r.sellerEstimate != null
                ? formatRupiah(r.sellerEstimate)
                : "Not stated";
            const contact = r.phone ? `${r.email} · ${r.phone}` : r.email;

            return (
              <li
                key={r.id}
                className="grid gap-8 bg-paper px-6 py-7 lg:grid-cols-[1fr_minmax(15rem,18rem)]"
              >
                {/* Contact + item */}
                <div className="flex flex-col gap-5">
                  <div>
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="font-serif text-xl text-ink">{r.name}</p>
                      <span className="inline-flex shrink-0 items-center gap-2 text-xs uppercase tracking-[0.12em] text-ink">
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[r.status]}`}
                        />
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                    {/* Contact details are staff-only — this page is requireStaff. */}
                    <p className="mt-1 text-sm text-muted-foreground">{contact}</p>
                  </div>

                  <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {department ?? "Department unspecified"}
                  </span>

                  <div>
                    <p className="text-base text-ink">{r.itemTitle}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.itemDescription}
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                    <Field label="Asking estimate" value={estimate} />
                    <Field
                      label="Submitted"
                      value={formatSubmitted(r.createdAt)}
                    />
                  </dl>
                </div>

                {/* Triage */}
                <div className="lg:border-l lg:border-line lg:pl-8">
                  <StatusControl id={r.id} status={r.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
