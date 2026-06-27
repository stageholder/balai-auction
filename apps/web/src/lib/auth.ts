import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { UserRecord } from "@auction/db";
import { prisma, getUser, upsertUserById } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

/** The domain user for the current Supabase session, or null. Read-first:
 *  only writes when the row is missing or the email has changed.
 *  Memoized per request via React cache so every layout/page share one call. */
export const getCurrentUser = cache(async (): Promise<UserRecord | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;
  const existing = await getUser(prisma, user.id);
  if (existing && existing.email === user.email) return existing;
  return upsertUserById(prisma, { id: user.id, email: user.email });
});

export async function requireUser(): Promise<UserRecord> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requireStaff(): Promise<UserRecord> {
  const user = await requireUser();
  if (user.role !== "staff") notFound();
  return user;
}
