"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { registerToBid } from "./actions";

export function RegisterToBidForm({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await registerToBid(saleId, new FormData(e.currentTarget));
      if (!result.ok) {
        setError(result.error ?? "Registration failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="legalName" className="block text-xs uppercase tracking-[0.15em] text-muted">
          Legal name
        </label>
        <input
          id="legalName"
          name="legalName"
          required
          className="mt-1 w-full border border-line bg-paper px-3 py-2 focus:border-ink focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-xs uppercase tracking-[0.15em] text-muted">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          className="mt-1 w-full border border-line bg-paper px-3 py-2 focus:border-ink focus:outline-none"
        />
      </div>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <Button type="submit" variant="accent" disabled={pending}>
        Register to bid
      </Button>
    </form>
  );
}
