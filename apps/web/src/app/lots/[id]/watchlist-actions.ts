"use server";

import { prisma, toggleWatchlist } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Toggle the current lot on the signed-in user's watchlist.
 *
 *  Security: the userId is ALWAYS the SESSION user's id (`requireUser()`),
 *  never a client-supplied value — there is no userId parameter, so a forged
 *  identity is impossible. `requireUser()` redirects anonymous callers to
 *  /sign-in before any write occurs. */
export async function toggleWatchlistAction(
  lotId: string
): Promise<{ watched: boolean }> {
  const user = await requireUser();
  return toggleWatchlist(prisma, user.id, lotId);
}
