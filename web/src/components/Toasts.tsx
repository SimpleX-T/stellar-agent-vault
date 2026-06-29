import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Info, ExternalLink, X } from "lucide-react";
import { useToasts, type ToastKind } from "../hooks/useToasts";

const ICON: Record<ToastKind, React.ReactNode> = {
  info: <Info className="size-4 text-neon-cyan" />,
  pending: <Loader2 className="size-4 animate-spin text-warning" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  error: <XCircle className="size-4 text-destructive" />,
};

const RAIL: Record<ToastKind, string> = {
  info: "before:bg-neon-cyan",
  pending: "before:bg-warning",
  success: "before:bg-success",
  error: "before:bg-destructive",
};

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2.5">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={`glass pointer-events-auto relative flex gap-3 overflow-hidden rounded-xl p-3.5 pl-4 shadow-[0_16px_40px_-16px_var(--glow-1)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${RAIL[t.kind]}`}
          >
            <span className="mt-0.5 shrink-0">{ICON[t.kind]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold leading-tight">{t.title}</div>
              {t.message && (
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{t.message}</div>
              )}
              {t.href && (
                <a
                  href={t.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-neon-cyan hover:underline"
                >
                  {t.hrefLabel ?? "View on explorer"} <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-muted-foreground/70 transition-colors hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
