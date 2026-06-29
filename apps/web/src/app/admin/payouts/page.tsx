import Link from "next/link";
import type { PayoutStatus } from "@auction/db";
import { prisma, listPayouts } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { formatRupiah } from "@/lib/format";
import { PayoutActions } from "./payout-actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: "Pending",
  released: "Released",
  paid: "Paid",
  failed: "Failed",
};

// Status marker colour, tokens only. Pending awaits action (muted),
// released/paid are settled (ink), failed needs attention (accent).
const STATUS_DOT: Record<PayoutStatus, string> = {
  pending: "bg-muted",
  released: "bg-ink",
  paid: "bg-ink",
  failed: "bg-accent",
};

/** One compliance check, read at a glance: the label stays quiet (muted) while
 *  the mark carries the verdict — settled in ink (✓), unmet in accent (✗). */
function ComplianceMark({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted">
      <span aria-hidden="true" className={ok ? "text-ink" : "text-accent"}>
        {ok ? "✓" : "✗"}
      </span>
      <span>{label}</span>
      <span className="sr-only">{ok ? "cleared" : "not cleared"}</span>
    </span>
  );
}

export default async function AdminPayoutsPage() {
  await requireStaff();
  const payouts = await listPayouts(prisma);

  const pending = payouts.filter((p) => p.status === "pending");
  const totalNetPending = pending.reduce((sum, p) => sum + p.net, 0);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl">Payouts</h1>
        <p className="mt-1 text-sm text-muted">
          Settlement ledger — net due to consignors after commission.
        </p>
      </header>

      {payouts.length === 0 ? (
        <p className="text-muted">No payouts yet.</p>
      ) : (
        <>
          <dl className="mb-8 flex flex-wrap gap-x-12 gap-y-4 border-y border-line py-4">
            <div>
              <dt className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                Pending
              </dt>
              <dd className="tnum mt-1 text-xl text-ink">{pending.length}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
                Net pending
              </dt>
              <dd className="tnum mt-1 text-xl text-ink">
                {formatRupiah(totalNetPending)}
              </dd>
            </div>
          </dl>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.15em] text-muted">
                <th className="py-2 font-normal">Lot</th>
                <th className="py-2 font-normal">Consignor</th>
                <th className="py-2 text-right font-normal">Hammer</th>
                <th className="py-2 text-right font-normal">Commission</th>
                <th className="py-2 text-right font-normal">Net</th>
                <th className="py-2 font-normal">Compliance</th>
                <th className="py-2 font-normal">Status</th>
                <th className="py-2 text-right font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-b border-line align-top">
                  <td className="py-3 pr-4">
                    <span className="tnum text-muted">{p.lotNumber}</span>{" "}
                    <span className="text-ink">{p.lotTitle}</span>
                  </td>
                  <td className="py-3 pr-4 text-muted">{p.consignorEmail}</td>
                  <td className="tnum py-3 pl-4 text-right text-muted">
                    {formatRupiah(p.hammer)}
                  </td>
                  <td className="tnum py-3 pl-4 text-right text-muted">
                    {formatRupiah(p.commission)}
                  </td>
                  <td className="tnum py-3 pl-4 text-right text-ink">
                    {formatRupiah(p.net)}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-x-3 gap-y-1 text-[0.7rem] uppercase tracking-[0.1em]">
                      <ComplianceMark
                        label="KYC"
                        ok={p.consignorKycStatus === "approved"}
                      />
                      <span aria-hidden="true" className="text-line">·</span>
                      <ComplianceMark
                        label="AML"
                        ok={p.consignorAmlStatus === "cleared"}
                      />
                      <span aria-hidden="true" className="text-line">·</span>
                      <ComplianceMark label="Bank" ok={p.hasBankDetails} />
                    </div>
                    {!p.hasBankDetails ? (
                      <Link
                        href="/admin/users"
                        className="mt-1 inline-block text-[0.65rem] uppercase tracking-[0.1em] text-muted underline decoration-line underline-offset-2 hover:decoration-ink hover:text-ink"
                      >
                        Add bank in Users
                      </Link>
                    ) : null}
                  </td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-ink">
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[p.status]}`}
                      />
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="py-3 pl-4">
                    <div className="flex justify-end">
                      <PayoutActions
                        payoutId={p.id}
                        status={p.status}
                        releaseReady={p.releaseReady}
                        releaseBlockedReason={p.releaseBlockedReason}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
