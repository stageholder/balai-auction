"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { submitConsignorKycAction, type KycActionResult } from "./actions";

const FIELD =
  "mt-2 w-full border border-line bg-paper px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-muted-foreground/60 focus:border-ink focus:outline-none";
const LABEL = "block text-xs uppercase tracking-[0.15em] text-muted-foreground";

const ID_TYPE_OPTIONS = [
  { value: "passport", label: "Passport" },
  { value: "national_id", label: "National ID (KTP)" },
  { value: "driver_license", label: "Driver's licence" },
] as const;

export interface VerificationDefaults {
  legalName: string;
  idType: string;
  idNumber: string;
  bankCode: string;
  accountNumber: string;
  accountHolder: string;
}

function SubmitButton({ rejected }: { rejected: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending
        ? "Submitting…"
        : rejected
          ? "Resubmit for review"
          : "Submit for review"}
    </Button>
  );
}

export function VerificationForm({
  defaults,
  rejected,
}: {
  defaults: VerificationDefaults;
  rejected: boolean;
}) {
  const [result, formAction] = useActionState<KycActionResult | null, FormData>(
    submitConsignorKycAction,
    null
  );

  return (
    <form action={formAction} className="space-y-10">
      {/* ── Identity ── */}
      <fieldset className="space-y-5">
        <legend className="mb-1 font-serif text-2xl font-light text-ink">
          Your identity
        </legend>
        <p className="-mt-1 text-sm text-muted-foreground">
          Enter your details exactly as they appear on your identity document.
        </p>

        <div>
          <label htmlFor="legalName" className={LABEL}>
            Full legal name
          </label>
          <input
            id="legalName"
            name="legalName"
            required
            autoComplete="name"
            defaultValue={defaults.legalName}
            placeholder="As printed on your document"
            className={FIELD}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <div>
            <label htmlFor="idType" className={LABEL}>
              Document type
            </label>
            <select
              id="idType"
              name="idType"
              required
              defaultValue={defaults.idType || ""}
              className={FIELD}
            >
              <option value="" disabled>
                Select a type
              </option>
              {ID_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="idNumber" className={LABEL}>
              Document number
            </label>
            <input
              id="idNumber"
              name="idNumber"
              required
              defaultValue={defaults.idNumber}
              placeholder="Document number"
              className={FIELD}
            />
          </div>
        </div>
      </fieldset>

      <div className="border-t border-line" />

      {/* ── Payout ── */}
      <fieldset className="space-y-5">
        <legend className="mb-1 font-serif text-2xl font-light text-ink">
          Payout account
        </legend>
        <p className="-mt-1 text-sm text-muted-foreground">
          Where we send the proceeds once your lots are sold and cleared.
        </p>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,12rem)_1fr]">
          <div>
            <label htmlFor="bankCode" className={LABEL}>
              Bank
            </label>
            <input
              id="bankCode"
              name="bankCode"
              required
              defaultValue={defaults.bankCode}
              placeholder="e.g. BCA"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="accountNumber" className={LABEL}>
              Account number
            </label>
            <input
              id="accountNumber"
              name="accountNumber"
              required
              inputMode="numeric"
              defaultValue={defaults.accountNumber}
              placeholder="Account number"
              className={`${FIELD} tnum`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="accountHolder" className={LABEL}>
            Account holder
          </label>
          <input
            id="accountHolder"
            name="accountHolder"
            required
            defaultValue={defaults.accountHolder}
            placeholder="Name on the bank account"
            className={FIELD}
          />
        </div>
      </fieldset>

      {/* ── Feedback + action ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SubmitButton rejected={rejected} />
        {result ? (
          result.ok ? (
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-ink" aria-hidden />
              {result.message}
            </p>
          ) : (
            <p role="alert" className="text-sm text-primary">
              {result.error}
            </p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">
            Your details are used only for compliance and payout.
          </p>
        )}
      </div>
    </form>
  );
}
