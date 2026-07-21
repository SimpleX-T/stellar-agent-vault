import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Info, ExternalLink, X } from "lucide-react";
import { useToasts, type ToastKind } from "../hooks/useToasts";

const ICON: Record<ToastKind, React.ReactNode> = {
  info: <Info className="size-4" />,
  pending: <Loader2 className="size-4 animate-spin" />,
  success: <CheckCircle2 className="size-4" />,
  error: <XCircle className="size-4" />,
};

// The icon chip carries the status color; the surface stays neutral so long
// technical strings never fight a loud background.
const CHIP: Record<ToastKind, string> = {
  info: "bg-purple/15 text-purple",
  pending: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
  error: "bg-coral/15 text-coral",
};

const EDGE: Record<ToastKind, string> = {
  info: "bg-purple",
  pending: "bg-warning",
  success: "bg-success",
  error: "bg-coral",
};

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2.5">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="glass pointer-events-auto relative flex gap-3 overflow-hidden rounded-2xl p-3.5 shadow-[0_20px_50px_-24px_var(--glow-1),0_8px_24px_-18px_rgba(0,0,0,0.55)]"
          >
            <span className={`absolute inset-y-2.5 left-0 w-[3px] rounded-full ${EDGE[t.kind]}`} />
            <span className={`mt-px grid size-7 shrink-0 place-items-center rounded-full ${CHIP[t.kind]}`}>
              {ICON[t.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold leading-tight">{t.title}</div>
              {t.message && (
                <div className="mt-1 line-clamp-3 break-words text-xs leading-snug text-muted-foreground">
                  {t.message}
                </div>
              )}
              {t.href && (
                <a
                  href={t.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-purple hover:underline"
                >
                  {t.hrefLabel ?? "View on explorer"} <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="-mr-1 -mt-1 size-6 shrink-0 rounded-lg text-muted-foreground/70 transition-colors hover:bg-secondary/60 hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="mx-auto size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
