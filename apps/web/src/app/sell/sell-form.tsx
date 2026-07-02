"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { DEPARTMENTS } from "@auction/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilePicker } from "@/components/media/file-picker";
import {
  submitConsignmentRequestAction,
  type ConsignmentActionResult,
} from "./actions";

const OPTIONAL =
  "ml-2 text-[10px] font-normal normal-case tracking-[0.1em] text-muted-foreground/70";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="accent"
      size="lg"
      disabled={pending}
      className="w-full sm:w-auto"
    >
      {pending ? "Sending…" : "Submit for appraisal"}
    </Button>
  );
}

/** Warm confirmation shown in place of the form once a request is accepted. */
function Confirmation() {
  return (
    <div className="border border-line bg-card px-8 py-14 text-center shadow-sm">
      <span aria-hidden className="mx-auto block h-px w-12 bg-primary" />
      <h2 className="mt-6 font-serif text-4xl font-light leading-tight text-ink">
        Thank you — it's with our specialists.
      </h2>
      <p className="mx-auto mt-4 max-w-md font-sans text-sm leading-relaxed text-muted-foreground">
        We've received the details of your piece. A specialist from the relevant
        department will review it and write back with our thoughts and a likely
        estimate. No obligation, and nothing to pay.
      </p>
    </div>
  );
}

export function SellForm() {
  const [result, formAction] = useActionState<
    ConsignmentActionResult | null,
    FormData
  >(submitConsignmentRequestAction, null);

  if (result?.ok) {
    return <Confirmation />;
  }

  return (
    <form action={formAction} className="space-y-10">
      {/* ── You ── */}
      <fieldset className="space-y-5">
        <legend className="mb-1 font-serif text-2xl font-light text-ink">
          About you
        </legend>
        <p className="-mt-1 text-sm text-muted-foreground">
          So a specialist can write back with our thoughts.
        </p>

        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            placeholder="First and last name"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              maxLength={200}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone<span className={OPTIONAL}>Optional</span>
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              maxLength={40}
              autoComplete="tel"
              placeholder="For time-sensitive lots"
            />
          </div>
        </div>
      </fieldset>

      <div className="border-t border-line" />

      {/* ── The piece ── */}
      <fieldset className="space-y-5">
        <legend className="mb-1 font-serif text-2xl font-light text-ink">
          Your item
        </legend>
        <p className="-mt-1 text-sm text-muted-foreground">
          Tell us what you have. The more you share, the sharper our estimate.
        </p>

        <div className="grid gap-5 sm:grid-cols-[1fr_minmax(0,14rem)]">
          <div className="space-y-2">
            <Label htmlFor="itemTitle">Item title</Label>
            <Input
              id="itemTitle"
              name="itemTitle"
              required
              maxLength={200}
              placeholder="e.g. Rolex Submariner, ref. 1680"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">
              Department<span className={OPTIONAL}>Optional</span>
            </Label>
            {/* Radix Select posts `category` via a hidden field; no selection
                submits empty, which the server maps to null — behaviour kept. */}
            <Select name="category">
              <SelectTrigger id="category">
                <SelectValue placeholder="Not sure — we'll route it" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d.slug} value={d.slug}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="itemDescription">Description</Label>
          <Textarea
            id="itemDescription"
            name="itemDescription"
            required
            maxLength={4000}
            rows={6}
            placeholder="Maker, date, dimensions, condition, and how it came to you — provenance helps."
            className="resize-y leading-relaxed"
          />
        </div>

        <div className="space-y-2 sm:max-w-xs">
          <Label htmlFor="sellerEstimate">
            Your estimate<span className={OPTIONAL}>Optional, IDR</span>
          </Label>
          <Input
            id="sellerEstimate"
            name="sellerEstimate"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="What you hope it's worth"
            className="tnum"
          />
        </div>

        <FilePicker
          name="photos"
          label="Photographs"
          accept="image/png,image/jpeg,image/webp"
          maxFiles={8}
          hint="Up to 8 images — front, back, signature, marks and any damage. JPEG, PNG or WebP, 10MB each."
        />
      </fieldset>

      {/* Honeypot: hidden from people, tempting to bots. A filled value is
          silently discarded server-side. Not exposed to assistive tech. */}
      <div aria-hidden className="hidden">
        <label htmlFor="company">Company</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {/* ── Feedback + action ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SubmitButton />
        {result && !result.ok ? (
          <p role="alert" className="text-sm text-primary">
            {result.error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No fees to enquire. We reply to every submission.
          </p>
        )}
      </div>
    </form>
  );
}
