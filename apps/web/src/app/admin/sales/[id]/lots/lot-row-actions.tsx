"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, ExternalLink, Gavel } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRupiah } from "@/lib/format";
import { closeLotNowAction } from "./actions";

export function LotRowActions({
  saleId,
  lotId,
  isLive,
}: {
  saleId: string;
  lotId: string;
  isLive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function closeNow() {
    startTransition(async () => {
      const result = await closeLotNowAction(saleId, lotId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.outcome === "sold") {
        toast.success(`Hammered — sold at ${formatRupiah(result.hammerPrice)}`);
      } else if (result.outcome === "unsold") {
        toast("Closed — unsold (reserve not met).");
      } else {
        toast("Lot already closed.");
      }
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Lot actions"
          disabled={pending}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Manage lot</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/admin/sales/${saleId}/lots/${lotId}`}>
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/lots/${lotId}`} target="_blank">
            <ExternalLink className="h-4 w-4" />
            View
          </Link>
        </DropdownMenuItem>
        {isLive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                closeNow();
              }}
              disabled={pending}
              className="text-primary focus:text-primary"
            >
              <Gavel className="h-4 w-4" />
              Close now
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
