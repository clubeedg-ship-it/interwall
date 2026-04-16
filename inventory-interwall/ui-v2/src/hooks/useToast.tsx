import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ToastKind = "success" | "warning" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  createdAt: number;
}

interface ToastValue {
  push: (kind: ToastKind, message: string) => void;
}

const Ctx = createContext<ToastValue | null>(null);

const DURATION_MS: Record<ToastKind, number> = {
  success: 7500,
  warning: 9000,
  error: 12000,
  info: 6000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastValue["push"]>(
    (kind, message) => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((cur) => [...cur, { id, kind, message, createdAt: Date.now() }]);
      const ttl = DURATION_MS[kind];
      window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {createPortal(<ToastHost toasts={toasts} onDismiss={dismiss} />, document.body)}
    </Ctx.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-6 top-6 z-[100] flex w-[min(420px,92vw)] flex-col gap-2">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const accent = accentFor(toast.kind);
  return (
    <div
      role="status"
      className="pointer-events-auto anim-fade-slide-in flex items-start gap-3 rounded-[var(--radius-md)] border bg-[var(--color-bg-elevated)]/95 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm"
      style={{ borderColor: accent.border }}
    >
      <span
        aria-hidden
        className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
        style={{ background: accent.dot, boxShadow: `0 0 10px ${accent.dot}` }}
      />
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--color-text)]">
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-[12px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

function accentFor(kind: ToastKind): { border: string; dot: string } {
  switch (kind) {
    case "success":
      return {
        border: "color-mix(in oklab, var(--color-pulse-healthy) 40%, transparent)",
        dot: "var(--color-pulse-healthy)",
      };
    case "warning":
      return {
        border: "color-mix(in oklab, var(--color-pulse-warning) 45%, transparent)",
        dot: "var(--color-pulse-warning)",
      };
    case "error":
      return {
        border: "color-mix(in oklab, var(--color-pulse-critical) 45%, transparent)",
        dot: "var(--color-pulse-critical)",
      };
    case "info":
    default:
      return {
        border: "var(--color-accent-border)",
        dot: "var(--color-accent)",
      };
  }
}
