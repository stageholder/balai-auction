"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      toast.success("Registration submitted — we'll review it shortly.");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="legalName">Legal name</Label>
        <Input id="legalName" name="legalName" required autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          placeholder="+62 …"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Submitting…" : "Register to bid"}
      </Button>
    </form>
  );
}
