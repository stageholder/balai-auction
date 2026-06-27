import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

export async function AccountNav() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="text-xs uppercase tracking-[0.15em] text-muted hover:text-ink"
      >
        Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-4">
      {user.role === "staff" ? (
        <Link
          href="/staff/registrations"
          className="text-xs uppercase tracking-[0.15em] text-muted hover:text-ink"
        >
          Staff
        </Link>
      ) : null}
      <span className="text-xs text-muted">{user.email}</span>
      <SignOutButton />
    </div>
  );
}
