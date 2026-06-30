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
      className="grid grid-cols-1 lg:grid-cols-2"
    >
      {/* LEFT — copy + CTAs on a solid ink panel, fully legible */}
      <div className="order-2 flex flex-col justify-center bg-ink px-6 py-14 sm:px-10 lg:order-1 lg:min-h-[70vh] lg:px-16">
        <div className="w-full max-w-xl lg:ml-auto lg:mr-0 lg:max-w-lg">
          <p className="font-sans text-[11px] uppercase tracking-[0.34em] text-paper/70">
            {eyebrow}
          </p>
          <h1 className="mt-5 font-serif text-5xl leading-[0.98] tracking-tight text-paper md:text-6xl">
            Art and collections,
            <br />
            brought to the rostrum.
          </h1>
          {saleTitle ? (
            <p className="mt-6 max-w-md font-sans text-sm leading-relaxed text-paper/75">
              Now on view —{" "}
              <span className="text-paper">{saleTitle}</span>. Live sales, the
              upcoming calendar, and results from the room, open to browse with
              no account required.
            </p>
          ) : (
            <p className="mt-6 max-w-md font-sans text-sm leading-relaxed text-paper/75">
              Live sales, the upcoming calendar, and results from the room —
              open to browse, no account required.
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
        </div>
      </div>

      {/* RIGHT — featured imagery; the slideshow lives here, contained */}
      <div
        className="relative order-1 min-h-[44vh] overflow-hidden bg-secondary lg:order-2 lg:min-h-[70vh]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
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
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        ))}

        {/* Soft edge so the image meets the ink panel without a hard seam */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-ink/25 to-transparent lg:block"
        />

        {/* Wordmark watermark, top-right of the image */}
        <span
          aria-hidden="true"
          className="absolute right-5 top-5 font-serif text-sm tracking-[0.3em] text-paper drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]"
        >
          {SITE.name}
        </span>

        {/* Slide indicators */}
        {slides.length > 1 ? (
          <div className="absolute bottom-5 left-5 flex items-center gap-2">
            {slides.map((slide, i) => (
              <button
                key={"dot-" + slide.src + i}
                type="button"
                aria-label={`Show slide ${i + 1}`}
                aria-current={i === active}
                onClick={() => setActive(i)}
                className="group/dot h-4 py-1.5"
              >
                <span
                  className={`block h-px w-9 transition-all duration-500 ${
                    i === active
                      ? "bg-paper"
                      : "bg-paper/45 group-hover/dot:bg-paper/75"
                  }`}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
