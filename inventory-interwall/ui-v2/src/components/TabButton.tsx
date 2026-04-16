/*
  Shared tab control — underline-accented, mono badge at end.
  Used by BuildsPage (Active / Pending verification), ProfitPage
  (Active / Backorder), and WallPage (zone tabs). Keep visuals identical
  across pages so the operator learns the pattern once.
*/

export function TabButton({
  label,
  active,
  onClick,
  badge,
  attention,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Numeric badge shown at the end of the label. Hidden when 0 or undefined. */
  badge?: number;
  /** When true, non-zero badge flips to warning-pulse styling. */
  attention?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[12.5px] font-medium uppercase tracking-[0.12em] transition-colors",
        active
          ? "border-[var(--color-accent)] text-[var(--color-text)]"
          : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
      ].join(" ")}
    >
      <span>{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span
          className={[
            "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums",
            attention
              ? "bg-[var(--color-pulse-warning)] text-[#0a0d13] shadow-[0_0_8px_var(--color-pulse-warning-glow)]"
              : "bg-[var(--color-glass-strong)] text-[var(--color-text-dim)]",
          ].join(" ")}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
