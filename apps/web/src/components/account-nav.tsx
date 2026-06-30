import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MENU_ITEM = "text-xs uppercase tracking-[0.15em]";

/** Consolidated account control for the public header. Signed-out users see a
 *  plain "Sign in" link; signed-in users get an initial avatar that opens a
 *  shadcn DropdownMenu holding the role-appropriate destinations + sign out. */
export async function AccountNav() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-ink"
      >
        Sign in
      </Link>
    );
  }

  const initial = (user.email?.[0] ?? "?").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="group inline-flex items-center gap-2 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-serif text-sm leading-none text-primary-foreground">
          {initial}
        </span>
        <span
          aria-hidden="true"
          className="text-[0.6rem] text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
        >
          ▾
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={10} className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span>Signed in</span>
          <span className="truncate font-sans text-xs normal-case tracking-normal text-ink">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {user.role === "staff" ? (
          <DropdownMenuItem asChild className={MENU_ITEM}>
            <Link href="/staff/registrations">Staff console</Link>
          </DropdownMenuItem>
        ) : null}
        {user.role === "consignor" ? (
          <DropdownMenuItem asChild className={MENU_ITEM}>
            <Link href="/account/verification">Verification</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild className={MENU_ITEM}>
          <Link href="/account/saved">Saved</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={MENU_ITEM}>
          <Link href="/invoices">Invoices</Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          asChild
          className="text-primary focus:bg-primary/10 focus:text-primary"
        >
          <SignOutButton className="w-full justify-start text-primary hover:text-primary" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
