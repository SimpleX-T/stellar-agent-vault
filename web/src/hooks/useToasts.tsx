import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "info" | "pending" | "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  href?: string;
  hrefLabel?: string;
}

interface ToastCtx {
  toasts: Toast[];
  notify: (t: Omit<Toast, "id">) => number;
  update: (id: number, patch: Partial<Toast>) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);
let seq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = seq++;
      setToasts((cur) => [...cur, { ...t, id }]);
      if (t.kind === "success" || t.kind === "info") {
        setTimeout(() => dismiss(id), 6500);
      }
      return id;
    },
    [dismiss],
  );

  const update = useCallback(
    (id: number, patch: Partial<Toast>) => {
      setToasts((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      if (patch.kind === "success") setTimeout(() => dismiss(id), 6500);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={{ toasts, notify, update, dismiss }}>
      {children}
    </Ctx.Provider>
  );
}

export function useToasts(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToasts must be used within ToastProvider");
  return ctx;
}
