"use client";

import type { SaleRecord } from "@auction/db";
import { DEPARTMENTS, DEFAULT_SELLER_COMMISSION_PCT } from "@auction/core";
import { Button } from "@/components/ui/button";

const FIELD =
  "mt-1 w-full border border-line bg-paper px-3 py-2 focus:border-ink focus:outline-none";
const LABEL = "block text-xs uppercase tracking-[0.15em] text-muted";

function toLocalInput(d: Date): string {
  // yyyy-MM-ddThh:mm for <input type="datetime-local">
  return new Date(d).toISOString().slice(0, 16);
}

export function SaleForm({
  sale,
  action,
}: {
  sale?: SaleRecord;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="max-w-xl space-y-4">
      <div>
        <label htmlFor="title" className={LABEL}>Title</label>
        <input id="title" name="title" required defaultValue={sale?.title} className={FIELD} />
      </div>
      <div>
        <label htmlFor="description" className={LABEL}>Description</label>
        <textarea id="description" name="description" rows={3} defaultValue={sale?.description ?? ""} className={FIELD} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="startsAt" className={LABEL}>Starts at</label>
          <input id="startsAt" name="startsAt" type="datetime-local" required defaultValue={sale ? toLocalInput(sale.startsAt) : ""} className={FIELD} />
        </div>
        <div>
          <label htmlFor="endsAt" className={LABEL}>Ends at</label>
          <input id="endsAt" name="endsAt" type="datetime-local" required defaultValue={sale ? toLocalInput(sale.endsAt) : ""} className={FIELD} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="buyersPremiumPct" className={LABEL}>Buyer&apos;s premium %</label>
          <input id="buyersPremiumPct" name="buyersPremiumPct" type="number" min={0} required defaultValue={sale?.buyersPremiumPct ?? 20} className={FIELD} />
        </div>
        <div>
          <label htmlFor="taxPct" className={LABEL}>Tax (PPN) %</label>
          <input id="taxPct" name="taxPct" type="number" min={0} required defaultValue={sale?.taxPct ?? 11} className={FIELD} />
        </div>
        <div>
          <label htmlFor="sellerCommissionPct" className={LABEL}>
            Seller commission (%)
          </label>
          <input
            id="sellerCommissionPct"
            name="sellerCommissionPct"
            type="number"
            min={0}
            max={100}
            required
            defaultValue={sale?.sellerCommissionPct ?? DEFAULT_SELLER_COMMISSION_PCT}
            className={FIELD}
          />
        </div>
      </div>
      <div>
        <label htmlFor="category" className={LABEL}>Department</label>
        <select
          id="category"
          name="category"
          defaultValue={sale?.category ?? ""}
          className={FIELD}
        >
          <option value="">— None —</option>
          {DEPARTMENTS.map((d) => (
            <option key={d.slug} value={d.slug}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="mode" className={LABEL}>Mode</label>
          <select
            id="mode"
            name="mode"
            defaultValue={sale?.mode ?? "timed"}
            className={FIELD}
          >
            <option value="timed">Timed</option>
            <option value="live">Live</option>
          </select>
        </div>
        <div>
          <label htmlFor="liveLotSeconds" className={LABEL}>
            Live lot timer (seconds)
          </label>
          <input
            id="liveLotSeconds"
            name="liveLotSeconds"
            type="number"
            min={5}
            defaultValue={sale?.liveLotSeconds ?? 45}
            className={FIELD}
          />
        </div>
      </div>
      <div>
        <label htmlFor="incrementTable" className={LABEL}>Increment table (JSON)</label>
        <textarea
          id="incrementTable"
          name="incrementTable"
          rows={3}
          defaultValue={JSON.stringify(
            sale?.incrementTable ?? [
              { upTo: 1_000_000, step: 50_000 },
              { upTo: 5_000_000, step: 100_000 },
              { upTo: null, step: 250_000 },
            ]
          )}
          className={`${FIELD} font-mono text-xs`}
        />
      </div>
      <Button type="submit">{sale ? "Save changes" : "Create sale"}</Button>
    </form>
  );
}
