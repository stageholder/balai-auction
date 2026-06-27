import { prisma, listInvoicesForBuyer } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatRupiah } from "@/lib/format";
import { PayButton } from "./pay-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  refunded: "Refunded",
};

export default async function InvoicesPage() {
  const user = await requireUser();
  const invoices = await listInvoicesForBuyer(prisma, user.id);

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-10 border-b border-line pb-6">
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted">
          Account
        </p>
        <h1 className="font-serif text-4xl font-light text-ink">
          Your invoices
        </h1>
      </div>

      {invoices.length === 0 ? (
        <p className="py-16 text-center text-xs uppercase tracking-[0.15em] text-muted">
          You have no invoices yet.
        </p>
      ) : (
        <div>
          {/* ── Ledger column headings ── */}
          <div className="mb-0 grid grid-cols-[1fr_auto_auto_auto] items-end gap-x-8 border-b border-ink pb-3">
            <span className="text-xs uppercase tracking-[0.15em] text-muted">
              Lot
            </span>
            <span className="text-right text-xs uppercase tracking-[0.15em] text-muted">
              Amount
            </span>
            <span className="text-right text-xs uppercase tracking-[0.15em] text-muted">
              Status
            </span>
            {/* spacer for action column */}
            <span className="w-24" />
          </div>

          {/* ── Rows ── */}
          <ul className="divide-y divide-line">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-8 py-5"
              >
                {/* Lot title */}
                <span className="font-serif text-base text-ink">
                  {inv.lotTitle}
                </span>

                {/* Amount — tabular numerals, right-aligned */}
                <span className="tnum text-right text-sm text-ink">
                  {formatRupiah(inv.total)}
                </span>

                {/* Status */}
                <InvoiceStatus status={inv.status} />

                {/* Pay action */}
                <div className="flex w-24 justify-end">
                  {inv.status === "pending" ? (
                    <PayButton invoiceId={inv.id} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {/* ── Closing rule ── */}
          <div className="border-t border-ink" />
        </div>
      )}
    </div>
  );
}

function InvoiceStatus({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;

  if (status === "pending") {
    return (
      <span className="flex items-center justify-end gap-1.5 text-xs uppercase tracking-[0.1em] text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        {label}
      </span>
    );
  }

  if (status === "paid") {
    return (
      <span className="block text-right text-xs uppercase tracking-[0.1em] text-ink opacity-60">
        {label}
      </span>
    );
  }

  return (
    <span className="block text-right text-xs uppercase tracking-[0.1em] text-muted">
      {label}
    </span>
  );
}
