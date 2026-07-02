"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, FileText, X } from "lucide-react";

interface Picked {
  name: string;
  /** Object URL for images; null for non-image files (e.g. PDF). */
  preview: string | null;
  isImage: boolean;
}

/**
 * Controlled multi-file picker with thumbnail previews and per-file removal.
 * The underlying <input type="file"> IS the submission source: removing a file
 * rebuilds its FileList via DataTransfer, so the enclosing <form> posts exactly
 * what the user sees under `name`. Object URLs are revoked to avoid leaks.
 */
export function FilePicker({
  name,
  accept,
  maxFiles = 8,
  label,
  hint,
}: {
  name: string;
  accept: string;
  maxFiles?: number;
  label: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);

  // Revoke any outstanding object URLs on unmount.
  useEffect(() => {
    return () => {
      picked.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    picked.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    const files = Array.from(inputRef.current?.files ?? []);
    setPicked(
      files.map((f) => {
        const isImage = f.type.startsWith("image/");
        return {
          name: f.name,
          isImage,
          preview: isImage ? URL.createObjectURL(f) : null,
        };
      })
    );
  }

  function onChange() {
    const input = inputRef.current;
    if (!input?.files) return;
    // Enforce the ceiling by trimming the selection back into the input.
    if (input.files.length > maxFiles) {
      const dt = new DataTransfer();
      Array.from(input.files)
        .slice(0, maxFiles)
        .forEach((f) => dt.items.add(f));
      input.files = dt.files;
    }
    sync();
  }

  function removeAt(index: number) {
    const input = inputRef.current;
    if (!input?.files) return;
    const dt = new DataTransfer();
    Array.from(input.files).forEach((f, i) => i !== index && dt.items.add(f));
    input.files = dt.files;
    sync();
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor={name}
        className="block text-xs uppercase tracking-[0.15em] text-muted-foreground"
      >
        {label}
      </label>

      <label
        htmlFor={name}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-line bg-paper px-6 py-8 text-center transition-colors hover:border-ink"
      >
        <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden />
        <span className="text-sm text-ink">
          {picked.length > 0
            ? "Add or replace files"
            : "Choose files or drag them here"}
        </span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
        <input
          ref={inputRef}
          id={name}
          name={name}
          type="file"
          accept={accept}
          multiple
          onChange={onChange}
          className="sr-only"
        />
      </label>

      {picked.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {picked.map((p, i) => (
            <li
              key={`${p.name}-${i}`}
              className="group relative aspect-square overflow-hidden border border-line bg-line/30"
            >
              {p.isImage && p.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.preview}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                  <FileText className="h-6 w-6 text-muted-foreground" aria-hidden />
                  <span className="line-clamp-2 text-[0.6rem] text-muted-foreground">
                    {p.name}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Remove ${p.name}`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center bg-ink/80 text-paper opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
