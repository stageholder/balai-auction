"use client";

import type { LotRecord } from "@auction/db";
import { Button } from "@/components/ui/button";

const FIELD =
  "mt-1 w-full border border-line bg-paper px-3 py-2 focus:border-ink focus:outline-none";
const LABEL = "block text-xs uppercase tracking-[0.15em] text-muted-foreground";

function toLocalInput(d: Date): string {
  return new Date(d).toISOString().slice(0, 16);
}

export function LotForm({
  lot,
  action,
  consignors,
}: {
  lot?: LotRecord;
  action: (formData: FormData) => void;
  consignors: { id: string; email: string }[];
}) {
  return (
    <form action={action} className="max-w-xl space-y-4">
      <div className="grid grid-cols-[120px_1fr] gap-4">
        <div>
          <label htmlFor="lotNumber" className={LABEL}>Lot #</label>
          <input id="lotNumber" name="lotNumber" type="number" min={1} required defaultValue={lot?.lotNumber ?? ""} className={FIELD} />
        </div>
        <div>
          <label htmlFor="title" className={LABEL}>Title</label>
          <input id="title" name="title" required defaultValue={lot?.title} className={FIELD} />
        </div>
      </div>
      <div>
        <label htmlFor="description" className={LABEL}>Description</label>
        <textarea id="description" name="description" rows={3} defaultValue={lot?.description ?? ""} className={FIELD} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="estimateLow" className={LABEL}>Est. low (Rp)</label>
          <input id="estimateLow" name="estimateLow" type="number" min={0} required defaultValue={lot?.estimateLow ?? ""} className={FIELD} />
        </div>
        <div>
          <label htmlFor="estimateHigh" className={LABEL}>Est. high (Rp)</label>
          <input id="estimateHigh" name="estimateHigh" type="number" min={0} required defaultValue={lot?.estimateHigh ?? ""} className={FIELD} />
        </div>
        <div>
          <label htmlFor="reserve" className={LABEL}>Reserve (Rp)</label>
          <input id="reserve" name="reserve" type="number" min={0} defaultValue={lot?.reserve ?? ""} className={FIELD} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="startingPrice" className={LABEL}>Starting price (Rp)</label>
          <input id="startingPrice" name="startingPrice" type="number" min={0} required defaultValue={lot?.startingPrice ?? ""} className={FIELD} />
        </div>
        <div>
          <label htmlFor="closesAt" className={LABEL}>Closes at</label>
          <input id="closesAt" name="closesAt" type="datetime-local" required defaultValue={lot ? toLocalInput(lot.closesAt) : ""} className={FIELD} />
        </div>
      </div>
      <div>
        <label htmlFor="consignorId" className={LABEL}>Consignor</label>
        <select
          id="consignorId"
          name="consignorId"
          defaultValue={lot?.consignorId ?? ""}
          className={FIELD}
        >
          <option value="">— None —</option>
          {consignors.map((c) => (
            <option key={c.id} value={c.id}>{c.email}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="image" className={LABEL}>Image (png/jpeg/webp)</label>
        <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full text-sm" />
      </div>
      <Button type="submit">{lot ? "Save lot" : "Add lot"}</Button>
    </form>
  );
}
