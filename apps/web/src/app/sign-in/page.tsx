import Image from "next/image";
import { AuthForm } from "@/components/auth/auth-form";
import { SITE } from "@/lib/site";

export default function SignInPage() {
  return (
    <div className="py-12 sm:py-16">
      <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-sm border border-line bg-card shadow-sm md:grid-cols-2">
        {/* ── Image panel (editorial, hidden on small screens) ── */}
        <div className="relative hidden min-h-[34rem] bg-ink md:block">
          <Image
            src="/seed/watches-2.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 0px, 32rem"
            className="object-cover opacity-90"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/35 to-ink/20"
          />
          <div className="absolute inset-x-0 bottom-0 p-9">
            <p className="font-sans text-[11px] uppercase tracking-[0.32em] text-paper/75">
              {SITE.name}
            </p>
            <p className="mt-3 max-w-xs font-serif text-2xl font-light leading-tight tracking-tight text-paper">
              The saleroom, the calendar, and your bids — in one account.
            </p>
          </div>
        </div>

        {/* ── Form panel ── */}
        <div className="flex flex-col justify-center px-8 py-12 sm:px-12">
          <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            Auction House
          </p>
          <h1 className="mt-4 font-serif text-4xl font-light leading-none tracking-tight text-ink">
            Sign in
          </h1>
          <span aria-hidden className="mt-6 block h-px w-12 bg-primary" />
          <div className="mt-8">
            <AuthForm mode="sign-in" />
          </div>
        </div>
      </div>

      <p className="mt-6 text-center font-sans text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
        — Est. MMXXIV —
      </p>
    </div>
  );
}
