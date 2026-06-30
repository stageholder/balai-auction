"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className={cn(
        "text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-ink",
        className
      )}
    >
      Sign out
    </button>
  );
}
