import { cn } from "@/lib/utils";

/**
 * Breaks a section out of the global `max-w-6xl` <main> container so it can span
 * the FULL viewport width, while still sitting in normal document flow. Uses the
 * classic centred-breakout trick (`left-1/2 -ml-[50vw] w-screen`) which avoids
 * the horizontal scrollbar that a naive `100vw` causes.
 *
 * Inner content should re-apply its own padding/max-width if it needs to align
 * back to the page gutter.
 */
export function FullBleed({
  children,
  className,
  as: Tag = "section",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div";
}) {
  return (
    <Tag
      className={cn(
        "relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen",
        className
      )}
    >
      {children}
    </Tag>
  );
}
