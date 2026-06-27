"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className="text-xs uppercase tracking-[0.15em] text-muted hover:text-ink"
    >
      Sign out
    </button>
  );
}
