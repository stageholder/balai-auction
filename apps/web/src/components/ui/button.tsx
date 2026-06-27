import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium uppercase tracking-[0.12em] transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
  {
    variants: {
      variant: {
        solid: "bg-ink text-paper hover:bg-ink/90",
        outline: "border border-ink text-ink hover:bg-ink hover:text-paper",
        accent: "bg-accent text-paper hover:bg-accent/90",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4 text-xs",
      },
    },
    defaultVariants: { variant: "solid", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { buttonVariants };
