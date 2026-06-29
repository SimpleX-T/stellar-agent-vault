import { cn } from "../../lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-glass-border bg-secondary/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
