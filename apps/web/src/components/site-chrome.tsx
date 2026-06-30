"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/** Renders the public editorial chrome (header / narrow main / footer) on
 *  every route EXCEPT the operator console (/admin, /staff), which ships its
 *  own full-width dashboard shell. `accountSlot` is the server-rendered
 *  <AccountNav/> threaded through from the root layout. */
export function SiteChrome({
  children,
  accountSlot,
}: {
  children: React.ReactNode;
  accountSlot: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const isConsole =
    pathname.startsWith("/admin") || pathname.startsWith("/staff");

  if (isConsole) {
    // The console owns the full viewport — no public header/footer, no narrow column.
    return <>{children}</>;
  }

  return (
    <>
      <SiteHeader accountSlot={accountSlot} />
      <main className="mx-auto max-w-6xl px-6 py-12">{children}</main>
      <SiteFooter />
    </>
  );
}
