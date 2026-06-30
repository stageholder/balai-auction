import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

export async function AccountNav() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-ink"
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
          className="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-ink"
        >
          Staff
        </Link>
      ) : null}
      {user.role === "consignor" ? (
        <Link
          href="/account/verification"
          className="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-ink"
        >
          Verification
        </Link>
      ) : null}
      <Link
        href="/account/saved"
        className="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-ink"
      >
        Saved
      </Link>
      <Link
        href="/invoices"
        className="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-ink"
      >
        Invoices
      </Link>
      <span className="text-xs text-muted-foreground">{user.email}</span>
      <SignOutButton />
    </div>
  );
}
