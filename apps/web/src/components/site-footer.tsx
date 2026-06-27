import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-10 text-xs text-muted">
        © {SITE.name} — {SITE.tagline}
      </div>
    </footer>
  );
}
