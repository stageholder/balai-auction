"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toggleSaleFeaturedAction } from "./actions";

export function FeaturedToggle({
  saleId,
  featured,
  title,
}: {
  saleId: string;
  featured: boolean;
  title: string;
}) {
  const [on, setOn] = useState(featured);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      title="Shown in the homepage hero"
      onClick={() => {
        const next = !on;
        setOn(next);
        startTransition(async () => {
          try {
            await toggleSaleFeaturedAction(saleId, next);
            toast.success(
              next
                ? `"${title}" added to the homepage hero`
                : `"${title}" removed from the homepage hero`
            );
          } catch {
            setOn(!next);
            toast.error("Could not update featured state");
          }
        });
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] transition-colors disabled:opacity-50",
        on
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-line text-muted-foreground hover:border-ink hover:text-ink"
      )}
    >
      <Star
        className={cn("h-3.5 w-3.5", on && "fill-primary")}
        aria-hidden="true"
      />
      {on ? "Featured" : "Feature"}
    </button>
  );
}
