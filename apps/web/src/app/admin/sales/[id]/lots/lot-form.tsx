"use client";

import { useState } from "react";
import Image from "next/image";
import type { LotRecord } from "@auction/db";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const NATIVE_SELECT =
  "flex h-11 w-full appearance-none rounded-sm border border-input bg-card px-3 py-2 text-sm text-ink transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function toLocalInput(d: Date): string {
  // yyyy-MM-ddThh:mm for <input type="datetime-local">
  return new Date(d).toISOString().slice(0, 16);
}

function SelectChevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 8"
      fill="none"
      strokeWidth={1.5}
      className="pointer-events-none absolute right-3 top-1/2 h-2 w-3 -translate-y-1/2 stroke-muted-foreground"
    >
      <path d="M1 1.5 6 6.5 11 1.5" strokeLinecap="square" />
    </svg>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
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
  const [preview, setPreview] = useState<string | null>(lot?.images[0] ?? null);

  return (
    <form action={action} className="space-y-6">
      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle>Lot details</CardTitle>
          <CardDescription>
            The catalogue number, title, and description shown to bidders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field label="Lot #" htmlFor="lotNumber">
              <Input
                id="lotNumber"
                name="lotNumber"
                type="number"
                min={1}
                required
                defaultValue={lot?.lotNumber ?? ""}
                className="tnum"
              />
            </Field>
            <Field label="Title" htmlFor="title">
              <Input
                id="title"
                name="title"
                required
                defaultValue={lot?.title}
                placeholder="e.g. A pair of famille rose vases"
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="description">
            <Textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={lot?.description ?? ""}
              placeholder="Provenance, condition, dimensions…"
            />
          </Field>
        </CardContent>
      </Card>

      {/* Valuation */}
      <Card>
        <CardHeader>
          <CardTitle>Valuation</CardTitle>
          <CardDescription>
            Pre-sale estimate and the confidential reserve (all in Rupiah).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Estimate low" htmlFor="estimateLow">
            <Input
              id="estimateLow"
              name="estimateLow"
              type="number"
              min={0}
              required
              defaultValue={lot?.estimateLow ?? ""}
              className="tnum"
            />
          </Field>
          <Field label="Estimate high" htmlFor="estimateHigh">
            <Input
              id="estimateHigh"
              name="estimateHigh"
              type="number"
              min={0}
              required
              defaultValue={lot?.estimateHigh ?? ""}
              className="tnum"
            />
          </Field>
          <Field
            label="Reserve"
            htmlFor="reserve"
            hint="Leave blank for no reserve."
          >
            <Input
              id="reserve"
              name="reserve"
              type="number"
              min={0}
              defaultValue={lot?.reserve ?? ""}
              className="tnum"
            />
          </Field>
        </CardContent>
      </Card>

      {/* Bidding */}
      <Card>
        <CardHeader>
          <CardTitle>Bidding</CardTitle>
          <CardDescription>
            Where the lot opens and when bidding closes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Starting price" htmlFor="startingPrice">
            <Input
              id="startingPrice"
              name="startingPrice"
              type="number"
              min={0}
              required
              defaultValue={lot?.startingPrice ?? ""}
              className="tnum"
            />
          </Field>
          <Field label="Closes at" htmlFor="closesAt">
            <Input
              id="closesAt"
              name="closesAt"
              type="datetime-local"
              required
              defaultValue={lot ? toLocalInput(lot.closesAt) : ""}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Consignment & media */}
      <Card>
        <CardHeader>
          <CardTitle>Consignment &amp; media</CardTitle>
          <CardDescription>
            Who consigned the lot, and its lead catalogue image.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Consignor" htmlFor="consignorId">
            <div className="relative">
              <select
                id="consignorId"
                name="consignorId"
                defaultValue={lot?.consignorId ?? ""}
                className={NATIVE_SELECT}
              >
                <option value="">None</option>
                {consignors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.email}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </Field>

          <Field
            label="Image"
            htmlFor="image"
            hint="PNG, JPEG or WebP. Replaces the lead image."
          >
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-sm border border-line bg-line/40">
                {preview ? (
                  <Image
                    src={preview}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <ImagePlus className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <Input
                id="image"
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="cursor-pointer py-2.5 file:mr-3 file:cursor-pointer file:rounded-sm file:border file:border-line file:bg-paper file:px-3 file:py-1 file:text-xs file:uppercase file:tracking-[0.12em] file:text-ink"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPreview(URL.createObjectURL(file));
                }}
              />
            </div>
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="accent">
          {lot ? "Save changes" : "Add lot"}
        </Button>
      </div>
    </form>
  );
}
