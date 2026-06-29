import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-10 w-full rounded-lg border border-input bg-background/40 px-3 text-sm text-foreground tnum",
      "placeholder:text-muted-foreground/70 outline-none transition-all",
      "focus:border-[color-mix(in_oklch,var(--neon-cyan)_55%,var(--border))] focus:ring-2 focus:ring-neon-cyan/25",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
