import { useToasts, type ToastKind } from "../hooks/useToasts";

const ICON: Record<ToastKind, string> = {
  info: "›",
  pending: "◴",
  success: "✓",
  error: "✕",
};

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} role="status">
          <span className={`toast__icon ${t.kind === "pending" ? "spin" : ""}`}>
            {ICON[t.kind]}
          </span>
          <div className="toast__body">
            <div className="toast__title">{t.title}</div>
            {t.message && <div className="toast__msg">{t.message}</div>}
            {t.href && (
              <a className="toast__link" href={t.href} target="_blank" rel="noreferrer">
                {t.hrefLabel ?? "View on explorer"} ↗
              </a>
            )}
          </div>
          <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
