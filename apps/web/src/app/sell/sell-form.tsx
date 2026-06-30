"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { DEPARTMENTS } from "@auction/core";
import { Button } from "@/components/ui/button";
import {
  submitConsignmentRequestAction,
  type ConsignmentActionResult,
} from "./actions";

const FIELD =
  "mt-2 w-full border border-line bg-paper px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-muted-foreground/60 focus:border-ink focus:outline-none";
const LABEL = "block text-xs uppercase tracking-[0.15em] text-muted-foreground";
const OPTIONAL = "ml-2 text-[10px] tracking-[0.1em] text-muted-foreground/70";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Sending…" : "Submit for appraisal"}
    </Button>
  );
}

/** Warm confirmation shown in place of the form once a request is accepted. */
function Confirmation() {
  return (
    <div className="border border-line bg-paper px-8 py-14 text-center">
      <span
        aria-hidden
        className="mx-auto block h-px w-12 bg-primary"
      />
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

        <div>
          <label htmlFor="name" className={LABEL}>
            Your name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            placeholder="First and last name"
            className={FIELD}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className={LABEL}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              maxLength={200}
              autoComplete="email"
              placeholder="you@example.com"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="phone" className={LABEL}>
              Phone<span className={OPTIONAL}>Optional</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              maxLength={40}
              autoComplete="tel"
              placeholder="For time-sensitive lots"
              className={FIELD}
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
          <div>
            <label htmlFor="itemTitle" className={LABEL}>
              Item title
            </label>
            <input
              id="itemTitle"
              name="itemTitle"
              required
              maxLength={200}
              placeholder="e.g. Rolex Submariner, ref. 1680"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="category" className={LABEL}>
              Department<span className={OPTIONAL}>Optional</span>
            </label>
            <select
              id="category"
              name="category"
              defaultValue=""
              className={FIELD}
            >
              <option value="">— Not sure —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="itemDescription" className={LABEL}>
            Description
          </label>
          <textarea
            id="itemDescription"
            name="itemDescription"
            required
            maxLength={4000}
            rows={6}
            placeholder="Maker, date, dimensions, condition, and how it came to you — provenance helps."
            className={`${FIELD} resize-y leading-relaxed`}
          />
        </div>

        <div className="sm:max-w-xs">
          <label htmlFor="sellerEstimate" className={LABEL}>
            Your estimate<span className={OPTIONAL}>Optional, IDR</span>
          </label>
          <input
            id="sellerEstimate"
            name="sellerEstimate"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="What you hope it's worth"
            className={`${FIELD} tnum`}
          />
        </div>
      </fieldset>

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
