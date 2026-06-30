"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Gavel,
  Users,
  Banknote,
  ClipboardCheck,
  ShieldCheck,
  Inbox,
  ArrowUpRight,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SignOutButton } from "@/components/auth/sign-out-button";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavSection = { label: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    label: "Operations",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/sales", label: "Sales", icon: Gavel },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/payouts", label: "Payouts", icon: Banknote },
    ],
  },
  {
    label: "Compliance & intake",
    items: [
      { href: "/staff/registrations", label: "Registrations", icon: ClipboardCheck },
      { href: "/staff/consignor-kyc", label: "Consignor KYC", icon: ShieldCheck },
      { href: "/staff/consignment-requests", label: "Consignment requests", icon: Inbox },
    ],
  },
];

/** Derive the title for the top bar from the active route. */
function activeLabel(pathname: string): string {
  let best: NavItem | null = null;
  for (const section of SECTIONS) {
    for (const item of section.items) {
      const match =
        item.href === "/admin"
          ? pathname === "/admin"
          : pathname === item.href || pathname.startsWith(item.href + "/");
      if (match && (!best || item.href.length > best.href.length)) best = item;
    }
  }
  return best?.label ?? "Console";
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

function SidebarContent({
  email,
  pathname,
  onNavigate,
}: {
  email: string | null;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-ink text-paper">
      {/* Wordmark + console label */}
      <div className="border-b border-paper/10 px-6 py-6">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="font-serif text-2xl tracking-[0.2em] text-paper"
        >
          {SITE.name}
        </Link>
        <p className="mt-1 text-[0.6rem] uppercase tracking-[0.28em] text-paper/50">
          Operator console
        </p>
      </div>

      {/* Sectioned nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {SECTIONS.map((section) => (
          <div key={section.label} className="mb-6 last:mb-0">
            <p className="px-3 pb-2 text-[0.6rem] uppercase tracking-[0.22em] text-paper/40">
              {section.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-paper/70 hover:bg-paper/10 hover:text-paper"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* View site + account */}
      <div className="border-t border-paper/10 px-3 py-4">
        <Link
          href="/"
          onClick={onNavigate}
          className="mb-3 flex items-center gap-3 rounded-sm px-3 py-2 text-sm text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
        >
          <ArrowUpRight className="h-4 w-4 shrink-0" />
          View site
        </Link>
        <div className="rounded-sm bg-paper/5 px-3 py-3">
          <p className="truncate text-xs text-paper/60">{email ?? "Signed in"}</p>
          <div className="mt-1.5 [&_button]:text-paper/60 [&_button:hover]:text-paper">
            <SignOutButton />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConsoleShell({
  email,
  children,
}: {
  email: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const [open, setOpen] = useState(false);
  const title = activeLabel(pathname);

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
        <SidebarContent email={email} pathname={pathname} />
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-card/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile menu trigger */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line text-ink transition-colors hover:bg-ink hover:text-paper lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-paper/10 bg-ink p-0">
                <SidebarContent
                  email={email}
                  pathname={pathname}
                  onNavigate={() => setOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <h1 className="font-serif text-xl text-ink">{title}</h1>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-ink"
          >
            View site
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </header>

        {/* Full-width content area */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
