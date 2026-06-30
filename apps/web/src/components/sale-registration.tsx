import Link from "next/link";
import { prisma, getRegistration } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { RegisterToBidForm } from "@/app/sales/[id]/register-to-bid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** The call-to-register / registration-status panel on a live or scheduled
 *  sale. Bidding requires a one-time, per-sale registration that staff verify
 *  before the sale opens — this makes that explicit so it doesn't read as a
 *  sign-in problem. */
export async function SaleRegistration({ saleId }: { saleId: string }) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="rounded-sm border border-line bg-card p-6">
        <p className="font-serif text-xl">Register to bid</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Bidding in this sale requires a verified account. Sign in to register —
          it only takes a moment.
        </p>
        <Button asChild variant="accent" size="sm" className="mt-5">
          <Link href="/sign-in">Sign in to register</Link>
        </Button>
      </div>
    );
  }

  const registration = await getRegistration(prisma, user.id, saleId);

  if (!registration) {
    return (
      <div className="rounded-sm border border-line bg-card p-6">
        <p className="font-serif text-xl">Register to bid in this sale</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          You&rsquo;re signed in as{" "}
          <span className="text-ink">{user.email}</span>. Bidding requires a
          one-time registration for this sale — we verify your details before
          the sale opens, then you&rsquo;re cleared to place bids.
        </p>
        <div className="mt-5 max-w-sm">
          <RegisterToBidForm saleId={saleId} />
        </div>
      </div>
    );
  }

  const status: Record<
    string,
    { badge: "muted" | "default" | "destructive"; label: string; body: string }
  > = {
    pending: {
      badge: "muted",
      label: "Pending review",
      body: "Your registration is being verified. You’ll be cleared to bid once approved — usually before the sale opens.",
    },
    approved: {
      badge: "default",
      label: "Approved to bid",
      body: "You’re registered and cleared. Place your bids on any lot in this sale.",
    },
    rejected: {
      badge: "destructive",
      label: "Not approved",
      body: "Your registration for this sale was not approved. Please contact the saleroom for assistance.",
    },
  };
  const s = status[registration.kycStatus] ?? {
    badge: "muted" as const,
    label: "Registration",
    body: "Registration status unknown.",
  };

  return (
    <div className="rounded-sm border border-line bg-card p-6">
      <div className="flex items-center gap-3">
        <p className="font-serif text-xl">Your registration</p>
        <Badge variant={s.badge}>{s.label}</Badge>
      </div>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {s.body}
      </p>
    </div>
  );
}
