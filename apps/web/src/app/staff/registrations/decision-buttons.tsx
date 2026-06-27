"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveRegistration, rejectRegistration } from "./actions";

export function DecisionButtons({ id }: { id: string }) {
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="solid"
        onClick={async () => {
          await approveRegistration(id);
          router.refresh();
        }}
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          await rejectRegistration(id);
          router.refresh();
        }}
      >
        Reject
      </Button>
    </div>
  );
}
