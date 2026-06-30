"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@auction/db";
import { cn } from "@/lib/utils";
import { setUserRole } from "./actions";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "buyer", label: "Buyer" },
  { value: "consignor", label: "Consignor" },
  { value: "staff", label: "Staff" },
];

export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: UserRole;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Role for this user</span>
      <select
        value={role}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value as UserRole;
          if (next === role) return;
          startTransition(async () => {
            await setUserRole(userId, next);
            router.refresh();
          });
        }}
        className={cn(
          "h-9 appearance-none border border-line bg-paper py-0 pl-4 pr-9 text-xs font-medium uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40",
          pending && "opacity-60"
        )}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 8"
        fill="none"
        strokeWidth={1.5}
        className="pointer-events-none absolute right-3 h-2 w-3 stroke-muted-foreground"
      >
        <path d="M1 1.5 6 6.5 11 1.5" strokeLinecap="square" />
      </svg>
    </label>
  );
}
