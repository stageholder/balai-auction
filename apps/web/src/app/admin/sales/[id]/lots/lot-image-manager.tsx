"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import type { MediaAssetRecord } from "@auction/db";

export type RemoveLotImageResult = { ok: true } | { ok: false; error: string };

/**
 * Manages a lot's existing catalogue images: shows the current gallery and
 * deletes individual images via a bound server action. Buttons are type=button
 * and call the action programmatically, so this composes safely inside the
 * enclosing lot <form> without nesting forms.
 */
export function LotImageManager({
  initial,
  removeAction,
}: {
  initial: MediaAssetRecord[];
  removeAction: (mediaId: string) => Promise<RemoveLotImageResult>;
}) {
  const [images, setImages] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (images.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No images yet. Add the first below — the earliest becomes the lead image.
      </p>
    );
  }

  function remove(mediaId: string) {
    setError(null);
    setPendingId(mediaId);
    startTransition(async () => {
      const res = await removeAction(mediaId);
      if (res.ok) {
        setImages((prev) => prev.filter((m) => m.id !== mediaId));
      } else {
        setError(res.error);
      }
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-2">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((m, i) => (
          <li
            key={m.id}
            className="group relative aspect-square overflow-hidden border border-line bg-line/30"
          >
            {m.url ? (
              <Image
                src={m.url}
                alt=""
                fill
                sizes="120px"
                className="object-cover"
                unoptimized
              />
            ) : null}
            {i === 0 ? (
              <span className="absolute left-1 top-1 bg-ink/80 px-1.5 py-0.5 text-[0.55rem] uppercase tracking-[0.1em] text-paper">
                Lead
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => remove(m.id)}
              disabled={pendingId === m.id}
              aria-label="Remove image"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center bg-ink/80 text-paper opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-primary">
          {error}
        </p>
      ) : null}
    </div>
  );
}
