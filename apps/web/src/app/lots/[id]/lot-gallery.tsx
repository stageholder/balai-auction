"use client";

import { useRef, useState } from "react";
import Image from "next/image";

/**
 * Lot image gallery: a main 4:5 image with a cursor-following hover-zoom
 * (magnifies toward the pointer), plus a thumbnail strip when the lot has more
 * than one image. Falls back gracefully to a single image or a placeholder.
 */
export function LotGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const frameRef = useRef<HTMLDivElement>(null);

  const src = images[active];

  function onMove(e: React.MouseEvent) {
    const el = frameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setOrigin(`${x}% ${y}%`);
  }

  if (!src) {
    return (
      <div className="relative flex aspect-[4/5] items-center justify-center bg-line">
        <span className="font-sans text-xs uppercase tracking-widest text-muted-foreground opacity-40">
          Image unavailable
        </span>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={frameRef}
        onMouseEnter={() => setZoom(true)}
        onMouseLeave={() => setZoom(false)}
        onMouseMove={onMove}
        className="relative aspect-[4/5] cursor-zoom-in overflow-hidden bg-line"
      >
        <Image
          key={src}
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 55vw"
          priority
          className="object-cover transition-transform duration-200 ease-out will-change-transform"
          style={{
            transform: zoom ? "scale(2.2)" : "scale(1)",
            transformOrigin: origin,
          }}
        />
        {!zoom ? (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-sm bg-ink/60 px-2 py-1 font-sans text-[9px] uppercase tracking-[0.18em] text-paper backdrop-blur-sm">
            Hover to zoom
          </span>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((img, i) => (
            <button
              key={img + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === active}
              className={`relative h-16 w-14 overflow-hidden rounded-sm border transition-colors ${
                i === active
                  ? "border-ink"
                  : "border-line hover:border-muted-foreground"
              }`}
            >
              <Image src={img} alt="" fill sizes="56px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
