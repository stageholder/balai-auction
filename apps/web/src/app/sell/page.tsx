import { SellForm } from "./sell-form";

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
    <div className="mx-auto max-w-3xl">
      {/* ── Editorial intro ── */}
      <section className="max-w-2xl">
        <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          Consign with the house
        </p>
        <h1 className="mt-4 font-serif text-6xl font-light leading-[0.95] tracking-tight text-ink">
          Sell with us
        </h1>
        <p className="mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground">
          A single inherited piece or a collection built over a lifetime — the
          first step is the same. Tell our specialists what you have, and we'll
          come back to you with an honest appraisal and a likely estimate.
          There's no fee to enquire, and no obligation to sell.
        </p>
      </section>

      {/* ── How it works ── */}
      <section
        aria-label="How consigning works"
        className="mt-14 grid gap-px border border-line bg-line sm:grid-cols-3"
      >
        {STEPS.map((step) => (
          <div key={step.n} className="bg-paper px-6 py-7">
            <p className="tnum font-sans text-[11px] tracking-[0.22em] text-primary">
              {step.n}
            </p>
            <h2 className="mt-3 font-serif text-2xl font-light leading-none text-ink">
              {step.title}
            </h2>
            <p className="mt-3 font-sans text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </div>
        ))}
      </section>

      {/* ── The form ── */}
      <section className="mt-16 border-t border-line pt-12">
        <SellForm />
      </section>
    </div>
  );
}
