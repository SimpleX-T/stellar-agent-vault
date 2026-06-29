import { forwardRef } from "react";
import { cn } from "../../lib/utils";

type Variant = "neon" | "outline" | "ghost" | "secondary";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  neon: "btn-neon font-semibold",
  outline:
    "border border-border bg-card/40 text-foreground hover:border-[color-mix(in_oklch,var(--neon-cyan)_45%,var(--border))] hover:bg-card/70",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
  secondary: "bg-secondary text-secondary-foreground hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-12 px-6 text-base rounded-lg",
  icon: "size-9 rounded-md",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "neon", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
