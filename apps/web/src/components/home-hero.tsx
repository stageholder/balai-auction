"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

  const count = slides.length;
  const go = useCallback(
    (dir: 1 | -1) => setActive((i) => (i + dir + count) % count),
    [count]
  );

  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (count <= 1 || paused || reducedMotion.current) return;
    const t = setInterval(() => setActive((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(t);
  }, [count, paused]);

  return (
    <section
      aria-label="Featured sale"
      className="relative grid grid-cols-1 lg:grid-cols-2"
    >
      {/* LEFT — copy + CTAs on a bright paper panel, fully legible */}
      <div className="order-2 flex flex-col justify-center bg-paper px-6 py-14 sm:px-10 lg:order-1 lg:min-h-[70vh] lg:px-16">
        <div className="w-full max-w-xl lg:ml-auto lg:mr-0 lg:max-w-lg">
          <p className="font-sans text-[11px] uppercase tracking-[0.34em] text-muted-foreground">
            {eyebrow}
          </p>
          <h1 className="mt-5 font-serif text-5xl leading-[0.98] tracking-tight text-ink md:text-6xl">
            Art and collections,
            <br />
            brought to the rostrum.
          </h1>
          {saleTitle ? (
            <p className="mt-6 max-w-md font-sans text-sm leading-relaxed text-muted-foreground">
              Now on view — <span className="text-ink">{saleTitle}</span>. Live
              sales, the upcoming calendar, and results from the room, open to
              browse with no account required.
            </p>
          ) : (
            <p className="mt-6 max-w-md font-sans text-sm leading-relaxed text-muted-foreground">
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
            <Button asChild size="lg" variant="outline">
              <Link href="/auctions">View all auctions</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* RIGHT — featured imagery; the slideshow lives here, contained */}
      <div
        className="relative order-1 min-h-[44vh] overflow-hidden border-line bg-secondary lg:order-2 lg:min-h-[70vh] lg:border-l"
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

        {/* Wordmark watermark, top-right of the image */}
        <span
          aria-hidden="true"
          className="absolute right-5 top-5 font-serif text-sm tracking-[0.3em] text-paper drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]"
        >
          {SITE.name}
        </span>

        {/* Slide indicators */}
        {count > 1 ? (
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

      {/* Edge controls — change the slideshow from either side of the hero */}
      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous featured lot"
            onClick={() => go(-1)}
            className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-ink/15 bg-paper/80 p-2.5 text-ink backdrop-blur-sm transition-colors hover:bg-paper lg:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next featured lot"
            onClick={() => go(1)}
            className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-paper/25 bg-ink/35 p-2.5 text-paper backdrop-blur-sm transition-colors hover:bg-ink/55 lg:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : null}
    </section>
  );
}
