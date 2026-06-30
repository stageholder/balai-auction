"use client";

import { useState } from "react";
import type { SaleRecord } from "@auction/db";
import { DEPARTMENTS, DEFAULT_SELLER_COMMISSION_PCT } from "@auction/core";
import { cn } from "@/lib/utils";
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
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function SaleForm({
  sale,
  action,
}: {
  sale?: SaleRecord;
  action: (formData: FormData) => void;
}) {
  const [mode, setMode] = useState<"timed" | "live">(sale?.mode ?? "timed");

  return (
    <form action={action} className="space-y-6">
      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            The headline and description shown to bidders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Title" htmlFor="title">
            <Input
              id="title"
              name="title"
              required
              defaultValue={sale?.title}
              placeholder="e.g. Modern & Contemporary Art"
            />
          </Field>
          <Field label="Description" htmlFor="description">
            <Textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={sale?.description ?? ""}
              placeholder="Optional summary for the sale landing page."
            />
          </Field>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>
            When bidding opens and when the sale closes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts at" htmlFor="startsAt">
            <Input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={sale ? toLocalInput(sale.startsAt) : ""}
            />
          </Field>
          <Field label="Ends at" htmlFor="endsAt">
            <Input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={sale ? toLocalInput(sale.endsAt) : ""}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Format */}
      <Card>
        <CardHeader>
          <CardTitle>Format</CardTitle>
          <CardDescription>
            Timed sales close on a deadline; live sales advance lot by lot.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Mode" htmlFor="mode">
            <div className="relative">
              <select
                id="mode"
                name="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as "timed" | "live")}
                className={NATIVE_SELECT}
              >
                <option value="timed">Timed</option>
                <option value="live">Live</option>
              </select>
              <SelectChevron />
            </div>
          </Field>
          {mode === "live" ? (
            <Field
              label="Live lot timer (seconds)"
              htmlFor="liveLotSeconds"
              hint="Countdown each lot gets on the live floor."
            >
              <Input
                id="liveLotSeconds"
                name="liveLotSeconds"
                type="number"
                min={5}
                defaultValue={sale?.liveLotSeconds ?? 45}
              />
            </Field>
          ) : (
            // Keep posting a value even when hidden, so the action stays happy.
            <input
              type="hidden"
              name="liveLotSeconds"
              value={sale?.liveLotSeconds ?? 45}
            />
          )}
        </CardContent>
      </Card>

      {/* Department */}
      <Card>
        <CardHeader>
          <CardTitle>Department</CardTitle>
          <CardDescription>
            Files the sale under a collecting category.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Department" htmlFor="category">
            <div className="relative">
              <select
                id="category"
                name="category"
                defaultValue={sale?.category ?? ""}
                className={NATIVE_SELECT}
              >
                <option value="">None</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.label}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </Field>
        </CardContent>
      </Card>

      {/* Fees */}
      <Card>
        <CardHeader>
          <CardTitle>Fees</CardTitle>
          <CardDescription>
            Premiums and commissions applied at settlement.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Buyer's premium %" htmlFor="buyersPremiumPct">
            <Input
              id="buyersPremiumPct"
              name="buyersPremiumPct"
              type="number"
              min={0}
              required
              defaultValue={sale?.buyersPremiumPct ?? 20}
            />
          </Field>
          <Field label="Tax (PPN) %" htmlFor="taxPct">
            <Input
              id="taxPct"
              name="taxPct"
              type="number"
              min={0}
              required
              defaultValue={sale?.taxPct ?? 11}
            />
          </Field>
          <Field label="Seller commission %" htmlFor="sellerCommissionPct">
            <Input
              id="sellerCommissionPct"
              name="sellerCommissionPct"
              type="number"
              min={0}
              max={100}
              required
              defaultValue={
                sale?.sellerCommissionPct ?? DEFAULT_SELLER_COMMISSION_PCT
              }
            />
          </Field>
        </CardContent>
      </Card>

      <div className={cn("flex items-center gap-3")}>
        <Button type="submit" variant="accent">
          {sale ? "Save changes" : "Create sale"}
        </Button>
      </div>
    </form>
  );
}
