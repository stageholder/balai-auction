"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveRegistration, rejectRegistration } from "./actions";

export function DecisionButtons({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>, msg: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(msg);
        router.refresh();
      } catch {
        toast.error("Could not update registration");
      }
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="solid"
        disabled={pending}
        onClick={() => run(() => approveRegistration(id), "Registration approved")}
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => rejectRegistration(id), "Registration rejected")}
      >
        Reject
      </Button>
    </div>
  );
}
