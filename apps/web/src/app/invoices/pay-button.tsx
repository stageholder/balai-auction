"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startInvoicePayment } from "./actions";

export function PayButton({ invoiceId }: { invoiceId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPay() {
    setError(null);
    setPending(true);
    try {
      const result = await startInvoicePayment(invoiceId);
      if (result.ok && result.url) {
        window.location.href = result.url;
        return;
      }
      setError(result.error ?? "Could not start payment.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="accent" onClick={onPay} disabled={pending}>
        Pay now
      </Button>
      {error ? <span className="text-xs text-primary">{error}</span> : null}
    </div>
  );
}
