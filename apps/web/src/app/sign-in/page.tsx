import { AuthForm } from "@/components/auth/auth-form";

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <div className="border border-line bg-paper px-10 py-12">
          <p className="mb-5 font-sans text-xs uppercase tracking-widest text-muted">
            Auction House
          </p>
          <h1 className="font-serif text-4xl leading-none text-ink">Sign In</h1>
          <div className="mb-8 mt-6 border-t border-line" />
          <AuthForm mode="sign-in" />
        </div>
        <p className="mt-6 text-center font-sans text-xs uppercase tracking-widest text-muted">
          — Est. MMXXIV —
        </p>
      </div>
    </div>
  );
}
