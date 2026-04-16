import { useEffect, type ReactNode } from "react";

export type ModalSize = "sm" | "md" | "lg";

const SIZE_CLS: Record<ModalSize, string> = {
  sm: "w-[min(96vw,560px)] max-h-[78vh]",
  md: "w-[min(96vw,780px)] max-h-[85vh]",
  // lg keeps the wide aspect of the original modal but shrinks overall.
  lg: "w-[min(96vw,980px)] max-h-[80vh]",
};

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  size = "lg",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  size?: ModalSize;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="anim-backdrop-in fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-bg-overlay)] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`anim-modal-in relative flex ${SIZE_CLS[size]} flex-col overflow-hidden rounded-[8px] border border-[var(--color-line-strong)] bg-[var(--color-bg-elevated)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
