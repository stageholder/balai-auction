"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export interface HeroSlide {
  src: string;
  alt: string;
}

const INTERVAL_MS = 5500;

export function HomeHero({
  slides,
  saleId,
  saleTitle,
  eyebrow,
}: {
  slides: HeroSlide[];
  saleId: string | null;
  saleTitle: string | null;
  eyebrow: string;
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (slides.length <= 1 || paused || reducedMotion.current) return;
    const t = setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [slides.length, paused]);

  return (
    <section
      aria-label="Featured sale"
      className="relative h-[78vh] min-h-[34rem] w-full overflow-hidden bg-ink"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slides — cross-fade, no layout shift */}
      {slides.map((slide, i) => (
        <div
          key={slide.src + i}
          aria-hidden={i !== active}
          className={`absolute inset-0 transition-opacity duration-1000 ease-out ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={slide.src}
            alt={i === active ? slide.alt : ""}
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ))}

      {/* Legibility scrim — deep on the left where the copy sits */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/55 to-ink/20"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-ink/25"
      />

      {/* Copy + CTAs */}
      <div className="relative mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pb-16">
        <p className="font-sans text-[11px] uppercase tracking-[0.34em] text-paper/75">
          {eyebrow}
        </p>
        <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[0.98] tracking-tight text-paper md:text-7xl">
          Art and collections,
          <br />
          brought to the rostrum.
        </h1>
        {saleTitle ? (
          <p className="mt-6 max-w-xl font-sans text-sm leading-relaxed text-paper/80">
            Now on view — <span className="text-paper">{saleTitle}</span>. Live
            sales, the upcoming calendar, and results from the room, open to
            browse with no account required.
          </p>
        ) : (
          <p className="mt-6 max-w-xl font-sans text-sm leading-relaxed text-paper/80">
            Live sales, the upcoming calendar, and results from the room — open
            to browse, no account required.
          </p>
        )}

        <div className="mt-9 flex flex-wrap items-center gap-3">
          {saleId ? (
            <Button asChild size="lg" variant="accent">
              <Link href={`/sales/${saleId}`}>Browse the sale</Link>
            </Button>
          ) : null}
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-paper/40 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
          >
            <Link href="/auctions">View all auctions</Link>
          </Button>
        </div>

        {/* Progress dots */}
        {slides.length > 1 ? (
          <div className="mt-10 flex items-center gap-2">
            {slides.map((slide, i) => (
              <button
                key={"dot-" + slide.src + i}
                type="button"
                aria-label={`Show slide ${i + 1}`}
                aria-current={i === active}
                onClick={() => setActive(i)}
                className="group/dot h-3 py-1"
              >
                <span
                  className={`block h-px w-10 transition-all duration-500 ${
                    i === active
                      ? "bg-paper"
                      : "bg-paper/35 group-hover/dot:bg-paper/60"
                  }`}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Wordmark watermark, top-right */}
      <span
        aria-hidden="true"
        className="absolute right-6 top-6 font-serif text-sm tracking-[0.3em] text-paper/70"
      >
        {SITE.name}
      </span>
    </section>
  );
}
