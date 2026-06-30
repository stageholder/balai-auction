"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export interface HeroSlide {
  image: string | null;
  /** "live" | "scheduled" | "closed" — drives the accent + label colour. */
  status: string;
  statusLabel: string;
  departmentLabel: string | null;
  title: string;
  blurb: string;
  href: string;
}

const INTERVAL_MS = 6500;

export function HomeHero({ slides }: { slides: HeroSlide[] }) {
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

  if (count === 0) return null;
  const slide = slides[active];
  const isLive = slide.status === "live";

  return (
    <section
      aria-label="Featured sales"
      aria-roledescription="carousel"
      className="relative grid grid-cols-1 lg:grid-cols-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* LEFT — per-slide copy + CTAs on a warm paper panel, fully legible */}
      <div className="order-2 flex flex-col justify-center bg-secondary/40 px-6 py-16 sm:px-10 lg:order-1 lg:min-h-[72vh] lg:px-16">
        <div
          key={active}
          className="w-full max-w-xl duration-700 animate-in fade-in slide-in-from-bottom-2 lg:ml-auto lg:mr-0 lg:max-w-lg"
        >
          <p className="flex items-center gap-2.5 font-sans text-[11px] uppercase tracking-[0.28em]">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                {slide.statusLabel}
              </span>
            ) : (
              <span className="text-muted-foreground">{slide.statusLabel}</span>
            )}
            {slide.departmentLabel ? (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="text-muted-foreground">
                  {slide.departmentLabel}
                </span>
              </>
            ) : null}
          </p>

          <h1 className="mt-5 font-serif text-[2.7rem] leading-[1.02] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            {slide.title}
          </h1>

          <p className="mt-5 line-clamp-3 max-w-md font-sans text-sm leading-relaxed text-muted-foreground">
            {slide.blurb}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="accent">
              <Link href={slide.href}>
                {isLive ? "Bid in this sale" : "Browse the sale"}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/auctions">View all auctions</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* RIGHT — the featured image; cross-fades with the copy */}
      <div className="relative order-1 min-h-[46vh] overflow-hidden border-line bg-secondary lg:order-2 lg:min-h-[72vh] lg:border-l">
        {slides.map((s, i) => (
          <div
            key={s.href + i}
            aria-hidden={i !== active}
            className={`absolute inset-0 transition-opacity duration-[900ms] ease-out ${
              i === active ? "opacity-100" : "opacity-0"
            }`}
          >
            {s.image ? (
              <Image
                src={s.image}
                alt={i === active ? s.title : ""}
                fill
                priority={i === 0}
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-ink">
                <span className="font-serif text-2xl tracking-[0.3em] text-paper/70">
                  {SITE.name}
                </span>
              </div>
            )}
          </div>
        ))}

        <span
          aria-hidden="true"
          className="absolute right-5 top-5 font-serif text-sm tracking-[0.3em] text-paper drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]"
        >
          {SITE.name}
        </span>

        {count > 1 ? (
          <div className="absolute bottom-5 left-5 flex items-center gap-2">
            {slides.map((s, i) => (
              <button
                key={"dot-" + s.href + i}
                type="button"
                aria-label={`Show featured sale ${i + 1}`}
                aria-current={i === active}
                onClick={() => setActive(i)}
                className="group/dot h-4 py-1.5"
              >
                <span
                  className={`block h-px transition-all duration-500 ${
                    i === active
                      ? "w-9 bg-paper"
                      : "w-5 bg-paper/45 group-hover/dot:bg-paper/75"
                  }`}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Edge controls */}
      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous featured sale"
            onClick={() => go(-1)}
            className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-ink/15 bg-paper/85 p-2.5 text-ink shadow-sm backdrop-blur-sm transition-colors hover:bg-paper lg:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next featured sale"
            onClick={() => go(1)}
            className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-paper/25 bg-ink/40 p-2.5 text-paper backdrop-blur-sm transition-colors hover:bg-ink/60 lg:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : null}
    </section>
  );
}
