import Image from "next/image";
import { SellForm } from "./sell-form";
import { FullBleed } from "@/components/full-bleed";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "Sell with us",
  description:
    "Consign a single piece or a collection. Tell our specialists what you have and we'll write back with our thoughts and a likely estimate — no obligation.",
};

const STEPS = [
  {
    n: "01",
    title: "Tell us about it",
    body: "Share a few details and, where you can, what you know of its history.",
  },
  {
    n: "02",
    title: "We appraise it",
    body: "A specialist reviews your piece and replies with our thoughts and an estimate.",
  },
  {
    n: "03",
    title: "We bring it to sale",
    body: "If it's right for us, we catalogue, market, and present it to our bidders.",
  },
];

export default function SellPage() {
  return (
    <div>
      {/* ── Full-bleed editorial band ── */}
      <FullBleed className="mb-16">
        <div className="relative h-[clamp(20rem,42vh,30rem)] overflow-hidden bg-ink">
          <Image
            src="/seed/jewellery-3.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-90"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/45"
          />
          <div className="absolute inset-0 flex items-end">
            <div className="mx-auto w-full max-w-6xl px-6 pb-12">
              <p className="font-sans text-[11px] uppercase tracking-[0.32em] text-paper/75">
                {SITE.name} · Consign with the house
              </p>
              <h1 className="mt-4 max-w-2xl font-serif text-5xl font-light leading-[0.96] tracking-tight text-paper md:text-6xl">
                Sell with us
              </h1>
            </div>
          </div>
        </div>
      </FullBleed>

      <div className="mx-auto max-w-3xl">
        {/* ── Editorial intro ── */}
        <section className="max-w-2xl">
          <span aria-hidden className="block h-px w-12 bg-primary" />
          <p className="mt-6 font-sans text-base leading-relaxed text-muted-foreground">
            A single inherited piece or a collection built over a lifetime — the
            first step is the same. Tell our specialists what you have, and we'll
            come back to you with an honest appraisal and a likely estimate.
            There's no fee to enquire, and no obligation to sell.
          </p>
        </section>

        {/* ── How it works ── */}
        <section
          aria-label="How consigning works"
          className="mt-14 grid gap-5 sm:grid-cols-3"
        >
          {STEPS.map((step) => (
            <Card key={step.n} className="shadow-sm">
              <CardHeader>
                <p className="tnum font-sans text-[11px] tracking-[0.22em] text-primary">
                  {step.n}
                </p>
                <CardTitle className="mt-2 text-2xl font-light leading-none">
                  {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <CardDescription className="leading-relaxed">
                  {step.body}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* ── The form ── */}
        <section className="mt-16 border-t border-line pt-12">
          <SellForm />
        </section>
      </div>
    </div>
  );
}
