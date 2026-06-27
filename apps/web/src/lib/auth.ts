import "server-only";
import { notFound, redirect } from "next/navigation";
import type { UserRecord } from "@auction/db";
import { prisma, upsertUserById } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

/** The domain user for the current Supabase session, or null. Mirrors the
 *  Supabase identity into a domain User row (idempotent). */
export async function getCurrentUser(): Promise<UserRecord | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;
  return upsertUserById(prisma, { id: user.id, email: user.email });
}

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
