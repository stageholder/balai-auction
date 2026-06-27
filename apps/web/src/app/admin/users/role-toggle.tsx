"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setRoleAction } from "./actions";

export function RoleToggle({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: "buyer" | "staff" | "consignor";
  disabled?: boolean;
}) {
  const router = useRouter();
  const next = role === "staff" ? "buyer" : "staff";
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={async () => {
        await setRoleAction(userId, next);
        router.refresh();
      }}
    >
      {role === "staff" ? "Revoke staff" : "Make staff"}
    </Button>
  );
}
