"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setConsignorPayoutAccountAction } from "./actions";

const FIELDS = [
  { key: "bankCode", label: "Bank code", placeholder: "e.g. BCA" },
  { key: "accountNumber", label: "Account number", placeholder: "1234567890" },
  { key: "accountHolder", label: "Account holder", placeholder: "Legal name" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

export function PayoutAccountForm({
  userId,
  bankCode,
  accountNumber,
  accountHolder,
}: {
  userId: string;
  bankCode: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const [values, setValues] = useState<Record<FieldKey, string>>({
    bankCode: bankCode ?? "",
    accountNumber: accountNumber ?? "",
    accountHolder: accountHolder ?? "",
  });

  const filled =
    values.bankCode.trim() &&
    values.accountNumber.trim() &&
    values.accountHolder.trim();

  return (
    <form
      className="mt-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!filled) return;
        setDone(false);
        setError(false);
        startTransition(async () => {
          try {
            await setConsignorPayoutAccountAction(userId, {
              bankCode: values.bankCode.trim(),
              accountNumber: values.accountNumber.trim(),
              accountHolder: values.accountHolder.trim(),
            });
            setDone(true);
            router.refresh();
          } catch {
            // Surface the failure so staff don't believe a payout account was
            // saved when it wasn't (a silent miss would break a later release).
            setError(true);
          }
        });
      }}
    >
      <p className="mb-2 text-[0.65rem] uppercase tracking-[0.18em] text-muted">
        Payout account
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="sr-only">{f.label}</span>
            <input
              type="text"
              value={values[f.key]}
              placeholder={f.placeholder}
              disabled={pending}
              onChange={(e) => {
                setDone(false);
                setError(false);
                setValues((v) => ({ ...v, [f.key]: e.target.value }));
              }}
              className="h-9 w-full border border-line bg-paper px-3 text-sm text-ink transition-colors placeholder:text-muted/60 hover:border-ink focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink disabled:opacity-40"
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !filled}
          className={cn(
            "h-8 border border-ink bg-ink px-4 text-xs font-medium uppercase tracking-[0.12em] text-paper transition-colors hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40",
            pending && "opacity-60"
          )}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {done && !pending ? (
          <span className="text-xs uppercase tracking-[0.12em] text-muted">
            Saved
          </span>
        ) : null}
        {error && !pending ? (
          <span className="text-xs uppercase tracking-[0.12em] text-accent">
            Save failed — try again
          </span>
        ) : null}
      </div>
    </form>
  );
}
